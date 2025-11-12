# Builder stage: use Alpine and install build dependencies to compile native modules
FROM --platform=linux/amd64 node:lts-alpine AS builder
WORKDIR /app
RUN apk add --no-cache --virtual .build-deps python3 make g++ musl-dev linux-headers sqlite-dev
COPY package*.json ./
RUN npm ci

# Copy source and build if needed
COPY . .
RUN npm run build --if-present

# Runtime stage: minimal Alpine image with only runtime libs
FROM --platform=linux/amd64 node:lts-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install only runtime libraries required by native modules
RUN apk add --no-cache libstdc++ sqlite-libs

# Copy app from builder (node_modules compiled for Alpine)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

RUN npm ci --production

# Copy application code from builder
COPY --from=builder /app ./

EXPOSE 4000
CMD ["node", "server.js"]