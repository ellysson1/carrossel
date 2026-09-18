@echo off
chcp 65001 >nul
title Carrossel No Controle
cd /d "%~dp0"

echo.
echo   Carrossel No Controle
echo   ---------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   O Node.js nao esta instalado nesta maquina.
  echo   Instale o Node LTS em https://nodejs.org e abra este atalho de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   Primeira vez: instalando o que o app precisa. Isso leva alguns minutos.
  echo.
  call npm install || goto :erro
  call npx playwright install chromium || goto :erro
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo   Criei o arquivo .env. Coloque a sua chave de imagem nele e reabra o atalho.
  echo   ^(KIE_API_KEY para a Kie, GEMINI_API_KEY para o Google^)
  echo.
  notepad ".env"
)

echo   Subindo o app. O navegador abre sozinho em alguns segundos.
echo   Deixe esta janela aberta enquanto estiver usando.
echo   Para parar: feche esta janela.
echo.

call npm start -- --rede
goto :fim

:erro
echo.
echo   Algo falhou na instalacao. Copie a mensagem acima e mande para o Claude.
echo.
pause

:fim
