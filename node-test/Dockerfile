FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY . .

RUN chmod +x docker-entrypoint.sh && npx prisma generate

ENV NODE_ENV=production

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
