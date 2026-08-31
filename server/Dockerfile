# Sentinel AI — API (Node/Express + Prisma). Applies migrations on boot, then serves.
FROM node:20-slim
WORKDIR /app
# OpenSSL is required by Prisma's query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 8787
# DATABASE_URL must point at your managed Postgres (e.g. Azure Database for PostgreSQL).
# Migrations run first so a fresh database is provisioned automatically.
CMD ["sh","-c","npx prisma migrate deploy && node dist/index.js"]
