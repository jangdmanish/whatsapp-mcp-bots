import {McpClient} from "./mcpClient.ts";

//--Connect to a MCP server URL from command line or default--
//const args = process.argv.slice(2);
const serverUrl = 'http://localhost:3000/mcp';

async function main(): Promise<void> {
  //run MCP hoster with server script path argument
  await McpClient(serverUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
