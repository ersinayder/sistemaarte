#!/usr/bin/env bash
# ============================================================
# qa-bundle.sh — Sistema Arte Redondinho
# Gera um único arquivo qa-bundle.md com todo o código
# relevante do projeto para revisão / QA externo.
#
# USO:
#   chmod +x qa-bundle.sh
#   ./qa-bundle.sh
#
# Saída: ./qa-bundle.md  (~texto puro, cole em qualquer LLM)
# ============================================================

OUT="qa-bundle.md"
ROOT="$(cd "$(dirname "$0")" && pwd)"
DATE="$(date '+%Y-%m-%d %H:%M')"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'n/a')"

# Extensões de código que interessam ao QA
EXTS="js|jsx|ts|tsx|sql|json"

# Pastas a IGNORAR completamente
SKIP_DIRS="node_modules|dist|build|\.git|data|backups|coverage|\.vite"

# Arquivos individuais a IGNORAR (package-lock, gerados, etc)
SKIP_FILES="package-lock.json|yarn.lock|pnpm-lock.yaml"

echo "# QA Bundle — Sistema Arte Redondinho" > "$OUT"
echo "" >> "$OUT"
echo "> Gerado em: $DATE | Commit: $COMMIT" >> "$OUT"
echo "> Repositório: https://github.com/ersinayder/sistemaarte" >> "$OUT"
echo "" >> "$OUT"

# ── Índice de arquivos incluídos ─────────────────────────────
echo "## Índice" >> "$OUT"
echo "" >> "$OUT"

FILES=$(find "$ROOT" \
  -type f \
  | grep -E "\.($EXTS)$" \
  | grep -vE "($SKIP_DIRS)/" \
  | grep -vE "/($SKIP_FILES)$" \
  | sort)

for f in $FILES; do
  rel="${f#$ROOT/}"
  echo "- \`$rel\`" >> "$OUT"
done

echo "" >> "$OUT"
echo "---" >> "$OUT"
echo "" >> "$OUT"

# ── Conteúdo de cada arquivo ─────────────────────────────────
for f in $FILES; do
  rel="${f#$ROOT/}"
  lang="js"
  case "${f##*.}" in
    jsx)  lang="jsx" ;;
    ts)   lang="typescript" ;;
    tsx)  lang="tsx" ;;
    sql)  lang="sql" ;;
    json) lang="json" ;;
  esac

  echo "## \`$rel\`" >> "$OUT"
  echo "" >> "$OUT"
  echo "\`\`\`$lang" >> "$OUT"
  cat "$f" >> "$OUT"
  echo "" >> "$OUT"
  echo "\`\`\`" >> "$OUT"
  echo "" >> "$OUT"
done

# ── Estatísticas rápidas ─────────────────────────────────────
TOTAL_FILES=$(echo "$FILES" | grep -c .)
TOTAL_LINES=$(wc -l < "$OUT")
SIZE=$(du -sh "$OUT" | cut -f1)

echo "---" >> "$OUT"
echo "" >> "$OUT"
echo "## Resumo" >> "$OUT"
echo "" >> "$OUT"
echo "| | |" >> "$OUT"
echo "|---|---|" >> "$OUT"
echo "| Arquivos incluídos | $TOTAL_FILES |" >> "$OUT"
echo "| Linhas totais | $TOTAL_LINES |" >> "$OUT"
echo "| Tamanho do bundle | $SIZE |" >> "$OUT"
echo "| Commit base | $COMMIT |" >> "$OUT"

echo ""
echo "✅  qa-bundle.md gerado com sucesso!"
echo "   Arquivos : $TOTAL_FILES"
echo "   Tamanho  : $SIZE"
echo "   Saída    : $ROOT/$OUT"
echo ""
echo "👉  Cole o conteúdo de qa-bundle.md em:"
echo "    • ChatGPT / Claude (modo projeto)"
echo "    • Gemini Advanced"
echo "    • Ou envie para um dev externo"
