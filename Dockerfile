FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN yarn build

ENV NODE_ENV=production
EXPOSE 4200

CMD ["sh", "-c", "npx prisma migrate resolve --rolled-back 20260819160000_recalc_loyalty_totals; npx prisma migrate deploy && node dist/main"]
