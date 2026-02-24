# =============================================================================
# DevPlanner — Dockerfile
# =============================================================================
# Builds the frontend and runs the backend on a single port (17103).
# The Elysia backend serves the pre-built React app as static files in
# production mode, so only one port is needed for the full application.
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

# Build the frontend — output lands in frontend/dist/ and is served by the
# Elysia backend at runtime (NODE_ENV=production enables static file serving)
RUN cd frontend && bun run build

# Single port: API + WebSocket + pre-built frontend UI
EXPOSE 17103

CMD ["bun", "run", "start"]
