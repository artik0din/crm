FROM oven/bun:1 AS pruner
WORKDIR /app
RUN bun add --global turbo@2.10.8
COPY . .
RUN turbo prune api --docker

FROM oven/bun:1 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./bun.lock
COPY --from=pruner /app/out/full/ .
RUN DATABASE_URL=postgresql://postgres:postgres@postgres:5432/crm bun install --frozen-lockfile

FROM installer AS builder
RUN DATABASE_URL=postgresql://postgres:postgres@postgres:5432/crm bunx turbo run build --filter=api

FROM installer AS migrator
WORKDIR /app/packages/db
COPY deploy/selfhost-guard-env.sh /usr/local/bin/selfhost-guard-env.sh
RUN chmod +x /usr/local/bin/selfhost-guard-env.sh
USER bun
CMD ["sh", "-c", "/usr/local/bin/selfhost-guard-env.sh && bun run db:deploy"]

FROM oven/bun:1 AS production-deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./bun.lock
COPY --from=pruner /app/out/full/ .
RUN DATABASE_URL=postgresql://postgres:postgres@postgres:5432/crm bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/package.json ./package.json
COPY --from=production-deps /app/apps/api/package.json ./apps/api/package.json
COPY --from=production-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=production-deps /app/packages ./packages
COPY --from=builder /app/packages/db/src/generated ./packages/db/src/generated
EXPOSE 3001
USER bun
CMD ["bun", "apps/api/dist/main.js"]
