FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 4000

# Applies any pending migrations before starting — safe to run on every
# boot since prisma migrate deploy is a no-op when nothing's pending.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
