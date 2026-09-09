FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
# --omit=dev: devDependencies here are local-only tooling (embedded-postgres,
# redis-memory-server, etc.) — redis-memory-server's postinstall compiles
# Redis from source, which needs `make` and isn't present in this minimal
# Alpine image. prisma (the CLI, not @prisma/client) lives in dependencies
# instead of devDependencies for exactly this reason: docker-entrypoint.sh
# runs `npx prisma migrate deploy` at container startup, so it has to be in
# the production install.
RUN npm ci --omit=dev

COPY . .
RUN npx prisma generate

EXPOSE 4000

# Migrations + config bootstrap + server, each phase logged separately so a
# failure is diagnosable from the container logs. See docker-entrypoint.sh.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
CMD ["/usr/local/bin/docker-entrypoint.sh"]
