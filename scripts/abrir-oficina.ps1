# Abre la oficina de Javbots en el navegador; la arranca primero si no está corriendo.
# Uso: el acceso directo "Javbots" (scripts/crear-acceso-directo.ps1), o
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/abrir-oficina.ps1 [-Port 3100]
# La oficina corre en una consola minimizada: ciérrala para apagarla.

param([int]$Port = 3100)

$ErrorActionPreference = 'Stop'
$serverJson = Join-Path $HOME '.pixel-agents\server.json'
$cli = Join-Path $PSScriptRoot '..\dist\cli.js'

function Test-Office {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    return $r.status -eq 'ok'
  } catch {
    return $false
  }
}

if (-not (Test-Office)) {
  # A server.json left by a dead process makes the CLI "reuse" a server that isn't there.
  if (Test-Path $serverJson) {
    $info = Get-Content $serverJson -Raw | ConvertFrom-Json
    if (-not (Get-Process -Id $info.pid -ErrorAction SilentlyContinue)) {
      Remove-Item $serverJson
    }
  }
  if (-not (Test-Path $cli)) {
    throw "No encuentro $cli. Corre 'npm run compile' en el proyecto."
  }
  # Through a shortcut to the classic console (conhost): the window shows the Javbots icon and name in the
  # taskbar. A plain 'node' window (or Windows Terminal, the default on Windows 11) shows its own icon instead.
  $node = (Get-Command node).Source
  $cliFull = (Resolve-Path $cli).Path
  $lnkDir = Join-Path $env:LOCALAPPDATA 'Javbots'
  New-Item -ItemType Directory -Force $lnkDir | Out-Null
  $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $lnkDir 'Javbots.lnk'))
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\conhost.exe'
  $lnk.Arguments = "`"$node`" `"$cliFull`" --port $Port"
  $lnk.WorkingDirectory = Split-Path $cliFull
  $lnk.IconLocation = (Resolve-Path (Join-Path $PSScriptRoot 'javbots.ico')).Path
  $lnk.WindowStyle = 7  # minimized
  $lnk.Save()
  Start-Process $lnk.FullName
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Office)) {
    if ((Get-Date) -gt $deadline) { throw "La oficina no respondió en el puerto $Port." }
    Start-Sleep -Milliseconds 500
  }
}

# The token changes on every start; the server writes it here.
$deadline = (Get-Date).AddSeconds(10)
while (-not (Test-Path $serverJson)) {
  if ((Get-Date) -gt $deadline) { throw "No apareció $serverJson." }
  Start-Sleep -Milliseconds 300
}
$info = Get-Content $serverJson -Raw | ConvertFrom-Json
Start-Process "http://127.0.0.1:$($info.port)/?token=$($info.token)"
