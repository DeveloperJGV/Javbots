#!/bin/bash
# Crea la app "Javbots" en ~/Applications para ponerla en el Dock.
#   scripts/mac/crear-app.sh
#   NOMBRE="Mi oficina" ID_APP=com.ejemplo.oficina scripts/mac/crear-app.sh   (otro nombre e identificador)
# La app se queda abierta mientras la oficina corre: clic en el Dock = abrir la pestaña;
# Salir (clic derecho → Salir, o Cmd+Q) = apagar el servidor. Toda la lógica está en oficina.sh;
# vuelve a correr este script si mueves el repo o cambias de node.

set -euo pipefail

NOMBRE="${NOMBRE:-Javbots}"
ID_APP="${ID_APP:-com.javbots.oficina}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DESTINO="$HOME/Applications/$NOMBRE.app"
ICO="$RAIZ/scripts/javbots.ico"
NODE="$(command -v node)" || { echo "No encuentro node en el PATH." >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

OFICINA="$RAIZ/scripts/mac/oficina.sh"
chmod +x "$OFICINA"

cat >"$TMP/app.applescript" <<EOF
-- Generado por scripts/mac/crear-app.sh. No lo edites: cambia oficina.sh o vuelve a crear la app.
property oficina : "$OFICINA"
property nodePath : "$NODE"

on correr(accion)
	do shell script "NODE=" & quoted form of nodePath & " " & quoted form of oficina & " " & accion
end correr

on abrirOficina()
	try
		correr("abrir")
	on error mensaje
		display dialog mensaje with title "$NOMBRE" buttons {"OK"} default button 1 with icon stop
		quit
	end try
end abrirOficina

on run
	abrirOficina()
end run

on reopen
	abrirOficina()
end reopen

on quit
	try
		correr("detener")
	end try
	continue quit
end quit
EOF

mkdir -p "$HOME/Applications"
rm -rf "$DESTINO"
osacompile -s -o "$DESTINO" "$TMP/app.applescript"

# Ícono: los PNG que ya trae javbots.ico (dibujados sin suavizar) → .icns.
python3 - "$ICO" "$TMP/Javbots.iconset" <<'EOF'
import os, struct, sys
data = open(sys.argv[1], 'rb').read()
out = sys.argv[2]
os.makedirs(out)
_, _, count = struct.unpack_from('<HHH', data, 0)
pngs = {}
for i in range(count):
    w, h, _, _, _, _, size, offset = struct.unpack_from('<BBBBHHII', data, 6 + 16 * i)
    pngs[w or 256] = data[offset:offset + size]
names = {16: ['icon_16x16'], 32: ['icon_16x16@2x', 'icon_32x32'], 64: ['icon_32x32@2x'],
         128: ['icon_128x128'], 256: ['icon_128x128@2x', 'icon_256x256']}
for side, files in names.items():
    for name in files:
        open(os.path.join(out, name + '.png'), 'wb').write(pngs[side])
EOF
iconutil -c icns -o "$DESTINO/Contents/Resources/applet.icns" "$TMP/Javbots.iconset"

# El ícono genérico de AppleScript vive en Assets.car y CFBundleIconName le da prioridad sobre applet.icns.
rm -f "$DESTINO/Contents/Resources/Assets.car"
plutil -remove CFBundleIconName "$DESTINO/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string "$ID_APP" "$DESTINO/Contents/Info.plist"
plutil -replace CFBundleName -string "$NOMBRE" "$DESTINO/Contents/Info.plist"
# Cambiar el ícono y el Info.plist rompe la firma de osacompile: se firma de nuevo (local).
codesign --force --deep -s - "$DESTINO"
touch "$DESTINO"

echo "Listo: $DESTINO"
echo "Arrástrala al Dock desde la ventana de Finder que se abre."
open -R "$DESTINO"
