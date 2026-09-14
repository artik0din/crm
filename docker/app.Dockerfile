FROM oven/bun:1 AS pruner
WORKDIR /app
RUN bun add --global turbo@2.10.8
COPY . .
RUN turbo prune app --docker

FROM oven/bun:1 AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./bun.lock
RUN DATABASE_URL=postgresql://postgres:postgres@postgres:5432/crm bun install --frozen-lockfile

FROM installer AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=pruner /app/out/full/ .
RUN DATABASE_URL=postgresql://postgres:postgres@postgres:5432/crm BETTER_AUTH_SECRET=docker-build-placeholder-secret-32-chars ALLOWED_SIGN_IN=build@example.com bunx turbo run build --filter=app

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/public ./apps/app/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/app/server.js"]
