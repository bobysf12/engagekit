FROM oven/bun:1.2.20 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_PATH=./data/app.db
ENV API_ENABLED=true
ENV SCHEDULER_ENABLED=true
ENV API_HOST=0.0.0.0
ENV API_PORT=3000

EXPOSE 3000

CMD ["bun", "run", "src/server/index.ts"]
