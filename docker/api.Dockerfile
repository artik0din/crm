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

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages ./packages
EXPOSE 3001
CMD ["bun", "apps/api/dist/main.js"]
