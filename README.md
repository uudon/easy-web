# easy-web

This repository is a staged reimplementation based on the `easy-vibe` route:

- VitePress as the content framework
- `/docs/.vitepress` for site config and theme overrides
- `/docs/zh-cn` as the primary Chinese site
- Docker + Nginx for Tencent Cloud deployment

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
docker compose up -d --build
```

## Deploy to Tencent Cloud

The production server uses an existing nginx reverse proxy on port `80`.
To update the site from this machine in one command:

```bash
bash scripts/deploy-tencent.sh
```

Defaults:

- Host: `ubuntu@43.136.56.11`
- SSH key: `/Volumes/macOS/documents/密钥/mac.pem`
- Remote app dir: `/home/ubuntu/apps/easy-web-static`

You can override them with `REMOTE_HOST`, `SSH_KEY_PATH`, and `REMOTE_APP_DIR`.

## Current phased deliverables

- Phase 1: VitePress skeleton, bilingual routing, branded homepage
- Phase 2: Navigation, landing-page sections, deployment docs, FAQ
- Phase 3: Docker + Nginx static deployment for Tencent Cloud Ubuntu 22.04
