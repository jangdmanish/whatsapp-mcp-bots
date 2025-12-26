import { FastMCP } from "fastmcp";
import { z } from "zod";
import { sendWhatsAppMessage, type WhatsAppSocket } from "./whatsapp.ts";
import { type P } from "pino";
import initMcpTools from "./mcp-tools.ts";
//import myLogger from "./logger.ts";

export async function startWAMcpServer(
  sock: WhatsAppSocket | null,
  mcpLogger: P.Logger,
  waLogger: P.Logger,
): Promise<void> {

  mcpLogger.info("Initializing MCP server...");

  const server = new FastMCP({
    name: "whatsapp-ts-mcp-server",
    version: "1.0.0",
  });

  mcpLogger.info("Initializing MCP tools...");
  // Register tool handlers for MCP server
  await initMcpTools(server, waLogger, mcpLogger, sock);
  
  server.start({
    transportType: "httpStream",
    httpStream: {
      port: 3000,
    },
  });

  mcpLogger.info("MCP server started on port 3000");
}
