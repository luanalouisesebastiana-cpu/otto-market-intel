# Otto Market Intel — self-contained x402 seller service.
# Runs the public-service (paid intel endpoints) + refreshes its own data.
FROM node:20-slim
WORKDIR /app
COPY package.json ./
COPY public-service.mjs ./
COPY scripts ./scripts
COPY data ./data
EXPOSE 7010
ENV NODE_ENV=production PORT=7010
CMD ["node", "public-service.mjs"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -fsS http://localhost:7010/health || exit 1
