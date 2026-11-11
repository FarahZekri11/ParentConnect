FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist

# Standardized internal container port
EXPOSE 8080

ENV PORT=8080
ENV APP_PORT=8080
ENV NODE_ENV=production

CMD ["node", "dist/main"]
