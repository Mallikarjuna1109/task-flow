# docker-compose.yml selects the `api` or `worker` build target below.
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

FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
RUN npx prisma generate
CMD ["node", "dist/workers/index.js"]
