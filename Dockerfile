# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && \
    ln -s /app/node_modules /app/client/node_modules && \
    npm run build

# Stage 2: Migration
FROM node:20-alpine AS migrator
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY drizzle.config.ts ./
COPY shared ./shared
CMD ["npx", "drizzle-kit", "push"]

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
COPY drizzle.config.ts ./
COPY scripts ./scripts
COPY shared ./shared
COPY --from=builder /app/dist ./dist
EXPOSE 5000
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then npm run db:push; else echo 'DATABASE_URL is not set; starting with in-memory storage'; fi && node dist/index.cjs"]
