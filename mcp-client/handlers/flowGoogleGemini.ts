import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  type Content,
  GenerateContentResponse
} from "@google/genai";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MCPClientWrapper } from "../mcpClientWrapper.ts";

export async function googleGeminiFlow(mcp: MCPClientWrapper) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the environment");
  }
  const gemini_ai = new GoogleGenAI({ 'apiKey': apiKey });
  const tools = await mcp.getToolsForGoogleGemini();
  const toolNames = tools.map((t) => t.name ? t.name : "");
  console.log("🔧 MCP tools exposed to Gemini:", toolNames.map((t) => t));

  // 3. Simple CLI loop
  const rl = readline.createInterface({ input, output });

  try {
    console.log("\nMCP Client Started!");
    console.log("Type your queries or 'quit' to exit.");
    while (true) {
      const question = await rl.question("\nYour whatsapp query: ");
      if (question.toLowerCase() === "quit") {
        break;
      }
      // Conversation history in content format
      const conversation: Content[] = [
        {
          role: "user",
          parts: [{ text: question }],
        },
      ];

      // First turn: let the model optionally call tools
      const res: GenerateContentResponse = await gemini_ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: conversation,
        config: {
          tools: [{ functionDeclarations: tools }],
          toolConfig: {
            functionCallingConfig: {
              // Force it to call a tool, instead of answering directly
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: toolNames,
            },
          },
        },
      });

      const calls = res.functionCalls ?? [];

      //if model did not call any tool, print the direct answer
      if (!calls.length) {
        console.log("Model answered directly:", res.text);
        return;
      }

      for (const c of calls) {
        console.log(`-Gemini requested tool call: ${c.name} with args: `, c.args);
      }

      /**
       * 4. For *each* functionCall:
       *    - call MCP with same tool name
       *    - accumulate functionCall + functionResponse messages
       */

      type ToolExchange = {
        callName: string | undefined;
        callArgs: Record<string, unknown>;
        toolResult: unknown;
      };

      const exchanges: ToolExchange[] = [];

      for (const call of calls) {
        const toolName = call.name;
        const args = (call.args ?? {}) as Record<string, unknown>;

        if (!toolName) {
          console.warn("Skipping tool call with undefined name:", call);
          exchanges.push({
            callName: undefined, // preserve shape; tool call was skipped
            callArgs: args,
            toolResult: null,
          });
          continue;
        }

        const result = await mcp.callMcpToolAsJson(toolName, args);

        exchanges.push({
          callName: toolName, // important: use Gemini tool name here
          callArgs: args,
          toolResult: result,
        });
      }

      /**
       * 5. Build a second request with all functionCalls + functionResponses
       *    so Gemini can synthesize a final answer.
       */
      const followupConversation: Content[] = [
        {
          role: "user",
          parts: [{ text: question }],
        },
      ];

      for (const ex of exchanges) {
        followupConversation.push({
          role: "model",
          parts: [
            {
              functionCall: {
                name: ex.callName,
                args: ex.callArgs,
              },
            },
          ],
        });

        followupConversation.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: ex.callName,
                response: ex.toolResult as Record<string, unknown>,
              },
            },
          ],
        });
      }

      const followUp = await gemini_ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: followupConversation,
      
      });

      console.log("\nFinal Gemini answer:\n", followUp.text);
    }
  } finally {
    await mcp.close(); //clean up MCP connection
    rl.close();
  }
}
