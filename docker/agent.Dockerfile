FROM oven/bun:1 AS pruner
WORKDIR /app
RUN bun add --global turbo@2.10.8
COPY . .
RUN turbo prune agent --docker

FROM oven/bun:1 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./bun.lock
COPY --from=pruner /app/out/full/ .
RUN DATABASE_URL=postgresql://postgres:postgres@postgres:5432/crm bun install --frozen-lockfile

FROM installer AS builder
RUN DATABASE_URL=postgresql://postgres:postgres@postgres:5432/crm bunx turbo run build --filter=agent

FROM oven/bun:1 AS runner
WORKDIR /app/apps/agent
ENV NODE_ENV=production
ENV AGENT_PORT=2000
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/apps/agent /app/apps/agent
COPY --from=builder /app/packages /app/packages
RUN mkdir -p .eve/.workflow-data && chown -R bun:bun /app
EXPOSE 2000
USER bun
CMD ["bun", "scripts/start.ts"]
