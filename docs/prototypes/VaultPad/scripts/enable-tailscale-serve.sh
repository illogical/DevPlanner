#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-17104}"
HOSTNAME="${TS_HOSTNAME:-vaultpad}"

if [ ! -x /usr/local/bin/tailscale ]; then
  echo "tailscale CLI not found" >&2
  exit 1
fi

# Ensure daemon/login is up
if ! /usr/local/bin/tailscale status >/dev/null 2>&1; then
  echo "tailscale is not connected. Run: tailscale up" >&2
  exit 2
fi

# Expose local markdown server through tailnet HTTPS
# This updates serve config idempotently
/usr/local/bin/tailscale serve --bg --https=443 127.0.0.1:${PORT}

echo "tailscale serve enabled: https://${HOSTNAME}.tailnet (actual MagicDNS name depends on node name) -> http://127.0.0.1:${PORT}"
