@echo off
setlocal
chcp 65001 >nul
title Carrossel No Controle
cd /d "%~dp0"
set "LOG=%~dp0ultimo-erro.txt"

echo.
echo   Carrossel No Controle
echo   ---------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] O Node.js nao esta instalado nesta maquina.
  echo.
  echo       Instale o Node LTS em https://nodejs.org
  echo       Depois FECHE esta janela, abra de novo e clique neste atalho outra vez.
  goto :parar
)

for /f "delims=" %%v in ('node -v 2^>nul') do set "NODEV=%%v"
echo   Node %NODEV%

if not exist "package.json" (
  echo   [X] Este atalho nao esta na pasta do projeto.
  echo       Ele precisa ficar dentro da pasta "carrossel", junto do package.json.
  goto :parar
)

if not exist "node_modules" (
  echo.
  echo   Primeira vez: instalando o que o app precisa. Leva alguns minutos.
  echo.
  call npm install
  if errorlevel 1 (
    echo   [X] A instalacao falhou. O detalhe esta em ultimo-erro.txt
    call npm install > "%LOG%" 2>&1
    goto :parar
  )
  call npx playwright install chromium
  if errorlevel 1 (
    echo   [X] O navegador nao baixou. O detalhe esta em ultimo-erro.txt
    call npx playwright install chromium > "%LOG%" 2>&1
    goto :parar
  )
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo   Criei o arquivo .env. Coloque a sua chave de imagem nele:
  echo     KIE_API_KEY=...     para a Kie
  echo     GEMINI_API_KEY=...  para o Google
  echo.
  echo   Salve, feche o Bloco de Notas e clique no atalho de novo.
  notepad ".env"
  goto :parar
)

echo   Subindo o app. O navegador abre sozinho em alguns segundos.
echo   Deixe esta janela aberta enquanto estiver usando. Para parar: feche a janela.
echo.

call npm start -- --rede
set "SAIDA=%errorlevel%"

echo.
if not "%SAIDA%"=="0" (
  echo   [X] O app parou com erro ^(codigo %SAIDA%^).
  echo       Rode "Diagnostico.cmd" e mande o arquivo diagnostico.txt para o Claude.
) else (
  echo   App encerrado.
)

:parar
echo.
echo   ----------------------------------------------------------
echo   Esta janela NAO fecha sozinha: leia a mensagem acima.
echo   ----------------------------------------------------------
echo.
pause
endlocal
