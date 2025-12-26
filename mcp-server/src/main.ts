import { mcpLogger, waLogger} from './logger.ts';
import { initializeDatabase } from "./database.ts";
import { startWhatsAppConnection, type WhatsAppSocket } from "./whatsapp.ts";
import {  startWAMcpServer } from "./mcp.ts";

async function main() {
  mcpLogger.info("Starting WhatsApp MCP Server...");
  let whatsappSocket: WhatsAppSocket | null = null;

  try {
    mcpLogger.info("Initializing database...");
    initializeDatabase();
    mcpLogger.info("Database initialized successfully.");
    
    mcpLogger.info("Attempting to connect to WhatsApp...");
    whatsappSocket = await startWhatsAppConnection(waLogger);
    mcpLogger.info("WhatsApp connection process initiated.");
  } catch (error: any) {
    mcpLogger.fatal(
      { err: error },
      "Failed during initialization or WhatsApp connection attempt"
    );

    process.exit(1);
  }

  try {
    mcpLogger.info("Starting MCP server...");
    await startWAMcpServer(whatsappSocket, mcpLogger, waLogger);
    mcpLogger.info("MCP Server started and listening.");
  } catch (error: any) {
    mcpLogger.fatal({ err: error }, "Failed to start MCP server");
    process.exit(1);
  }

  mcpLogger.info("Application setup complete. Running...");
}

async function shutdown(signal: string) {
  mcpLogger.info(`Received ${signal}. Shutting down gracefully...`);
  waLogger.flush();
  mcpLogger.flush();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  mcpLogger.fatal({ err: error }, "Unhandled error during application startup");
  waLogger.flush();
  mcpLogger.flush();
  process.exit(1);
});
