# Piezas de Light Labs dibujadas por código (sin PixelLab).
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from muebles import CONTORNO, pintar  # noqa: E402

# ── E-Tank (piso, 1×1 = 16×16): lata celeste arriba, azul abajo, con la "E" ──
ETANK = [
    '................',
    '.....oooooo.....',
    '....oWWWWWWo....',
    '...oCCCCCCCCo...',
    '...oCWCCCCCCo...',
    '...oCCCCCCCCo...',
    '...oooooooooo...',
    '...oBBBBBBBBo...',
    '...oBBEEEBBBo...',
    '...oBBEBBBBBo...',
    '...oBBEEBBBBo...',
    '...oBBEBBBBBo...',
    '...oBBEEEBBBo...',
    '...oBBBBBBBBo...',
    '....oooooooo....',
    '................',
]
ETANK_COL = {'o': CONTORNO, 'W': (230, 250, 255, 255), 'C': (0, 232, 216, 255), 'B': (0, 90, 220, 255),
             'E': (250, 250, 250, 255)}


def etank():
    return pintar(ETANK, ETANK_COL)
