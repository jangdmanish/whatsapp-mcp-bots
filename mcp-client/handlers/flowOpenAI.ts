// Minimal shape for a "message" output item

import OpenAI from "openai";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MCPClientWrapper } from "./mcpClientWrapper.ts";

// Minimal shape for a message output item
interface OutputMessageItem {
  type: "message";
  role: "assistant" | "user" | "system";
  content: Array<
    | { type: "output_text"; text: string }
    | { type: string;[key: string]: unknown }
  >;
}

// Minimal shape for a function tool call output item
interface FunctionCallItem {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string; // JSON string
  // ... other fields exist, but we don't need them here
}

// Input item representing a function call result
interface FunctionCallOutputItem {
  type: "function_call_output";
  call_id: string;
  output: string; // JSON string
  status?: "completed" | "incomplete";
}

// We’ll keep the generic input item type loose for brevity
type ResponseInputItem = any;
type ResponseOutputItem = OutputMessageItem | FunctionCallItem | any;
// --- OpenAI + MCP wiring ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


/**Alternate flow using OpenAI api  */
async function openAiFlow(mcp: MCPClientWrapper) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in the environment");
  }
  const tools: OpenAI.Responses.FunctionTool[] = await mcp.getOpenAITools();
  console.log("🔧 MCP tools exposed to OpenAI:", tools.map((t) => t.name));

  // 3. Simple CLI loop
  const rl = readline.createInterface({ input, output });

  try {
    console.log("\nMCP Client Started!");
    console.log("Type your queries or 'quit' to exit.");
    while (true) {
      const question = await rl.question("\nYou: ");
      if (question.toLowerCase() === "quit") {
        break;
      }
      // Conversation history in Responses format
      const conversation: ResponseInputItem[] = [
        {
          role: "user",
          content: [{ type: "input_text", text: question }],
        },
      ];

      // First turn: let the model optionally call tools
      const response: any = await openai.responses.create({
        model: "gpt-4o", // or gpt-4.1 / gpt-4.1-nano / gpt-4o / gpt-5 / etc.
        input: conversation,
        tools,
      });

      const outputItems: ResponseOutputItem[] = response.output ?? [];

      // Handle each output item (message or function_call)
      for (const item of outputItems) {
        if (item.type === "message") {
          const msg = item as OutputMessageItem;
          const textBlock = msg.content.find(
            (c) => c.type === "output_text"
          ) as { type: "output_text"; text: string } | undefined;

          if (textBlock) {
            console.log("\nAssistant:", textBlock.text);
          }
        }

        if (item.type === "function_call") {
          const call = item as FunctionCallItem;

          console.log(
            `\n📞 Model requested MCP tool "${call.name}" with args: ${call.arguments}`
          );

          // Parse arguments from JSON string
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = call.arguments ? JSON.parse(call.arguments) : {};
          } catch (err) {
            console.error("Failed to parse tool arguments:", err);
          }

          // 4. Call MCP server
          const mcpResult = await mcp.callTool(call.name, parsedArgs);

          // 5. Build function_call_output item and send a follow-up Responses request
          const callOutputItem: FunctionCallOutputItem = {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(mcpResult),
            status: "completed",
          };

          // Feed back both the original function_call and our output
          const followupInput: ResponseInputItem[] = [
            ...conversation,
            item,
            callOutputItem,
          ];

          const followup: any = await openai.responses.create({
            model: "gpt-4-o",
            input: followupInput,
          });

          const followupItems: ResponseOutputItem[] = followup.output ?? [];
          const finalMessage = followupItems.find(
            (o) => o.type === "message"
          ) as OutputMessageItem | undefined;

          const finalTextBlock = finalMessage?.content.find(
            (c) => c.type === "output_text"
          ) as { type: "output_text"; text: string } | undefined;

          if (finalTextBlock) {
            console.log("\nAssistant:", finalTextBlock.text);
          }
        }
      }
    }
  } finally {
    await mcp.close(); //clean up MCP connection
    rl.close();
  }
}