FROM node:20-alpine
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN yarn build

ENV NODE_ENV=production

CMD ["sh", "-c", "yarn prisma migrate deploy && node dist/main"]
