FROM node:22.22.2-trixie-slim

# Prisma needs OpenSSL libs on slim images; avoids openssl detection warnings at build/runtime.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# postinstall runs `prisma generate` — schema must exist before `npm ci`
COPY prisma ./prisma
RUN npm ci

COPY . .

RUN chmod +x docker-entrypoint.sh && npx prisma generate

ENV NODE_ENV=production

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
