# Otto Market Intel — self-contained deployable service
# Runs the public service (x402 seller + live data + static storefront).
# Deploy anywhere: Render, Railway, Fly, Koyeb, VPS, your own machine.
FROM node:20-slim
WORKDIR /app
# copy the whole project (service + data pipeline + static pages)
COPY package.json ./
RUN npm install --omit=dev 2>/dev/null || true
COPY . .
# service listens on PORT (default 8080); refreshes all data on boot
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1
CMD ["node", "public-service.mjs"]
