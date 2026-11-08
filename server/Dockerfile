FROM node:22-bookworm-slim
WORKDIR /app

# Copy both workspace manifests so npm can validate the shared lockfile, but
# install only the server's runtime dependencies.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --workspace server --omit=dev --include-workspace-root=false \
    && npm cache clean --force

COPY --chown=node:node server/src ./server/src
COPY --chown=node:node server/scripts ./server/scripts
COPY --chown=node:node server/migrations ./server/migrations
USER node
ENV NODE_ENV=production
EXPOSE 3001

# Migrations are transactional/idempotent. exec forwards shutdown to the app.
CMD ["sh", "-c", "node server/scripts/migrate.js && exec node server/src/index.js"]
