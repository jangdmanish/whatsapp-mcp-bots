// mcp-client.ts
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import OpenAI from "openai";
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { type McpTool } from "./types.ts";
import {
  type ListToolsRequest,
  ListToolsResultSchema,
  type CallToolRequest,
  CallToolResultSchema,
  LoggingMessageNotificationSchema,
  type ListToolsResult,
  type ResourceLink,
  LoggingLevelSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
} from "@google/genai";

import {
  type ChatSessionModelFunctions,
  type ChatSessionModelFunction,
  defineChatSessionFunction
} from "node-llama-cpp";

let client: Client | null = null;
let transport: StreamableHTTPClientTransport | null = null;
let notificationsToolLastEventId: string | undefined = undefined;
let sessionId: string | undefined = undefined;
type OpenAiTool = OpenAI.Responses.FunctionTool;

/**
 * Wraps a single MCP server and exposes several methods to interact with it:
 *  - connectToServer() → connects to MCP server
 *  - listTools()  → OpenAI function tools
 *  - callTool()   → execute MCP tool
 *  - startNotificationTool() → starts the notification tool
 */

export class MCPClientWrapper {
  private client: Client;
  private transport: StreamableHTTPClientTransport | SSEClientTransport = StreamableHTTPClientTransport.prototype;
  private transportType: 'streamable-http' | 'sse' = 'streamable-http';
  private readonly serverName: string;

  constructor(serverName: string) {
    this.serverName = serverName;
    this.client = new Client({
      name: `streamablehhtp-mcp-client-for-${serverName}`,
      version: "1.0.0",
    },
      {
        capabilities: {
        },
      });

    this.client.onerror = error => {
      console.error('wa-client error:', error);
    };
  }

  getClient(): Client {
    return this.client;
  }

  async connectToServer(url: string): Promise<void> {
    console.log('1. Trying Streamable HTTP transport first...');

    // Step 1: Try Streamable HTTP transport first
    const baseUrl = new URL(url);

    try {
      // Create modern transport
      const streamableTransport = new StreamableHTTPClientTransport(baseUrl, {
        sessionId: sessionId
      });
      await this.client.connect(streamableTransport);
      sessionId = streamableTransport.sessionId;
      console.log('Transport created with session ID:', sessionId);
      console.log('Connected to MCP server');
      this.transport = streamableTransport;
    } catch (error) {
      // Step 2: If transport fails, try the older SSE transport
      console.log(`StreamableHttp transport connection failed: ${error}`);
      console.log('2. Falling back to deprecated HTTP+SSE transport...');

      try {
        // Create SSE transport pointing to /sse endpoint
        const sseTransport = new SSEClientTransport(baseUrl);
        const sseClient = new Client({
          name: 'backwards-compatible-wa-mcp-client',
          version: '1.0.0'
        });
        await sseClient.connect(sseTransport);
        this.client = sseClient;
        this.transport = sseTransport;
        this.transportType = 'sse';
        console.log('Client successfully connected using deprecated HTTP+SSE transport.');
      } catch (sseError) {
        console.error(`Client Failed to connect with either transport method:\n1. Streamable HTTP error: ${error}\n2. SSE error: ${sseError}`);
        throw new Error('Could not connect to server with any available transport');
      }
    }
  }

  /**
   * Get mcp server exposed server tools in openai format,
   * 
   */
  async getToolsForOpenAi(): Promise<OpenAiTool[]> {
    const toolsResult = await this.getTools();
    let tools: OpenAiTool[] = [];
    if (toolsResult) {
      const tools: OpenAiTool[] = toolsResult.tools.map((tool) => {
        const params =
          (tool.inputSchema as Record<string, unknown> | undefined) ?? {
            type: 'object',
            properties: tool.inputSchema.properties,
          };

        return {
          name: tool.name,
          description: tool.description ?? "",
          parameters: params,
        } as OpenAiTool;
      });
    }
    return tools;
  }

  /**
   * Get mcp server exposed server tools in gemini format,
   * 
   */
  async getToolsForGoogleGemini(): Promise<FunctionDeclaration[]> {
    const toolsResult = await this.getTools();
    let tools: FunctionDeclaration[] = [];
    if (toolsResult) {
      tools = toolsResult.tools.map((tool) => {
        const params =
          (tool.inputSchema as Record<string, unknown> | undefined) ?? {
            type: 'object',
            properties: tool.inputSchema.properties,
          };

        return {
          name: tool.name,
          description: tool.description ?? "",
          parameters: params,
        } as FunctionDeclaration;
      });
    }
    return tools;
  }

  /**
    * Get mcp server exposed server tools in llama-cpp format,
    * 
    */
  async getToolsForLlama(): Promise<McpTool[]> {
    const toolsResult = await this.getTools();
    let tools: McpTool[] = [];
    if (toolsResult) {
      tools = toolsResult.tools.map((t) => {
        return {
          name: t.name,
          description: t.description ?? "No description",
          parameters: t.inputSchema ?? {
            type: "object",
            properties: {},
          },
        }
      });
    }
    return tools;
  }

