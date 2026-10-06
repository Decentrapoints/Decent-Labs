FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24.19.0-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data /app/bridge-runtime /app/backups && chown -R node:node /app/data /app/bridge-runtime /app/backups
USER node
ENV DLS_HOST=0.0.0.0 DLS_PORT=4310 DLS_DATA_DIR=/app/data
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4310/api/auth/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server/index.mjs"]
