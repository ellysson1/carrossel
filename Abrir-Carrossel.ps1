# Abre o app Carrossel No Controle.
# Escrito sem acentos de proposito: o Windows PowerShell 5.1 le scripts em ANSI.
# Este arquivo e o motor do atalho da area de trabalho.

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Titulo($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor White }
function Passo($t)  { Write-Host "  $t" -ForegroundColor Gray }
function Erro($t)   { Write-Host ""; Write-Host "  [X] $t" -ForegroundColor Red }
function Fim {
  Write-Host ""
  Write-Host "  ----------------------------------------------------------" -ForegroundColor DarkGray
  Read-Host "  Pressione Enter para fechar"
  exit 1
}

$Host.UI.RawUI.WindowTitle = "Carrossel No Controle"
Titulo "Carrossel No Controle"
Write-Host "  pasta: $PSScriptRoot" -ForegroundColor DarkGray

# --- Node -------------------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Erro "O Node.js nao esta instalado (ou nao esta no PATH desta sessao)."
  Write-Host "      Instale o Node LTS em https://nodejs.org" -ForegroundColor Gray
  Write-Host "      Depois reinicie o computador e clique no atalho de novo." -ForegroundColor Gray
  Fim
}
Passo ("Node " + (node -v))

if ($PSScriptRoot -match 'OneDrive') {
  Write-Host ""
  Write-Host "  Aviso: o projeto esta dentro do OneDrive." -ForegroundColor Yellow
  Write-Host "  A sincronizacao costuma travar arquivos e deixar o app lento." -ForegroundColor Gray
  Write-Host "  Se der problema, mova a pasta para C:\carrossel e rode o instalar-atalho de novo." -ForegroundColor Gray
}

if (-not (Test-Path "package.json")) {
  Erro "Nao achei o package.json nesta pasta."
  Write-Host "      O atalho precisa apontar para a pasta do projeto (carrossel)." -ForegroundColor Gray
  Fim
}

# --- dependencias ------------------------------------------------------------
if (-not (Test-Path "node_modules")) {
  Titulo "Primeira vez: instalando o que o app precisa. Leva alguns minutos."
  npm install
  if ($LASTEXITCODE -ne 0) { Erro "A instalacao das dependencias falhou (npm install)."; Fim }
  npx playwright install chromium
  if ($LASTEXITCODE -ne 0) { Erro "O navegador de renderizacao nao baixou (playwright)."; Fim }
}

# --- .env --------------------------------------------------------------------
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Titulo "Criei o arquivo .env. Coloque a sua chave de imagem nele:"
  Passo "KIE_API_KEY=...     para a Kie"
  Passo "GEMINI_API_KEY=...  para o Google Gemini"
  Write-Host ""
  Passo "Salve, feche o Bloco de Notas e clique no atalho de novo."
  Start-Process notepad ".env" -Wait
  Fim
}

# --- monta a pagina e sobe o servidor ---------------------------------------
Passo "Montando a pagina..."
node scripts/build-artifact.js
if ($LASTEXITCODE -ne 0) { Erro "Falhou ao montar a pagina (build-artifact)."; Fim }

Titulo "Subindo o app. O navegador abre sozinho em alguns segundos."
Passo "Deixe esta janela aberta enquanto estiver usando. Para parar: feche a janela."
Write-Host ""

node bin/carrossel.js app --rede

if ($LASTEXITCODE -ne 0) {
  Erro "O app parou com erro (codigo $LASTEXITCODE)."
  Write-Host "      Copie as linhas acima e mande para o Claude." -ForegroundColor Gray
  Fim
}

Write-Host ""
Passo "App encerrado."
Read-Host "  Pressione Enter para fechar"
