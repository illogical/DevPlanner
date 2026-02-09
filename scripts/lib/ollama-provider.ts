/**
 * Ollama API client for tool calling
 * 
 * Implements the ModelProvider interface to interact with Ollama's chat API
 * with tool/function calling support.
 */

// Message format (OpenAI-compatible)
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// MCP tool schema format
export interface MCPToolSchema {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

// Ollama tool format
export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Ollama API request format
interface OllamaRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, any>;
      };
    }>;
  }>;
  tools?: OllamaTool[];
  stream: boolean;
}

// Ollama API response format
interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, any>;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ModelProviderResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface ModelProvider {
  callWithTools(
    messages: Message[],
    tools: MCPToolSchema[],
    options?: { model?: string }
  ): Promise<ModelProviderResponse>;
}

export class OllamaProvider implements ModelProvider {
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl = "http://localhost:11434", defaultModel = "qwen2.5") {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  /**
   * Convert MCP tool schema to Ollama tool format
   */
  private convertToolSchema(mcpTool: MCPToolSchema): OllamaTool {
    return {
      type: "function",
      function: {
        name: mcpTool.name,
        description: mcpTool.description || "",
        parameters: {
          type: "object",
          properties: mcpTool.inputSchema.properties || {},
          required: mcpTool.inputSchema.required || [],
        },
      },
    };
  }

  /**
   * Convert OpenAI-compatible messages to Ollama format
   */
  private convertMessages(messages: Message[]): OllamaRequest["messages"] {
    return messages.map((msg) => {
      const ollamaMsg: any = {
        role: msg.role === "tool" ? "tool" : msg.role,
        content: msg.content,
      };

      // Convert tool_calls if present
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        ollamaMsg.tool_calls = msg.tool_calls.map((tc) => ({
          function: {
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          },
        }));
      }

      return ollamaMsg;
    });
  }

  /**
   * Generate a unique tool call ID
   */
  private generateToolCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Call Ollama with tools
   */
  async callWithTools(
    messages: Message[],
    tools: MCPToolSchema[],
    options?: { model?: string }
  ): Promise<ModelProviderResponse> {
    const model = options?.model || this.defaultModel;

    // Convert tools to Ollama format
    const ollamaTools = tools.map((tool) => this.convertToolSchema(tool));

    // Prepare request
    const request: OllamaRequest = {
      model,
      messages: this.convertMessages(messages),
      tools: ollamaTools,
      stream: false,
    };

    try {
      // Make request to Ollama
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error (${response.status}): ${errorText}`
        );
      }

      const data: OllamaResponse = await response.json();

      // Extract content and tool calls
      const content = data.message.content || "";
      let toolCalls: ToolCall[] | undefined;

      if (data.message.tool_calls && data.message.tool_calls.length > 0) {
        toolCalls = data.message.tool_calls.map((tc) => ({
          id: this.generateToolCallId(),
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: JSON.stringify(tc.function.arguments),
          },
        }));
      }

      return {
        content,
        toolCalls,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to call Ollama: ${error.message}`);
      }
      throw new Error("Failed to call Ollama: Unknown error");
    }
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to list Ollama models: ${error.message}`);
      }
      throw new Error("Failed to list Ollama models: Unknown error");
    }
  }
}
