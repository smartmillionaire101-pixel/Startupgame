# syntax=docker/dockerfile:1
# Multi-stage build: compile client and server, ship a small non-root runtime.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npx -y npm@11 ci
COPY . .
RUN npm run build -w @runway/web && npm run build -w @runway/server

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 DATABASE_PATH=/data/runway.db WEB_DIST=/app/web
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npx -y npm@11 ci --omit=dev -w @runway/server --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/main.js"]
