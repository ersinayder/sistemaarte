@echo off
chcp 65001 >nul
title Sistema Arte - Agente de Impressão Local (PC Edu)

echo ========================================================
echo   Sistema Arte e Molduras - Agente de Impressão Local
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Node.js não foi encontrado no PATH do sistema.
    echo Por favor, instale o Node.js 22 LTS ou superior.
    pause
    exit /b 1
)

set NODE_EXE="C:\Program Files\nodejs\node.exe"
if not exist %NODE_EXE% set NODE_EXE=node

:loop
echo [%DATE% %TIME%] Iniciando o agente de impressão...
%NODE_EXE% agent.js

echo.
echo [AVISO] O processo do agente foi encerrado com código %ERRORLEVEL%.
echo Reiniciando o agente em 5 segundos... (Pressione Ctrl+C para cancelar)
timeout /t 5 /nobreak >nul
goto loop
