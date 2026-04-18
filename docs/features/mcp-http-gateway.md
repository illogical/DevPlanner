# MCP HTTP Gateway

Exposes DevPlanner's stdio MCP server as an HTTP/SSE endpoint so remote agents (e.g. Hermes, web-based tools) can connect over the network instead of spawning a local process.

## Why

DevPlanner's MCP server uses stdio transport — the MCP client must spawn it as a local process. When an agent runs on a separate machine, it cannot reach a stdio server. The HTTP gateway wraps the stdio server and re-exposes it on a port over SSE, which any MCP client with HTTP remote support can connect to.

## How It Works

[supergateway](https://www.npmjs.com/package/supergateway) (an npm package) wraps any stdio MCP server and exposes two HTTP endpoints:

- `GET /sse` — SSE stream (standard HTTP MCP transport)
- `POST /message` — message posting endpoint

The gateway spawns `bun src/mcp-server.ts` as its subprocess and bridges messages over HTTP.

## Setup

### 1. Start the gateway locally

```bash
# Requires DEVPLANNER_WORKSPACE (and optionally ARTIFACT_BASE_URL, ARTIFACT_BASE_PATH) in env
bun run mcp:http
```

The gateway listens on port `17104` by default.

### 2. Docker Compose (recommended for server deployments)

The `mcp-gateway` service in `docker-compose.yml` starts alongside the main `devplanner` service:

```bash
docker compose up
```

Both services share the same workspace volume and env vars from `.env`. The gateway runs on port `17104`; the API/UI runs on port `17103`.

## Hermes Agent Configuration

Add to the Hermes agent's `mcp_servers` config:

```yaml
mcp_servers:
  devplanner:
    url: "http://<your-server-hostname>:17104/sse"
    enabled: true
```

Replace `<your-server-hostname>` with your server's local IP, Tailscale hostname (e.g. `tiny-tower`), or domain.

No `env` block is needed in the Hermes config — env vars are injected on the server side.

## Streamable HTTP (Alternative)

If the agent requires the newer Streamable HTTP transport instead of SSE, change the gateway command in `docker-compose.yml`:

```yaml
command: ["bunx", "supergateway", "--stdio", "bun src/mcp-server.ts", "--port", "17104", "--streamableHttp", "--logLevel", "info"]
```

Then connect to `/mcp` instead of `/sse`.

## Environment Variables

The gateway inherits all DevPlanner env vars from `.env` on the host (or injected via `docker-compose.yml` `environment` block):

| Variable | Required | Description |
|----------|----------|-------------|
| `DEVPLANNER_WORKSPACE` | Yes | Absolute path to workspace directory |
| `ARTIFACT_BASE_URL` | No | Base URL for vault artifact links |
| `ARTIFACT_BASE_PATH` | No | Path where artifact files are written |

## A Note on `env` in MCP Configs

The `env` block in any MCP client config (Claude Desktop, Hermes, etc.) is **additive and overrides** — entries merge on top of the spawned process's inherited environment. The project's `.env` file is a separate concern: Bun only auto-loads it when `cwd` resolves to the DevPlanner project root. For remote/Docker deployments, pass env vars explicitly rather than relying on `.env` auto-loading.

## Verification

```bash
# SSE endpoint should open a stream (not 404)
curl http://<server>:17104/sse

# From a machine that can reach the server
curl -N http://tiny-tower:17104/sse
```

If you see an event stream open, the gateway is running and accepting connections.
