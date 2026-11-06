"""Builds the PERFIL_SCREEN wall piece (features/perfil): the frame of the freelance room's padlock screen with an
empty green-phosphor screen. Its text and bars are painted live by webview/perfilFurniture.ts.

    python features/perfil/arte/armar.py
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "webview-ui/public/assets/furniture/FREELANCE_POSTER/FREELANCE_POSTER.png"
OUT_DIR = ROOT / "features/perfil/assets/furniture/PERFIL_SCREEN"

# The screen inside the frame (inclusive), as in webview/constants.ts PERFIL_SCREEN_AREA
X0, Y0, X1, Y1 = 4, 4, 27, 27
SCREEN = (0x10, 0x17, 0x14, 255)
GRID = (0x16, 0x22, 0x1c, 255)  # faint scanlines every other row
GLARE = (0x1d, 0x2c, 0x25, 255)  # top-left corner glare

im = Image.open(SOURCE).convert("RGBA")
for y in range(Y0, Y1 + 1):
    for x in range(X0, X1 + 1):
        im.putpixel((x, y), GRID if (y - Y0) % 2 == 1 else SCREEN)
for i in range(4):
    for j in range(4 - i):
        im.putpixel((X0 + i, Y0 + j), GLARE)

OUT_DIR.mkdir(parents=True, exist_ok=True)
im.save(OUT_DIR / "PERFIL_SCREEN.png")
manifest = {
    "id": "PERFIL_SCREEN",
    "name": "Pantalla de perfil",
    "category": "wall",
    "type": "asset",
    "canPlaceOnWalls": True,
    "canPlaceOnSurfaces": False,
    "backgroundTiles": 0,
    "width": 32,
    "height": 32,
    "footprintW": 2,
    "footprintH": 2,
}
(OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("ok", OUT_DIR)
