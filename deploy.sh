#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$REPO_DIR/frontend"
BACKEND_DIR="$REPO_DIR/backend"

echo "[1/4] git pull..."
git -C "$REPO_DIR" pull origin main

echo "[2/4] backend npm install..."
cd "$BACKEND_DIR" && npm install --omit=dev

echo "[3/4] build frontend..."
cd "$FRONTEND_DIR"
npm install
npm run build

echo "[4/4] restart pm2..."
cd "$REPO_DIR"

if command -v pm2 &> /dev/null; then
  if pm2 show sistemaarte &> /dev/null; then
    pm2 restart sistemaarte
  else
    pm2 start backend/server.js --name sistemaarte
  fi
  pm2 save
else
  echo "AVISO: pm2 nao encontrado. Instale: npm install -g pm2"
fi

echo "Deploy concluido!"
