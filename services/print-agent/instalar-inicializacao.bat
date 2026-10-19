@echo off
chcp 65001 >nul
title Sistema Arte - Configurar Inicialização do Agente

echo ========================================================
echo   Configuração de Inicialização Automática com o Windows
echo ========================================================
echo.

set AGENT_DIR=%~dp0
set VBS_LAUNCHER=%AGENT_DIR%iniciar-silencioso.vbs
set TARGET_BAT=%AGENT_DIR%iniciar-agente.bat

echo Criando lançador em segundo plano (sem janela de prompt)...
(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo WshShell.Run chr(34^) ^& "%TARGET_BAT%" ^& Chr(34^), 0
echo Set WshShell = Nothing
) > "%VBS_LAUNCHER%"

echo Criando atalho na pasta Inicializar do Usuário...
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_DIR%\SistemaArte-PrintAgent.lnk

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_LAUNCHER%\"'; $s.WorkingDirectory = '%AGENT_DIR%'; $s.Description = 'Sistema Arte - Agente de Impressão Local'; $s.Save()"

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCESSO] O agente foi configurado para iniciar automaticamente com o Windows!
    echo Local do atalho: %SHORTCUT_PATH%
    echo.
) else (
    echo.
    echo [ERRO] Não foi possível criar o atalho de inicialização.
    echo.
)

pause
