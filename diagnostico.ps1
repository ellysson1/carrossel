# Junta tudo que o Claude precisa para achar o problema, num arquivo so.
#   powershell -ExecutionPolicy Bypass -File .\diagnostico.ps1

Set-Location -LiteralPath $PSScriptRoot
$arq = Join-Path $PSScriptRoot 'diagnostico.txt'

function Secao($nome, $bloco) {
  "--- $nome ---" | Out-File -FilePath $arq -Append -Encoding utf8
  try { (& $bloco) 2>&1 | Out-String | Out-File -FilePath $arq -Append -Encoding utf8 }
  catch { "ERRO: $_" | Out-File -FilePath $arq -Append -Encoding utf8 }
}

"=== DIAGNOSTICO CARROSSEL NO CONTROLE ===" | Out-File -FilePath $arq -Encoding utf8
"Data: $(Get-Date -Format 'dd/MM/yyyy HH:mm')" | Out-File -FilePath $arq -Append -Encoding utf8
"Pasta: $PSScriptRoot" | Out-File -FilePath $arq -Append -Encoding utf8
"Windows: $([System.Environment]::OSVersion.VersionString)" | Out-File -FilePath $arq -Append -Encoding utf8
"PowerShell: $($PSVersionTable.PSVersion)" | Out-File -FilePath $arq -Append -Encoding utf8
"Politica de execucao: $(Get-ExecutionPolicy)" | Out-File -FilePath $arq -Append -Encoding utf8

Secao 'node'        { node -v }
Secao 'npm'         { npm -v }
Secao 'versao'      { git log -1 --oneline }
Secao 'arquivos'    { Get-ChildItem -Name }
Secao 'presencas'   {
  "node_modules: $(Test-Path node_modules)"
  ".env: $(Test-Path .env)"
  "artifact/index.html: $(Test-Path artifact\index.html)"
  "Abrir-Carrossel.ps1: $(Test-Path Abrir-Carrossel.ps1)"
}
Secao 'atalho na area de trabalho' {
  $d = (New-Object -ComObject WScript.Shell).SpecialFolders('Desktop')
  Get-ChildItem -LiteralPath $d -Filter '*Carrossel*' | Select-Object Name, Length
}
Secao 'porta 4173'  { Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue | Select-Object State, OwningProcess }
Secao 'doctor'      { node bin/carrossel.js doctor --rapido }
Secao 'build'       { node scripts/build-artifact.js }

"=== FIM ===" | Out-File -FilePath $arq -Append -Encoding utf8

Write-Host ""
Write-Host "  Pronto: $arq" -ForegroundColor Green
Write-Host "  Abra, copie tudo e mande para o Claude." -ForegroundColor Gray
Write-Host ""
Start-Process notepad $arq
Read-Host "  Pressione Enter para fechar"
