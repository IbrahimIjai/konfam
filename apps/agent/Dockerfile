FROM oven/bun:1.4.4-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile --production --filter "@konfam/agent"
COPY packages/shared packages/shared
COPY apps/agent apps/agent
WORKDIR /app/apps/agent
EXPOSE 3001
CMD ["bun", "src/index.ts"]
