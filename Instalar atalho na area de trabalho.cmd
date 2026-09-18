@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command ^
  "$w = New-Object -ComObject WScript.Shell; $l = $w.CreateShortcut([IO.Path]::Combine($w.SpecialFolders('Desktop'),'Carrossel No Controle.lnk')); $l.TargetPath = (Join-Path $PWD 'Abrir Carrossel.cmd'); $l.WorkingDirectory = $PWD; $l.IconLocation = 'shell32.dll,165'; $l.Description = 'Gerador de carrosseis do @profellyssonrocha'; $l.Save()"
echo.
echo   Pronto: o atalho "Carrossel No Controle" esta na sua area de trabalho.
echo   Daqui para frente e so clicar nele.
echo.
pause
