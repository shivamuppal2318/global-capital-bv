FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 4000

# Applies any pending migrations, then fills in required singleton config
# rows (e.g. BusinessSettings) if missing — both are no-ops when there's
# nothing to do, so safe to run on every boot. Does NOT run seed.js, which
# wipes all data and would destroy real leads collected in production.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/ensureDefaults.js && node src/index.js"]
