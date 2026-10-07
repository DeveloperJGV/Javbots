# Abre la oficina de Pixel Agents en el navegador; la arranca primero si no está corriendo.
# Uso: el acceso directo "Pixel Agents" (scripts/crear-acceso-directo.ps1), o
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
  Start-Process -FilePath 'node' -ArgumentList "`"$cli`"", '--port', $Port -WindowStyle Minimized
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
