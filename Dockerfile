FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DB_PATH=/app/data/marralhinha.db
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY src/shared ./src/shared
COPY TERMS.md PRIVACY.md RULES.md ./
COPY --from=build /app/build ./build
VOLUME /app/data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "--experimental-sqlite", "--disable-warning=ExperimentalWarning", "server/index.js"]
