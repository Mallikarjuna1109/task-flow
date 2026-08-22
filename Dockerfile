# Multi-stage build shared by both the API and the Worker image. The two
# services are identical builds of the same codebase - only the final CMD
# differs - so docker-compose.yml selects the `api` or `worker` build target.

FROM node:20-bookworm-slim AS base
WORKDIR /app
# openssl is required by the Prisma query engine on Debian-based images.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- API image --------------------------------------------------------
FROM base AS api
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/docs ./docs
COPY package.json ./
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "dist/server.js"]

# ---- Worker image -------------------------------------------------------
FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
RUN npx prisma generate
CMD ["node", "dist/workers/index.js"]
