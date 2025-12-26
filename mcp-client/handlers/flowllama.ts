import askLlama from '../llama-main.mjs';
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MCPClientWrapper } from "../mcpClientWrapper.ts";

export async function llamaFlow(mcp: MCPClientWrapper) {
  const toolsResult = await mcp.getToolsForLlama();
  const toolDescription = toolsResult
    .map(t => `- ${t.name}: ${t.description}`)
    .join("\n");
  console.log("🔧 Tools exposed to node-llama:", toolDescription);

  //---------------- System Prompt (IMPORTANT) ---------------- //

  /**TO DO */
  /*
  const systemPrompt = ${JSON.stringify(toolsResult)}};
    .trim();

  // ================= AGENT LOOP ================= //
  async function runAgent(userPrompt: string): Promise<string> {
    let conversation = `
      System: ${systemPrompt}
      User: ${userPrompt}
      `.trim();
    let steps = 0;
    const MAX_STEPS = 6;
    //const raw: string = await askLlama(conversation);

    //Use huggingface inference client
      const client = new InferenceClient(process.env.HF_TOKEN);
       const answer = await session.chatCompletion({
            model: "meta-llama/Llama-3.1-8B-Instruct:sambanova",
            messages: prompt,
            temperature: 1.2,
            top_p: 0.7,
          });
    console.log("raw : ", chatCompletion.choices[0].message);
    return "";//raw;
    /*while (steps++ < MAX_STEPS) {
      const raw: string = await session.prompt(conversation,{functions=toolsResult});
      console.log("raw :"+ raw);
      let msg: AgentMessage;
      try {
        msg = JSON.parse(raw.trim()) as AgentMessage;
      } catch {
        throw new Error(
          `Model returned non-JSON output:\n${raw}`
        );
      }

      if (msg.type === "final") {
        return msg.answer;
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

        conversation += `
          Assistant: ${raw}
          Tool result:
          ${toolText}
          `;
        continue;
      }

      throw new Error("Invalid agent response shape");
    }

    throw new Error("Agent exceeded max steps");*/
}

//================= RUN ================= //
/*const answer = await runAgent(
  "List my 20 contacts"
);

console.log("\n✅ FINAL ANSWER:\n", answer);*/
