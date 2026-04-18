import { spawn } from "bun";

const PORT = process.env.MCP_HTTP_PORT ?? "17104";

console.log(`[devplanner] MCP HTTP gateway starting on port ${PORT}`);
console.log(`[devplanner] Streamable HTTP endpoint: http://localhost:${PORT}/mcp`);
console.log(`[devplanner] Note: supergateway may also log an SSE endpoint — use /mcp for Hermes`);

const proc = spawn(
  ["bunx", "supergateway", "--stdio", "bun src/mcp-server.ts", "--port", PORT, "--outputTransport", "streamableHttp", "--logLevel", "info"],
  { stdin: "inherit", stdout: "inherit", stderr: "inherit", env: process.env }
);

process.exit(await proc.exited);
