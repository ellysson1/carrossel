# Cria o atalho do app na area de trabalho (e, se voce quiser, na inicializacao
# do Windows). O atalho aponta para o powershell.exe, nao para um arquivo .cmd
# ou .ps1 solto: assim ele abre com um clique, sem depender de associacao de
# arquivo nem de politica de execucao.
#
# Rode uma vez, no PowerShell, de dentro da pasta do projeto:
#   powershell -ExecutionPolicy Bypass -File .\instalar-atalho.ps1

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$script   = Join-Path $PSScriptRoot 'Abrir-Carrossel.ps1'
if (-not (Test-Path $script)) { throw "Nao achei Abrir-Carrossel.ps1 em $PSScriptRoot" }

$psExe    = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shell    = New-Object -ComObject WScript.Shell
$desktop  = $shell.SpecialFolders('Desktop')

function NovoAtalho($destino, $nome, $minimizado) {
  $lnk = $shell.CreateShortcut((Join-Path $destino "$nome.lnk"))
  $lnk.TargetPath       = $psExe
  $lnk.Arguments        = '-NoExit -ExecutionPolicy Bypass -File "' + $script + '"'
  $lnk.WorkingDirectory = $PSScriptRoot
  $lnk.IconLocation     = 'shell32.dll,165'
  $lnk.Description      = 'Gerador de carrosseis do @profellyssonrocha'
  if ($minimizado) { $lnk.WindowStyle = 7 }
  $lnk.Save()
  return (Join-Path $destino "$nome.lnk")
}

$criado = NovoAtalho $desktop 'Carrossel No Controle' $false
Write-Host ""
Write-Host "  Atalho criado:" -ForegroundColor Green
Write-Host "  $criado" -ForegroundColor Gray
Write-Host ""
Write-Host "  Daqui para frente e so dar dois cliques nele." -ForegroundColor White
Write-Host ""

$r = Read-Host "  Quer que o app suba sozinho quando o Windows ligar? (s/N)"
if ($r -eq 's' -or $r -eq 'S') {
  $inicio = $shell.SpecialFolders('Startup')
  $auto = NovoAtalho $inicio 'Carrossel No Controle' $true
  Write-Host ""
  Write-Host "  Pronto: $auto" -ForegroundColor Green
  Write-Host "  O app passa a subir minimizado no login, entao o icone do celular" -ForegroundColor Gray
  Write-Host "  funciona sem voce abrir nada no PC." -ForegroundColor Gray
  Write-Host "  Para desfazer: apague esse arquivo (Windows+R, shell:startup)." -ForegroundColor DarkGray
}

Write-Host ""
Read-Host "  Pressione Enter para fechar"
