# Sentinel AI — API (Node/Express + Prisma). Applies migrations on boot, then serves.
# Build context is the REPO ROOT so the git-tracked ml/*.json evidence reports can be bundled — that
# lets /api/ml/{uplift,conformal,rct,explore,metrics} serve them even when the optional Python ML
# service isn't deployed. Build with:
#   docker build -f server/Dockerfile -t sentinel-api .      (or: az acr build -f server/Dockerfile .)
FROM node:20-slim
WORKDIR /app
# OpenSSL is required by Prisma's query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
# Bundle the ML evidence reports at /ml so the API's ../ml/*.json lookups resolve inside the container.
COPY ml/*.json /ml/
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 8787
# DATABASE_URL must point at your managed Postgres (e.g. Azure Database for PostgreSQL).
# Migrations run first so a fresh database is provisioned automatically.
CMD ["sh","-c","npx prisma migrate deploy && node dist/index.js"]
