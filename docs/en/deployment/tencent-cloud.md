# Tencent Cloud Ubuntu 22.04 Deployment

This site is deployed as a static VitePress build served by Docker and nginx.

## Current production shape

- Tencent Cloud server
- Docker-based static delivery
- reverse proxy on ports 80 and 443
- HTTPS enabled for `tangyingbao.com`

## Update flow

From the local machine:

```bash
bash scripts/deploy-tencent.sh
```

