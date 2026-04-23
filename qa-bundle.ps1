# ============================================================
# qa-bundle.ps1 — Sistema Arte Redondinho
# Gera um único arquivo qa-bundle.md com todo o código
# relevante do projeto para revisão / QA externo.
#
# USO (PowerShell):
#   .\qa-bundle.ps1
#
# Se aparecer erro de permissão, rode antes:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# ============================================================

$OUT     = "qa-bundle.md"
$ROOT    = $PSScriptRoot
$DATE    = Get-Date -Format "yyyy-MM-dd HH:mm"
$COMMIT  = (git -C $ROOT rev-parse --short HEAD 2>$null)
if (-not $COMMIT) { $COMMIT = "n/a" }

$EXTS      = @("js","jsx","ts","tsx","sql","json")
$SKIP_DIRS = @("node_modules","dist","build",".git","data","backups","coverage",".vite")
$SKIP_FILES = @("package-lock.json","yarn.lock","pnpm-lock.yaml")

function Should-Skip($path) {
    foreach ($d in $SKIP_DIRS) {
        if ($path -match [regex]::Escape("\$d\") -or $path -match [regex]::Escape("/$d/")) {
            return $true
        }
    }
    $name = Split-Path $path -Leaf
    if ($SKIP_FILES -contains $name) { return $true }
    return $false
}

# Coleta todos os arquivos relevantes
$files = Get-ChildItem -Path $ROOT -Recurse -File | Where-Object {
    $EXTS -contains $_.Extension.TrimStart(".") -and -not (Should-Skip $_.FullName)
} | Sort-Object FullName

$lines = [System.Collections.Generic.List[string]]::new()

$lines.Add("# QA Bundle — Sistema Arte Redondinho")
$lines.Add("")
$lines.Add("> Gerado em: $DATE | Commit: $COMMIT")
$lines.Add("> Repositório: https://github.com/ersinayder/sistemaarte")
$lines.Add("")
$lines.Add("## Índice")
$lines.Add("")

foreach ($f in $files) {
    $rel = $f.FullName.Substring($ROOT.Length + 1)
    $lines.Add("- \`$rel\`")
}

$lines.Add("")
$lines.Add("---")
$lines.Add("")

foreach ($f in $files) {
    $rel  = $f.FullName.Substring($ROOT.Length + 1)
    $lang = switch ($f.Extension) {
        ".jsx"  { "jsx" }
        ".ts"   { "typescript" }
        ".tsx"  { "tsx" }
        ".sql"  { "sql" }
        ".json" { "json" }
        default { "js" }
    }

    $lines.Add("## \`$rel\`")
    $lines.Add("")
    $lines.Add("\`\`\`$lang")
    $content = Get-Content $f.FullName -Raw -Encoding UTF8
    $lines.Add($content)
    $lines.Add("\`\`\`")
    $lines.Add("")
}

$totalFiles = $files.Count
$outPath    = Join-Path $ROOT $OUT

$lines.Add("---")
$lines.Add("")
$lines.Add("## Resumo")
$lines.Add("")
$lines.Add("| | |")
$lines.Add("|---|---|")
$lines.Add("| Arquivos incluídos | $totalFiles |")
$lines.Add("| Commit base | $COMMIT |")
$lines.Add("| Gerado em | $DATE |")

$lines | Out-File -FilePath $outPath -Encoding UTF8

$size = "{0:N0} KB" -f ((Get-Item $outPath).Length / 1KB)

Write-Host ""
Write-Host "✅  qa-bundle.md gerado com sucesso!" -ForegroundColor Green
Write-Host "   Arquivos : $totalFiles"
Write-Host "   Tamanho  : $size"
Write-Host "   Saída    : $outPath"
Write-Host ""
Write-Host "👉  Cole o conteúdo de qa-bundle.md em ChatGPT, Claude ou envie para um dev externo."
Write-Host ""
