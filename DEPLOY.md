# Deploy Otto Market Intel (permanent, independent of the agent sandbox)

The paid x402 service (`public-service.mjs`) is fully self-contained: no native
deps, no absolute paths. It can run anywhere Node 18+ (or Docker) is available.

## Option A — Render (one click)
1. Fork this repo.
2. In Render → New → Blueprint → select this repo.
3. `render.yaml` builds the Docker image and serves `:7010`.
Public URL becomes e.g. `https://<name>.onrender.com` → point your manifest at it.

## Option B — Docker (any host / VPS / fly / railway)
```bash
docker build -t otto-market-intel .
docker run -d -p 7010:7010 --restart unless-stopped otto-market-intel
```
or `docker compose up -d`.

## Option C — GitHub Container Registry
Every push publishes an image:
`ghcr.io/<owner>/otto-market-intel:latest`
Pull and run on any Docker host:
```bash
docker pull ghcr.io/<owner>/otto-market-intel:latest
docker run -d -p 7010:7010 ghcr.io/<owner>/otto-market-intel:latest
```

## After deploy
Set `OTTO_BASE_URL` to the public URL, update `x402-manifest.json` /
`openapi.json` `servers[0].url`, and the paid endpoints are live and payable.
