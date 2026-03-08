# VaultPad

Lightweight Bun + TypeScript markdown web frontend and API for the AgentVault.

It gives us one stable browser URL for note review/editing from any machine:

- `https://vaultpad.bangus-city.ts.net/editor?path=<vault-relative-path>`

This is the server used to generate shareable review links in Scribe outputs.

---

## Purpose

- Provide a single web endpoint to open markdown files from the vault on any computer.
- Replace local absolute paths in human-facing updates with browser-friendly URLs.
- Keep memory/cost footprint low (Bun + minimal dependencies).
- Serve both API and frontend from one process/port.

---

## Architecture (single server)

- Runtime: **Bun** + **TypeScript**
- Markdown rendering: **Marked**
- Default local port: **`17104`**
- Public URL base: **`https://vaultpad.bangus-city.ts.net`**
- Vault root (default):
  - `/Users/molt/SynologyDrive/notes/AgentVault`

Everything (UI + API) runs on the same port/process.

## Environment variables

Set these for predictable behavior across local + tailnet runs:

- `PORT` (default: `17104`)
- `HOST` (default: `0.0.0.0`)
- `VAULT_ROOT` (default should point to your vault root)
  - Current expected path: `/Users/molt/SynologyDrive/notes/AgentVault`
- `PUBLIC_BASE_URL` (public/editor link base)
  - Example: `https://vaultpad.bangus-city.ts.net`
- `LOG_FILE` (optional; defaults to `$VAULT_ROOT/.vaultpad.log`)

Optional helper vars (tailscale scripts):

- `TS_HOSTNAME` (default helper target hostname)
- `TS_AUTHKEY` (only needed for auth/bootstrap flows)

---

## Features

- Dark-mode web editor with side-by-side live preview.
- Read markdown files from AgentVault.
- Edit and save markdown files back into AgentVault.
- Generate stable browser URLs for note review.
- Health endpoint for monitoring/status checks.
- Path safety guard (prevents escape outside vault root).

---

## Endpoints

- `GET /health`
  - Service status + active config
- `GET /editor?path=<vault-relative-path>`
  - Web editor + live markdown preview
- `GET /api/link?path=<vault-relative-path>`
  - Returns canonical review URL JSON
- `GET /api/file?path=<vault-relative-path>`
  - Reads file content from vault
- `PUT /api/file`
  - Writes file content
  - Body: `{ "path": "...", "content": "..." }`

---

## Directory

- `src/server.ts` — main HTTP server (API + frontend)
- `scripts/start-local.sh` — run server locally
- `scripts/enable-tailscale-serve.sh` — configure Tailscale serve
- `scripts/note-url.ts` — convert vault file path -> review URL
- `scripts/eval-scribe-url.ts` — verifies URL generation contract
- `com.hex.agentvault-serve-web.plist` — macOS launch agent for server
- `com.hex.agentvault-serve-tailscale-serve.plist` — macOS launch agent for tailscale serve setup
- `.env.example` — environment defaults template

---

## Quick start (local)

```bash
cd /Users/molt/SynologyDrive/notes/AgentVault/Scribe/AgentVault-Serve
bun install
PORT=17104 \
VAULT_ROOT=/Users/molt/SynologyDrive/notes/AgentVault \
PUBLIC_BASE_URL=https://vaultpad.bangus-city.ts.net \
bun run start
```

Test:

```bash
curl -fsS http://localhost:17104/health | jq
```

---

## macOS startup (launchd)

Install launch agents:

```bash
cp com.hex.agentvault-serve-web.plist ~/Library/LaunchAgents/
cp com.hex.agentvault-serve-tailscale-serve.plist ~/Library/LaunchAgents/
```

Load/start:

```bash
launchctl unload ~/Library/LaunchAgents/com.hex.agentvault-serve-web.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.hex.agentvault-serve-tailscale-serve.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.hex.agentvault-serve-web.plist
launchctl load ~/Library/LaunchAgents/com.hex.agentvault-serve-tailscale-serve.plist
launchctl start com.hex.agentvault-serve-web
launchctl start com.hex.agentvault-serve-tailscale-serve
```

Check status:

```bash
launchctl list | rg agentvault-serve
curl -fsS http://localhost:17104/health | jq
```

Logs:

- `/tmp/com.hex.agentvault-serve-web.out.log`
- `/tmp/com.hex.agentvault-serve-web.err.log`
- `/tmp/com.hex.agentvault-serve-tailscale-serve.out.log`
- `/tmp/com.hex.agentvault-serve-tailscale-serve.err.log`

---

## Tailscale notes

Current system already serves OpenClaw on `/` via Tailscale, so avoid clobbering that route.

Recommended strategy:

- Keep OpenClaw route intact.
- Serve VaultPad on dedicated service hostname:
  - `vaultpad.bangus-city.ts.net`

If route/hostname behavior changes, verify with:

```bash
tailscale serve status
```

---

## Scribe integration contract

Scribe should return both:

- `absolute_path` (audit/debug)
- `url` (primary human review link)

Preferred human-facing link format:

- `https://vaultpad.bangus-city.ts.net/editor?path=<urlencoded-vault-relative-path>`

Helper command:

```bash
PUBLIC_BASE_URL=https://vaultpad.bangus-city.ts.net \
VAULT_ROOT=/Users/molt/SynologyDrive/notes/AgentVault \
bun scripts/note-url.ts "/absolute/path/to/note.md"
```

Eval command:

```bash
bun scripts/eval-scribe-url.ts
```

---

## Recovery checklist (future memory jog)

If this service is forgotten/broken months later:

1. Confirm files exist in your local VaultPad repo/workdir.
2. Run `bun install`.
3. Start local server with `scripts/start-local.sh`.
4. Verify `http://localhost:17104/health`.
5. Re-enable launchd agents.
6. Check `tailscale serve status`.
7. Verify note URL generation with `bun scripts/eval-scribe-url.ts`.
8. Validate opening one known note via browser URL.

---

## Current status snapshot

- Project name: **VaultPad**
- Port: **17104**
- Public hostname target: **vaultpad.bangus-city.ts.net**
- URL-first Scribe reporting: **enabled in skill contract**

---

## Tests

Run unit tests:

```bash
bun test
```

Run E2E tests (requires server running):

```bash
bun run e2e
```
