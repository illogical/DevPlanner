FROM oven/bun:1.2.20-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY src ./src
ENV NODE_ENV=production
EXPOSE 17104
CMD ["bun", "src/server.ts"]
