@echo off
setlocal
chcp 65001 >nul
title Diagnostico - Carrossel No Controle
cd /d "%~dp0"
set "ARQ=%~dp0diagnostico.txt"

echo Coletando informacoes... isso leva menos de um minuto.

> "%ARQ%" echo === DIAGNOSTICO CARROSSEL NO CONTROLE ===
>> "%ARQ%" echo Data: %date% %time%
>> "%ARQ%" echo Pasta: %cd%
>> "%ARQ%" echo.
>> "%ARQ%" echo --- node ---
>> "%ARQ%" 2>&1 node -v
>> "%ARQ%" echo --- npm ---
>> "%ARQ%" 2>&1 npm -v
>> "%ARQ%" echo --- versao do projeto ---
>> "%ARQ%" 2>&1 git log -1 --oneline
>> "%ARQ%" echo --- arquivos ---
>> "%ARQ%" 2>&1 dir /b
>> "%ARQ%" echo --- node_modules existe? ---
>> "%ARQ%" 2>&1 if exist node_modules (echo SIM) else (echo NAO)
>> "%ARQ%" echo --- .env existe? ---
>> "%ARQ%" 2>&1 if exist .env (echo SIM) else (echo NAO)
>> "%ARQ%" echo --- artifact/index.html existe? ---
>> "%ARQ%" 2>&1 if exist artifact\index.html (echo SIM) else (echo NAO)
>> "%ARQ%" echo --- porta 4173 em uso? ---
>> "%ARQ%" 2>&1 netstat -ano -p tcp ^| findstr ":4173"
>> "%ARQ%" echo --- doctor ---
>> "%ARQ%" 2>&1 node bin/carrossel.js doctor --rapido
>> "%ARQ%" echo --- tentando montar a pagina ---
>> "%ARQ%" 2>&1 node scripts/build-artifact.js
>> "%ARQ%" echo === FIM ===

echo.
echo   Pronto. O arquivo diagnostico.txt esta na pasta do projeto.
echo   Abra, copie o conteudo e mande para o Claude.
echo.
start "" notepad "%ARQ%"
pause
endlocal
