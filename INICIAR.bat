@echo off
echo.
echo ============================================
echo   Sistema Oficina — Inicializando...
echo ============================================
echo.

echo [1/3] Instalando dependencias do backend...
cd backend
call npm install
echo.

echo [2/3] Compilando frontend (aguarde ~30s)...
cd ..\frontend
call npm install --silent
call npm run build
if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao compilar o frontend!
  echo Verifique se a pasta frontend existe e tem package.json
  pause
  exit /b 1
)
echo.

echo [3/3] Iniciando servidor...
cd ..\backend
echo.
echo  Acesse: http://localhost:3001
echo  Para parar: Ctrl+C
echo.
node server.js
pause
