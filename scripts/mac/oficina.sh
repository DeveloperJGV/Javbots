#!/bin/bash
# Abre la oficina de Javbots en el navegador; la arranca primero si no está corriendo.
# La usa la app del Dock (scripts/mac/crear-app.sh); también sirve a mano:
#   scripts/mac/oficina.sh            abre (y arranca si hace falta)
#   scripts/mac/oficina.sh detener    apaga el servidor
# Equivale a scripts/abrir-oficina.ps1 de Windows. El registro del servidor queda en ~/.pixel-agents/oficina.log.

set -u

PUERTO="${PUERTO:-3100}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$RAIZ/dist/cli.js"
DATOS="$HOME/.pixel-agents"
SERVER_JSON="$DATOS/server.json"
LOG="$DATOS/oficina.log"
# Una app abierta desde el Dock no trae el PATH de la terminal: crear-app.sh le pasa la ruta de node.
NODE="${NODE:-$(command -v node || echo /opt/homebrew/bin/node)}"

falla() {
  echo "$1" >&2
  exit 1
}

viva() {
  curl -s -m 2 "http://127.0.0.1:$PUERTO/api/health" | grep -q '"status":"ok"'
}

# Un campo de server.json (port, token, pid).
campo() {
  "$NODE" -e 'const d = require(process.argv[1]); const v = d[process.argv[2]] ?? (process.argv[2] === "token" ? d.authToken : undefined); if (v !== undefined) console.log(v);' "$SERVER_JSON" "$1" 2>/dev/null
}

# PID del servidor de la oficina según server.json, solo si de verdad es nuestro cli.js.
pid_oficina() {
  [ -f "$SERVER_JSON" ] || return 1
  local pid
  pid="$(campo pid)"
  [ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null | grep -q "dist/cli.js" && echo "$pid"
}

abrir() {
  [ -x "$NODE" ] || falla "No encuentro node en $NODE. Instálalo (brew install node) y vuelve a crear la app."
  if ! viva; then
    # Un server.json de un proceso muerto hace que el CLI "reuse" un servidor que no está.
    if [ -f "$SERVER_JSON" ] && [ -z "$(pid_oficina)" ]; then
      rm -f "$SERVER_JSON"
    fi
    [ -f "$CLI" ] || falla "No encuentro $CLI. Corre 'npm run compile' en el proyecto."
    mkdir -p "$DATOS"
    # Sin CLAUDE_CONFIG_DIR: la oficina encuentra sola los perfiles de Claude Code (claudeProfiles.ts).
    # La redirección va sobre TODO el bloque y `exec` no deja shell intermedio: si algo conserva la salida de este
    # script, la app del Dock (do shell script) se queda esperando para siempre y ya no responde a Salir.
    # El registro solo para ti: trae la dirección de la oficina (con su clave).
    : >"$LOG" && chmod 600 "$LOG"
    (cd "$RAIZ" && exec env -u CLAUDE_CONFIG_DIR nohup "$NODE" "$CLI" --port "$PUERTO") </dev/null >"$LOG" 2>&1 &
    for _ in $(seq 60); do
      viva && break
      sleep 0.5
    done
    viva || falla "La oficina no respondió en el puerto $PUERTO. Revisa $LOG."
  fi

  # La clave cambia en cada arranque; el servidor la escribe aquí.
  for _ in $(seq 30); do
    [ -f "$SERVER_JSON" ] && break
    sleep 0.3
  done
  [ -f "$SERVER_JSON" ] || falla "No apareció $SERVER_JSON."
  open "http://127.0.0.1:$(campo port)/?token=$(campo token)"
}

detener() {
  local pid
  pid="$(pid_oficina)" || return 0
  kill "$pid"
  for _ in $(seq 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.25
  done
  kill -9 "$pid" 2>/dev/null
  return 0
}

case "${1:-abrir}" in
  abrir) abrir ;;
  detener) detener ;;
  *) falla "Uso: $0 [abrir|detener]" ;;
esac
