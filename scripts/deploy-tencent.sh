#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-ubuntu@43.136.56.11}"
SSH_KEY_PATH="${SSH_KEY_PATH:-/Volumes/macOS/documents/密钥/mac.pem}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/ubuntu/apps/easy-web-static}"
SSH_OPTS=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new)

cd "$ROOT_DIR"

echo "[1/4] Building VitePress site"
npm run build

echo "[2/4] Uploading static files to $REMOTE_HOST:$REMOTE_APP_DIR"
tar czf - docs/.vitepress/dist deploy/nginx.conf | ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "
  set -e
  rm -rf '$REMOTE_APP_DIR'
  mkdir -p '$REMOTE_APP_DIR'
  tar xzf - -C '$REMOTE_APP_DIR'
"

echo "[3/4] Updating Docker deployment on server"
ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "
  set -e
  cd '$REMOTE_APP_DIR'
  cat > docker-compose.static.yml <<'EOF'
services:
  easy-web-static:
    image: nginx:1.27-alpine
    container_name: easy-web-static
    restart: unless-stopped
    ports:
      - \"8081:80\"
    volumes:
      - ./docs/.vitepress/dist:/usr/share/nginx/html:ro
      - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      default:
      stat-net:
        aliases:
          - easy-web-static
networks:
  stat-net:
    external: true
    name: app-stat-stack_stat-net
EOF
  docker compose -f docker-compose.static.yml up -d
"

echo "[4/4] Verifying public access"
curl -I --max-time 10 http://43.136.56.11 | sed -n '1,10p'

echo "Done"