  /**
   * Get mcp server exposed server tools in hugging face format,
   * 
   */
  async getToolsForHuggingFace(): Promise<McpTool[]> {
    const toolsResult = await this.getTools();
    let tools: McpTool[] = [];
    if (toolsResult) {
      tools = toolsResult.tools.map((t) => {
        return {
          name: t.name,
          description: t.description ?? "No description",
          parameters: t.inputSchema ?? {
            type: "object",
            properties: {},
          },
        }
      });
    }
    return tools;
  }

  /**
 * List available tools on the mcp server
 */
  async getTools(): Promise<ListToolsResult | undefined> {
    let toolsResult: ListToolsResult | undefined = undefined;
    try {
      const toolsRequest: ListToolsRequest = {
        method: 'tools/list',
        params: {}
      };
      toolsResult = await this.client.request(toolsRequest, ListToolsResultSchema);

      console.log('Available tools:');
      if (toolsResult.tools.length === 0) {
        console.log('  No tools available');
      } else {
        for (const tool of toolsResult.tools) {
          console.log(`  - ${tool.name}: ${tool.description}`);
        }
      }
      return toolsResult;
    } catch (error) {
      console.log(`Tools not supported by this server: ${error}`);
    }
  }

  async startNotificationTool() {
    try {
      // Call the notification tool using reasonable defaults
      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'start_wa_notifications',
          arguments: {
          }
        }
      };

      console.log('[MCP Wrapper] Initalize notification tool...');
      const result = await this.client.request(request, CallToolResultSchema);

      //console.log('Tool result:');
      /*result.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`text  ${item.text}`);
        } else {
          console.log(`  ${item.type} content:`, item);
        }
      });*/
    } catch (error) {
      console.log(`Error calling notification tool: ${error}`);
    }
  }

  async startLogTool() {
    try {
      // Call the notification tool using reasonable defaults
      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'get-log',
          arguments: {
            msg: 'Manish'
          }
        }
      };

      console.log('Starting notification tool...');
      const result = await this.client.request(request, CallToolResultSchema);

      //console.log('Tool result:');
      /*result.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`text  ${item.text}`);
        } else {
          console.log(`  ${item.type} content:`, item);
        }
      });*/
    } catch (error) {
      console.log(`Error calling notification tool: ${error}`);
    }
  }

  /**
   * Call a tool exposed by the MCP server.
   * Returns the MCP "content" array (text, images, etc.).
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    return result as any;
  }


  async callTool2(name: string, args: Record<string, unknown>): Promise<string | undefined> {
    if (!this.client) {
      console.log('Not connected to mcp server.');
      return;
    }

    try {
      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      };

      console.log(`Calling tool '${name}' with args:`, args);
      const result = await this.client.request(request, CallToolResultSchema);
      //console.log('Tool result:');
      const resourceLinks: ResourceLink[] = [];
      const firstItem = result.content[0];
      if (firstItem.type === 'text') {
        return firstItem.text;
      }
      result.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`  ${item.text}`);
        } else if (item.type === 'resource_link') {
          const resourceLink = item as ResourceLink;
          resourceLinks.push(resourceLink);
          console.log(`  📁 Resource Link: ${resourceLink.name}`);
          console.log(`     URI: ${resourceLink.uri}`);
          if (resourceLink.mimeType) {
            console.log(`     Type: ${resourceLink.mimeType}`);
          }
          if (resourceLink.description) {
            console.log(`     Description: ${resourceLink.description}`);
          }
        } else if (item.type === 'resource') {
          console.log(`  [Embedded Resource: ${item.resource.uri}]`);
        } else if (item.type === 'image') {
          console.log(`  [Image: ${item.mimeType}]`);
        } else if (item.type === 'audio') {
          console.log(`  [Audio: ${item.mimeType}]`);
        } else {
          console.log(`  [Unknown content type]:`, item);
        }
      });

      // Offer to read resource links
      if (resourceLinks.length > 0) {
        console.log(`\nFound ${resourceLinks.length} resource link(s). Use 'read-resource <uri>' to read their content.`);
      }
    } catch (error) {
      console.log(`Error calling tool ${name}: ${error}`);
    }
  }

  async callMcpToolAsJson(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const raw = await this.client.callTool(
      { name, arguments: args },
      CallToolResultSchema
    );

    const [first] = raw.content as [Record<string, unknown>];
    if (!first || first.type !== "text") {
      throw new Error("Unexpected MCP tool result format");
    }

    try {
      return { output: first.text };
    } catch {
      return { error: "Failed to parse MCP tool result as JSON" };
    }
  }

  async close(): Promise<void> {
    await this.client.close();
    if (this.transport) {
      await this.transport.close();
    }
  }

}
