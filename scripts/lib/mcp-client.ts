import type { Subprocess } from "bun";

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPToolCallResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export class MCPClient {
  private process: Subprocess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: Timer;
    }
  >();
  private buffer = "";

  async start(): Promise<void> {
    if (this.process) {
      throw new Error("MCP client already started");
    }

    this.process = Bun.spawn(["bun", "src/mcp-server.ts"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Handle stderr for logging
    this.readStderr();

    // Handle stdout for JSON-RPC responses
    this.readStdout();
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("MCP client stopped"));
    }
    this.pendingRequests.clear();

    // Kill the process
    this.process.kill();
    await this.process.exited;
    this.process = null;
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.process) {
      throw new Error("MCP client not started");
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    };

    return new Promise((resolve, reject) => {
      // Set up timeout (15s)
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Tool call timeout after 15s: ${name}`));
      }, 15000);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send request via stdin
      const requestLine = JSON.stringify(request) + "\n";
      this.process!.stdin.write(requestLine);
    });
  }

  async listTools(): Promise<Array<{ name: string; description: string; inputSchema: any }>> {
    if (!this.process) {
      throw new Error("MCP client not started");
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id,
      method: "tools/list",
      params: {},
    };

    return new Promise((resolve, reject) => {
      // Set up timeout (15s)
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Tool list timeout after 15s"));
      }, 15000);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send request via stdin
      const requestLine = JSON.stringify(request) + "\n";
      this.process!.stdin.write(requestLine);
    });
  }

  private async readStdout(): Promise<void> {
    if (!this.process?.stdout) return;

    try {
      for await (const chunk of this.process.stdout) {
        const text = new TextDecoder().decode(chunk);
        this.buffer += text;

        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
          const line = this.buffer.slice(0, newlineIndex);
          this.buffer = this.buffer.slice(newlineIndex + 1);

          if (line.trim()) {
            this.handleResponse(line);
          }
        }
      }
    } catch (error) {
      console.error("Error reading stdout:", error);
    }
  }

  private async readStderr(): Promise<void> {
    if (!this.process?.stderr) return;

    try {
      for await (const chunk of this.process.stderr) {
        const text = new TextDecoder().decode(chunk);
        // Log stderr output (for debugging)
        process.stderr.write(`[MCP Server] ${text}`);
      }
    } catch (error) {
      console.error("Error reading stderr:", error);
    }
  }

  private handleResponse(line: string): void {
    try {
      const response: JSONRPCResponse = JSON.parse(line);

      if (!response.id) {
        // Notification or invalid response
        return;
      }

      const pending = this.pendingRequests.get(response.id);
      if (!pending) {
        // Response for unknown request
        return;
      }

      // Clear timeout and remove from pending
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.id);

      // Handle error response
      if (response.error) {
        pending.reject(
          new Error(
            `MCP Error [${response.error.code}]: ${response.error.message}${
              response.error.data ? ` - ${JSON.stringify(response.error.data)}` : ""
            }`
          )
        );
        return;
      }

      // Check if this is a tools/list response
      if (response.result && 'tools' in response.result) {
        pending.resolve(response.result.tools);
        return;
      }

      // Parse MCP tool call result
      const result = response.result as MCPToolCallResult;
      
      if (result.isError) {
        const errorText = result.content?.[0]?.text || "Unknown error";
        pending.reject(new Error(errorText));
        return;
      }

      // Extract text from content array and parse as JSON if possible
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n");
        
        // Try to parse as JSON, otherwise return as string
        try {
          const parsed = JSON.parse(textContent);
          pending.resolve(parsed);
        } catch {
          pending.resolve(textContent);
        }
      } else {
        pending.reject(new Error("Invalid MCP response format"));
      }
    } catch (error) {
      console.error("Error parsing response:", error, "Line:", line);
    }
  }
}
