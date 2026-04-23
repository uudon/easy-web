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

## Current phased deliverables

- Phase 1: VitePress skeleton, bilingual routing, branded homepage
- Phase 2: Navigation, landing-page sections, deployment docs, FAQ
- Phase 3: Docker + Nginx static deployment for Tencent Cloud Ubuntu 22.04

