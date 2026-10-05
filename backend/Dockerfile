# Remote MCP server image — runs src/mcp/http-server.ts (the stateless,
# multi-user-safe HTTP entry point). NOT the local stdio server; that one
# is only ever spawned directly by Claude Code/Desktop, never deployed.
#
# Build and run:
#   docker build -t pr-reviewer-mcp .
#   docker run -p 8080:8080 \
#     -e GITLAB_URL=https://git.aurumproptech.in \
#     -e DATABASE_URL=postgresql://... \
#     pr-reviewer-mcp
#
# GITLAB_TOKEN is deliberately NOT set here — the HTTP server never reads
# it; every caller supplies their own via an Authorization header.

FROM node:20-slim AS build
WORKDIR /app
# Prisma's query engine needs libssl at both generate-time and runtime —
# node:20-slim doesn't include it, and silently falls back to guessing the
# OpenSSL version, which can break at runtime against a real Postgres.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
# Apply any pending schema migrations first (idempotent; a no-op once the
# database is current), then start the server, which seeds the pattern rows
# itself before it begins listening. If migration fails the container exits
# instead of serving against a missing table.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/mcp/http-server.js"]
