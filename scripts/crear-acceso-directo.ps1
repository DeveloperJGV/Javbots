# Crea el acceso directo "Javbots" en el Escritorio y en el Menú Inicio (y quita los viejos "Pixel Agents").
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/crear-acceso-directo.ps1

$ErrorActionPreference = 'Stop'
$script = (Resolve-Path (Join-Path $PSScriptRoot 'abrir-oficina.ps1')).Path
$icon = (Resolve-Path (Join-Path $PSScriptRoot 'javbots.ico')).Path
$shell = New-Object -ComObject WScript.Shell
$places = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs')
)
foreach ($dir in $places) {
  $old = Join-Path $dir 'Pixel Agents.lnk'
  if (Test-Path $old) {
    Remove-Item $old
    Write-Output "Quitado: $old"
  }
  $lnk = $shell.CreateShortcut((Join-Path $dir 'Javbots.lnk'))
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
  $lnk.WorkingDirectory = Split-Path $script
  $lnk.IconLocation = $icon
  $lnk.Description = 'Abre la oficina de Javbots'
  $lnk.Save()
  Write-Output "Creado: $($lnk.FullName)"
}
