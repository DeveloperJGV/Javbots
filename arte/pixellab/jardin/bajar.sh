#!/bin/bash
# Baja los trabajos de jardin/trabajos.txt ("job_id nombre" por línea) que aún no estén en originales/.
# Uso: bash arte/pixellab/jardin/bajar.sh
cd "$(dirname "$0")/.." || exit 1
while read -r job nombre; do
  [ -z "$job" ] && continue
  [ -f "jardin/originales/$nombre.png" ] && continue
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    python ver.py "$job" "$nombre" jardin/originales 2>/dev/null && break
    sleep 5
  done
done < jardin/trabajos.txt
