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

## Content workflow

When you add or update a Chinese article under `docs/zh-cn/topics/*/*.md`, the site can now refresh article references automatically:

```bash
npm run sync:content
```

This updates:

- The Chinese homepage featured reading cards
- Each Chinese topic landing page's recommended article list

## Draft workflow

Put draft articles under `drafts/zh-cn/<topic>/`.

Supported topics:

- `ai`
- `programming`
- `algorithms`
- `architecture`
- `project-management`
- `thinking`

Example draft:

```md
---
title: 什么是范围管理
slug: scope-management
---

# 什么是范围管理

正文内容...
```

Publish one draft into the formal article directory and refresh article references:

```bash
npm run drafts:publish -- --file drafts/zh-cn/ai/my-new-article.md
```

Publish every draft at once:

```bash
npm run drafts:publish -- --all
```

The publish step will:

- copy the article into `docs/zh-cn/topics/<topic>/`
- use the filename or frontmatter `slug` as the final link
- use the H1 or frontmatter `title` as the final article title
- move the original draft into `drafts/archive/`
- refresh the Chinese homepage and topic article lists

To run the full one-click flow from content sync to deployment:

```bash
npm run publish
```

To publish draft articles and deploy in one command:

```bash
npm run publish -- --all-drafts
```

Or deploy just one draft:

```bash
npm run publish -- --draft drafts/zh-cn/ai/my-new-article.md
```

Optional custom commit message:

```bash
npm run publish -- --message "feat: publish new AI article"
```

Defaults:

- Host: `ubuntu@43.136.56.11`
- SSH key: auto-detected from `/Volumes/macOS/documents/密钥/mac.pem` or `/Volumes/macOS/documents/key/codex.pem`
- Remote app dir: `/home/ubuntu/apps/easy-web-static`

You can override them with `REMOTE_HOST`, `SSH_KEY_PATH`, and `REMOTE_APP_DIR`.

## Current phased deliverables

- Phase 1: VitePress skeleton, bilingual routing, branded homepage
- Phase 2: Navigation, landing-page sections, deployment docs, FAQ
- Phase 3: Docker + Nginx static deployment for Tencent Cloud Ubuntu 22.04
