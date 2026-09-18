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

# --- atualizacao automatica --------------------------------------------------
# O app se atualiza sozinho ao abrir. Se a internet estiver fora, se houver
# alteracao sua sem salvar, ou se o git nao estiver instalado, ele apenas avisa
# e continua com a versao que ja esta no disco: atualizar nunca impede de usar.
if ((Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path ".git")) {
  Passo "Procurando atualizacoes..."

  # arquivos que o proprio app regera: se so eles estiverem sujos, restaura e segue
  foreach ($gerado in @("artifact/index.html")) {
    $estado = git status --porcelain -- $gerado 2>$null
    if ($estado) { git checkout -- $gerado 2>$null }
  }

  # arquivo novo que voce colocou na pasta (--untracked-files=no) nao impede o pull:
  # so alteracao em arquivo do projeto impede
  $sujo = (git status --porcelain --untracked-files=no 2>$null | Measure-Object).Count
  if ($sujo -gt 0) {
    Write-Host "  Voce alterou arquivos do projeto: pulei a atualizacao." -ForegroundColor Yellow
    git status --short --untracked-files=no 2>$null | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  } else {
    $antes = (git rev-parse HEAD 2>$null)
    git pull --ff-only 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $depois = (git rev-parse HEAD 2>$null)
      if ($antes -ne $depois) {
        $quantas = (git rev-list --count "$antes..$depois" 2>$null)
        Write-Host "  Atualizado: $quantas novidade(s)." -ForegroundColor Green
        git log --oneline "$antes..$depois" 2>$null | Select-Object -First 3 | ForEach-Object {
          Write-Host "    $_" -ForegroundColor DarkGray
        }
      } else {
        Passo "Ja esta na versao mais nova."
      }
    } else {
      Write-Host "  Nao consegui atualizar agora (sem internet?). Seguindo com a versao local." -ForegroundColor Yellow
    }
  }
}

# --- dependencias ------------------------------------------------------------
$precisaInstalar = -not (Test-Path "node_modules")
if (-not $precisaInstalar -and (Test-Path "package-lock.json")) {
  $lock = (Get-Item "package-lock.json").LastWriteTime
  $mods = (Get-Item "node_modules").LastWriteTime
  if ($lock -gt $mods) {
    Passo "As dependencias mudaram na atualizacao: instalando as novas."
    $precisaInstalar = $true
  }
}

if ($precisaInstalar) {
  Titulo "Instalando o que o app precisa. Na primeira vez leva alguns minutos."
  npm install
  if ($LASTEXITCODE -ne 0) { Erro "A instalacao das dependencias falhou (npm install)."; Fim }
  npx playwright install chromium
  if ($LASTEXITCODE -ne 0) { Erro "O navegador de renderizacao nao baixou (playwright)."; Fim }
  if (Test-Path "node_modules") { (Get-Item "node_modules").LastWriteTime = Get-Date }
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
