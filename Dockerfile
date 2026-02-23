# =============================================================================
# DevPlanner — Dockerfile
# =============================================================================
# Runs the backend API and frontend dev server together in a single container.
# Intended for local self-hosting and network access (e.g. via Tailscale).
#
# Build:  docker build -t devplanner .
# Run:    docker compose up          (preferred — see docker-compose.yml)
# =============================================================================

FROM oven/bun:1

WORKDIR /app

# Install backend dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install frontend dependencies
COPY frontend/package.json frontend/bun.lock* ./frontend/
RUN cd frontend && bun install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Backend API port
EXPOSE 17103
# Frontend Vite dev server port (--host flag is already set in package.json)
EXPOSE 5173

# Run both backend and frontend concurrently (mirrors `bun run dev`)
CMD ["bun", "run", "dev"]
