# CSC Command — production image
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 FILE_STORAGE_DIR=/data/storage
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 1001 csc && mkdir -p /data/storage && chown -R csc /data
COPY --from=build --chown=csc /app ./
USER csc
EXPOSE 3000
# Apply pending migrations, then start. Migrations are additive and run in a transaction.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
