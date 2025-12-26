import { InferenceClient } from "@huggingface/inference";
import { hardcodedPrompt, hardcodedPromptHelpfulAssistant, hardcodedPromptXXXAssistant } from '../prompts.ts';
import { type AgentMessage, type McpToolResult } from '../types.ts';
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MCPClientWrapper } from "../mcpClientWrapper.ts";
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

const client = new InferenceClient(process.env.HF_TOKEN);
let mcpGlobal: MCPClientWrapper;

type NotifData = {
  context: string,  //lid
  message: string
};

function isMcpToolResult(value: unknown): value is McpToolResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { content?: unknown };
  if (!Array.isArray(v.content)) return false;

  return v.content.every(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      (c as any).type === "text" &&
      typeof (c as any).text === "string"
  );
}

/** Console agent loop for WA **/
async function consoleAgent(mcp: MCPClientWrapper) {
  const rl = readline.createInterface({ input, output });
  const toolsResult = await mcp.getToolsForHuggingFace();
  const toolDescription = toolsResult
    .map(t => `- ${t.name}: ${t.description}`)
    .join("\n");
  console.log("🔧 Tools exposed to hugging face:", toolDescription);

  // ** System Prompt (IMPORTANT) ** //
  const systemPrompt = (hardcodedPrompt + `${JSON.stringify(toolsResult)}`).trim();
  try {
    console.log("\nWA MCP Client Started!");
    console.log("Type your WA query or 'quit' to exit.");
    while (true) {
      const userPrompt = await rl.question("\nYour wa query: ");
      if (userPrompt.toLowerCase() === "quit") {
        break;
      }

      let conversation = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]

      let steps = 0;
      const MAX_STEPS = 6;

      // ** Use huggingface inference client **//
      const client = new InferenceClient(process.env.HF_TOKEN);

      while (steps++ < MAX_STEPS) {
        const answer = await client.chatCompletion({
          model: "meta-llama/Llama-3.1-8B-Instruct:sambanova",
          messages: conversation,
          temperature: 1.2,
          top_p: 0.7,
        });
        let raw = answer.choices[0].message.content ?? "{}";
        console.log("raw :" + raw);
        let msg: AgentMessage;
        try {
          msg = JSON.parse(raw.trim()) as AgentMessage;
        } catch {
          throw new Error(
            `Model returned non-JSON output:\n${raw}`
          );
        }

        if (msg.type === "final") {
          console.log("Final : " + msg.answer);
        }

        if (msg.type === "tool_call") {
          const resultUnknown = await mcp.callTool(
            msg.tool,
            msg.arguments,
          );

          if (!isMcpToolResult(resultUnknown)) {
            throw new Error("Invalid MCP tool response");
          }

          const toolText = resultUnknown.content[0].text;
          if (typeof toolText !== "string") {
            throw new Error("Invalid tool response");
          }
          console.log("Tool result :" + toolText);
          conversation.push({ "role": "user", "content": toolText });

          continue;
        }

        throw new Error("Invalid agent response shape");
      }

      throw new Error("Agent exceeded max steps");
    };
  } finally {
    //clean up MCP connection
    await mcp.close();
    rl.close();
  }
}

/** WA Notification Handler with botwise sorting**/
export async function initNotificationHandler(mcp: MCPClientWrapper) {
  mcpGlobal = mcp;
  mcp.getClient().setNotificationHandler(LoggingMessageNotificationSchema, notification => {
    if (notification.params.level === 'info') {
      handleIncomingNotification(notification.params.data);
    } else {
      return
    }
  });
}

function handleIncomingNotification(notifData: unknown) {
  const data = JSON.stringify(notifData);
  console.log('Incoming msg : ' + data);
  const jsonData: NotifData = JSON.parse(data);
  const msg = jsonData.message;
  const jid = jsonData.context;
  console.log(`Incoming msg : JID: ${jid} Message: ${msg}`);//(${msg.trim().split(/@mbot/g).join(" ")}`);

  //call mbot or xbot handler based on message content
  if (msg.includes("@mbot")) {
    handleMbotMessage(jid, msg.trim().split(/@mbot/g).join(" "));
  } else if (msg.includes("@xbot")) {
    handleXbotMessage(jid, msg.trim().split(/@xbot/g).join(" "));
  }
}

/** MBot is a general purpose anser bot */
async function handleMbotMessage(jid: string, message: string) {
  let conversation = [
    { role: "system", content: hardcodedPromptHelpfulAssistant },
    { role: "user", content: message }
  ]
  const response = await client.chatCompletion({
    model: "meta-llama/Llama-3.1-8B-Instruct:sambanova",
    messages: conversation,
    temperature: 1.2,
    top_p: 0.7,
  });
  if (!response.choices[0].message.content) {
    console.log("No response from MBot");
    return;
  }
  const botResponse = response.choices[0].message.content as string;
  respondWAMessage(jid, botResponse)
}

/** XBot is an adult content specific answer bot */
function handleXbotMessage(jid: string, response: string) {
  console.log(`Responding to WA msg: ${response}`);
  mcpGlobal.callTool("send_message", { recipient: jid, message: response });
}

function respondWAMessage(jid: string, response: string) {
  console.log(`Responding to WA msg: ${response}`);
  mcpGlobal.callTool("send_message", { recipient: jid, message: "*MBot* \n" + response });
}