# MCP HTTP Gateway (Streamable HTTP for Remote Agents)

## Context

DevPlanner's MCP server uses stdio transport — the MCP client must spawn it as a local process. Remote agents (e.g. Hermes) cannot reach a stdio server over the network.

**supergateway** wraps the stdio server and re-exposes it over HTTP. There are two HTTP transport modes:

| Mode | Flag | Endpoint | Clients |
|------|------|----------|---------|
| SSE (legacy) | _(default)_ | `/sse` | Claude Desktop, older MCP clients |
| Streamable HTTP | `--streamableHttp` | `/mcp` | Hermes (`mcp.client.streamable_http`), modern MCP clients |

Hermes uses `mcp.client.streamable_http` internally — **SSE is not supported**. The gateway must run in `--streamableHttp` mode.

## Implementation

### Standalone (no Docker)

Bun auto-loads `.env` from the project root, so `DEVPLANNER_WORKSPACE` and other vars are picked up automatically:

```bash
bun run mcp:http
# runs: bunx supergateway --stdio "bun src/mcp-server.ts" --port 17104 --streamableHttp --logLevel info
```

The gateway starts on port `17104`. Keep the terminal open — the process must stay running for Hermes to connect.

### Docker Compose (optional, for server deployments)

The `mcp-gateway` service is defined in `docker-compose.yml` and starts alongside `devplanner`:

```bash
docker compose up --build -d
```

Both services share the workspace volume and env vars from `.env`.

## Hermes Configuration

```yaml
mcp_servers:
  devplanner:
    url: "http://tiny-tower:17104/mcp"
    enabled: true
```

The endpoint is `/mcp` (not `/sse`) when running in Streamable HTTP mode.

## Verification

```bash
# Should return 200 or an event stream (not 404 or 405)
curl -X POST http://tiny-tower:17104/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}'
```

A valid response contains `"result":{"protocolVersion":...}`. A 404 means the flag is missing; SSE-only mode only exposes `/sse`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEVPLANNER_WORKSPACE` | Yes | Absolute path to workspace directory |
| `ARTIFACT_BASE_URL` | No | Base URL for vault artifact links |
| `ARTIFACT_BASE_PATH` | No | Path where artifact files are written |

Env vars are injected server-side — no `env` block is needed in the Hermes config.

## A Note on `env` in MCP Client Configs

The `env` block in any MCP client config (Claude Desktop, Hermes, etc.) is **additive** — it merges on top of the spawned process's inherited environment (think overrides, not a full replacement). The project's `.env` file is only auto-loaded by Bun when `cwd` resolves to the DevPlanner project root. For Docker/remote deployments, pass required variables explicitly via the `environment` block in `docker-compose.yml` rather than relying on `.env` auto-loading.
