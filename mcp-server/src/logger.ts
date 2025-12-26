import { Logger } from "fastmcp";
import { pino } from "pino";

export default class myLogger implements Logger {
  
  debug(...args: unknown[]): void {
    console.log("[DEBUG]", new Date().toISOString(), ...args);
  }

  error(...args: unknown[]): void {
    console.error("[ERROR]", new Date().toISOString(), ...args);
  }

  info(...args: unknown[]): void {
    console.info("[INFO]", new Date().toISOString(), ...args);
  }

  log(...args: unknown[]): void {
    console.log("[LOG]", new Date().toISOString(), ...args);
  }

  warn(...args: unknown[]): void {
    console.warn("[WARN]", new Date().toISOString(), ...args);
  }
}

export const waLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination("./wa-logs.txt")
);
export const mcpLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination("./mcp-logs.txt")
);