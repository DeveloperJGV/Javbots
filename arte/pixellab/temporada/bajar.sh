#!/bin/sh
# Baja los originales de trabajos.txt que falten: python arte/pixellab/ver.py <job> <nombre> temporada/<t>/originales
cd "$(dirname "$0")"
grep -v '^#' trabajos.txt | while read job t nombre; do
  [ -z "$job" ] && continue
  [ -f "$t/originales/$nombre.png" ] && continue
  python ../ver.py "$job" "$nombre" "$t/originales" 2>/dev/null || { echo "pendiente $t $nombre"; rm -f "$t/originales/$nombre.png"; }
done
