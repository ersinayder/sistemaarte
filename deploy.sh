#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$REPO_DIR/frontend"
BACKEND_DIR="$REPO_DIR/backend"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

find_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    command -v pm2
    return 0
  fi
  if command -v pm2.cmd >/dev/null 2>&1; then
    command -v pm2.cmd
    return 0
  fi
  return 1
}

echo "[1/4] git pull ($DEPLOY_BRANCH)..."
git -C "$REPO_DIR" pull origin "$DEPLOY_BRANCH"
echo "Commit implantado: $(git -C "$REPO_DIR" rev-parse --short HEAD) ($(git -C "$REPO_DIR" branch --show-current))"

echo "[2/4] backend npm ci..."
cd "$BACKEND_DIR" && npm ci --omit=dev

echo "[3/4] build frontend..."
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "[4/4] restart pm2..."
cd "$REPO_DIR"

PM2_BIN="$(find_pm2 || true)"
if [ -z "$PM2_BIN" ]; then
  echo "ERRO: pm2 nao encontrado no PATH deste shell. O backend nao foi reiniciado."
  echo "Abra o terminal como Administrator ou adicione o npm global/bin ao PATH."
  exit 1
fi

if "$PM2_BIN" show sistemaarte-backend &> /dev/null; then
  "$PM2_BIN" restart sistemaarte-backend --update-env
else
  cd "$BACKEND_DIR"
  "$PM2_BIN" start ecosystem.config.js --only sistemaarte-backend --env production
fi
"$PM2_BIN" save
"$PM2_BIN" show sistemaarte-backend

echo "Deploy concluido!"
