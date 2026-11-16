@echo off
rem wb2-cross one-click setup (Windows). ASCII-only on purpose.
rem Usage:  start.cmd
rem         start.cmd --upstream https://api.deepseek.com --api-key sk-xxx
setlocal
cd /d "%~dp0"
node "%~dp0src\cli.mjs" install %*
echo.
node "%~dp0src\cli.mjs" doctor
endlocal
