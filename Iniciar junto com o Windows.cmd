@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command ^
  "$w = New-Object -ComObject WScript.Shell; $inicio = $w.SpecialFolders('Startup'); $l = $w.CreateShortcut([IO.Path]::Combine($inicio,'Carrossel No Controle.lnk')); $l.TargetPath = (Join-Path $PWD 'Abrir Carrossel.cmd'); $l.WorkingDirectory = $PWD; $l.IconLocation = 'shell32.dll,165'; $l.WindowStyle = 7; $l.Save(); Write-Host ''; Write-Host ('  Atalho criado em ' + $inicio)"
echo.
echo   O app passa a subir sozinho quando o Windows liga, minimizado.
echo   Assim o icone do celular funciona sem voce abrir nada no PC.
echo.
echo   Para desfazer: apague "Carrossel No Controle.lnk" da pasta acima
echo   (tecla Windows + R, digite shell:startup).
echo.
pause
