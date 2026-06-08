# Dockerfile for Glama (and other container-based MCP hosts) introspection.
#
# redash-mcp is a local stdio MCP server. This image lets a host start the
# server and answer introspection (tools/list) requests without real Redash
# credentials — the placeholder env values below only satisfy the startup
# guard; actual tool calls require real REDASH_URL / REDASH_API_KEY at runtime.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Placeholder credentials so the server boots and answers introspection.
# Override these with real values to actually use the server.
ENV REDASH_URL=http://localhost \
    REDASH_API_KEY=placeholder

ENTRYPOINT ["node", "dist/index.js"]
