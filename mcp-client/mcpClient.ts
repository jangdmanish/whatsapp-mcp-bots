// host.ts
import "dotenv/config";
import { MCPClientWrapper } from "./mcpClientWrapper.ts";
import {initNotificationHandler} from "./handlers/huggingFaceHandler.ts";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
export async function McpClient(server_url: string) {

  // 1. Connect to custom MCP client wrapper
  const waMcpClient = new MCPClientWrapper("wa-mcp-client");
  await waMcpClient.connectToServer(server_url);

  // 2. Call the notification tool 
  await initNotificationHandler(waMcpClient);
  await waMcpClient.startNotificationTool();

  const rl = readline.createInterface({ input, output });
    try {
          console.log("\nWA MCP Client Started!");
          console.log("Type 'quit' to exit.\n");
          while (true) {
            const userPrompt = await rl.question("");
            if (userPrompt.toLowerCase() === "quit") {
              break;
            }
          }
    } catch(err){
      console.log("error in waNotificationHandler:", (err as any).toString());
    }finally {
      rl.close();
    }
}



