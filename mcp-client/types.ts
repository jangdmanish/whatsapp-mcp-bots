export type ToolCallMessage = {
  type: "tool_call";
  tool: string;
  arguments: Record<string, unknown>;
};

export type FinalMessage = {
  type: "final";
  answer: string;
};

export type AgentMessage = ToolCallMessage | FinalMessage;

export type McpToolTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: McpToolTextContent[];
};

export type McpTool = {
  name: string;
  description?: string;
  parameters?: object; // JSON Schema
};

