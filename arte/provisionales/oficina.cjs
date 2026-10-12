// Plano grande de la oficina (Fase 4, provisional: muebles actuales + letreros).
//
//   Arriba:  Archivo Jedi | Código | Light Labs (Mega Man) | Lab. de Senku
//   Medio:   pasillo-galería (cuadros en memoria + pedestal del Anillo)
//   Abajo:   Taller DeLorean | Lab. Aperture | Becarios | Sótano
//
// Uso:  node arte/provisionales/oficina.cjs <layout.json> [<otro.json> ...]
// Reescribe tiles, colores, muebles y zonas; conserva mascotas y layoutRevision.
'use strict';
const fs = require('fs');

const COLS = 44;
const ROWS = 30;
const VOID = 255;
const WALL = 0;

// Floor pattern (TileType 1-9) + color per room
const C = {
  wall: { h: 214, s: 30, b: -100, c: -43 },
  library: { h: 35, s: 14, b: -28, c: -55 },
  code: { h: 222, s: 35, b: -62, c: -30 },
  web: { h: 225, s: 40, b: -48, c: -65 },
  senku: { h: 32, s: 28, b: -30, c: -55 },
  hall: { h: 18, s: 32, b: -36, c: -72 },
  garage: { h: 205, s: 14, b: -42, c: -20 },
  aperture: { h: 200, s: 6, b: 8, c: -45 },
  interns: { h: 209, s: 39, b: -25, c: -80 },
  basement: { h: 26, s: 26, b: -30, c: -10 },
};

const tiles = new Array(COLS * ROWS).fill(VOID);
const tileColors = new Array(COLS * ROWS).fill(null);
const areaTiles = new Array(COLS * ROWS).fill(null);
const carpetTiles = new Array(COLS * ROWS).fill(null);
const idx = (c, r) => r * COLS + c;
const fill = (c0, c1, r0, r1, type, color) => {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      tiles[idx(c, r)] = type;
      tileColors[idx(c, r)] = color;
    }
};
const wall = (c0, c1, r0, r1) => fill(c0, c1, r0, r1, WALL, C.wall);
const floor = (c0, c1, r0, r1, type, color) => fill(c0, c1, r0, r1, type, color);

// ── Rooms ─────────────────────────────────────────────────
floor(1, 12, 2, 10, 4, C.library); // Archivo Jedi
floor(14, 27, 2, 10, 4, C.code); // Código
floor(29, 35, 2, 10, 4, C.web); // Light Labs
floor(37, 42, 2, 10, 3, C.senku); // Senku
floor(1, 42, 12, 16, 6, C.hall); // Pasillo-galería
floor(1, 13, 18, 28, 10, C.garage); // Taller DeLorean (piso epóxico, patrón nuevo floor_9)
floor(15, 24, 18, 28, 2, C.aperture); // Aperture
floor(26, 35, 18, 28, 1, C.interns); // Becarios
floor(37, 42, 18, 28, 11, C.basement); // Sótano

// ── Floor paint (carpets: walkable, drawn under furniture) ───
/** carpet_3 = yellow painted line around a rectangle (garage bays). */
const BAY_LINE = { variant: 3, color: { h: 46, s: 85, b: 10, c: 0 }, accentColor: { h: 46, s: 85, b: 10, c: 0 } };
const carpet = (c0, c1, r0, r1, tile) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) carpetTiles[idx(c, r)] = tile;
};
carpet(4, 10, 20, 23, BAY_LINE); // Taller: bahía del AE86
carpet(4, 10, 25, 28, BAY_LINE); // Taller: bahía del DeLorean
// Código: línea de neón de Tron alrededor de la mesa grande
carpet(17, 23, 5, 9, { variant: 3, color: { h: 186, s: 100, b: 20, c: 0 }, accentColor: { h: 186, s: 100, b: 20, c: 0 } });
// Becarios: tapetes (carpet_0 = relleno + orilla clara)
carpet(26, 29, 20, 27, { variant: 0, color: { h: 28, s: 55, b: -20, c: 0 }, accentColor: { h: 40, s: 70, b: 20, c: 0 } });
carpet(31, 35, 22, 26, { variant: 0, color: { h: 350, s: 45, b: -25, c: 0 }, accentColor: { h: 20, s: 60, b: 15, c: 0 } });

// ── Walls (doors are floor gaps) ─────────────────────────
wall(0, 43, 1, 1); // top
wall(0, 0, 1, 28);
wall(43, 43, 1, 28);
wall(0, 43, 11, 11); // upper rooms | hall
wall(0, 43, 17, 17); // hall | lower rooms
for (const c of [13, 28, 36]) wall(c, c, 1, 11);
for (const c of [14, 25, 36]) wall(c, c, 17, 28);
const door = (c, r, color, type) => fill(c, c, r, r, type, color);
for (const c of [6, 7]) door(c, 11, C.hall, 6);
for (const c of [20, 21]) door(c, 11, C.hall, 6);
for (const c of [31, 32]) door(c, 11, C.hall, 6);
for (const c of [39, 40]) door(c, 11, C.hall, 6);
for (const c of [6, 7]) door(c, 17, C.hall, 6);
for (const c of [19, 20]) door(c, 17, C.hall, 6);
for (const c of [30, 31]) door(c, 17, C.hall, 6);
for (const c of [39, 40]) door(c, 17, C.hall, 6);
for (const r of [5, 6]) {
  door(13, r, C.code, 7); // Jedi <-> Código
  door(28, r, C.code, 7); // Código <-> Observatorio
}

// ── Furniture ─────────────────────────────────────────────
const furniture = [];
let n = 0;
const put = (type, col, row) => furniture.push({ uid: `of-${++n}`, type, col, row });
/** Mueble provisional ya reemplazado: se salta pero gasta su número, para no recorrer los uid de los demás. */
const quitar = () => ++n;

/** Desk + PC + bench (sits below, facing up). */
const deskPod = (col, row) => {
  put('DESK_FRONT', col, row);
  put('PC_FRONT_OFF', col + 1, row);
  put('CUSHIONED_BENCH', col + 1, row + 2);
};
/** Table for four with side PCs (copied from the original office). */
const tablePod = (col, row) => {
  put('TABLE_FRONT', col, row);
  put('WOODEN_CHAIR_SIDE', col - 1, row);
  put('WOODEN_CHAIR_SIDE', col - 1, row + 2);
  put('WOODEN_CHAIR_SIDE:left', col + 3, row);
  put('WOODEN_CHAIR_SIDE:left', col + 3, row + 2);
  put('PC_SIDE', col, row);
  put('PC_SIDE', col, row + 2);
  put('PC_SIDE:left', col + 2, row);
  put('PC_SIDE:left', col + 2, row + 2);
};

// Archivo Jedi
quitar(); // put('DOUBLE_BOOKSHELF', 1, 0);
quitar(); // put('DOUBLE_BOOKSHELF', 3, 0);
put('WINDOW', 5, 0);
quitar(); // put('DOUBLE_BOOKSHELF', 6, 0);
quitar(); // put('DOUBLE_BOOKSHELF', 8, 0);
quitar(); // put('DOUBLE_BOOKSHELF', 10, 0);
quitar(); // put('HANGING_PLANT', 12, 0);
quitar(); // put('SMALL_TABLE_FRONT', 3, 5);
quitar(); // put('CUSHIONED_BENCH', 3, 7);
quitar(); // put('CUSHIONED_BENCH', 4, 7);
quitar(); // put('SMALL_TABLE_FRONT', 8, 5);
quitar(); // put('CUSHIONED_BENCH', 8, 7);
quitar(); // put('CUSHIONED_BENCH', 9, 7);
quitar(); // put('MOONSTONES', 4, 6);
quitar(); // put('LAMP', 1, 3);
quitar(); // put('LAMP', 11, 3);
quitar(); // put('PLANT', 1, 8);
put('ZONE_POST_LIBRARY', 5, 8); // en (6,8) tapaba la entrada desde el pasillo

// Código
put('WINDOW', 15, 0);
quitar(); // put('WHITEBOARD', 17, 0);
put('WINDOW', 20, 0);
put('CLOCK', 22, 0);
quitar(); // put('WINDOW', 24, 0);
quitar(); // put('SMALL_PAINTING', 26, 0);
deskPod(15, 2);
deskPod(19, 2);
deskPod(23, 2);
tablePod(19, 6);
quitar(); // put('LAMP', 14, 7);
quitar(); // put('PLANT_2', 27, 8);
put('ZONE_POST_CODE', 26, 5);

// Light Labs (Mega Man)
for (const c of [29, 30, 31, 33, 34, 35]) {
  if (c === 33 || c === 34) quitar(); // ahí va el monitor de jefes
  else put('WINDOW', c, 0);
}
quitar(); // put('SMALL_PAINTING_2', 32, 0);
quitar(); // DESK_FRONT (30,3): ahora LIGHT_CONSOLE
quitar(); // PC_FRONT_OFF
quitar(); // put('CUSHIONED_BENCH', 31, 5);
quitar(); // put('SMALL_TABLE_SIDE', 35, 5);
quitar(); // put('COFFEE', 35, 6);
quitar(); // put('LAMP', 29, 7);
put('ZONE_POST_WEB', 34, 8);

// Laboratorio de Senku
quitar(); // put('WHITEBOARD', 37, 0);
quitar(); // put('WINDOW', 39, 0): ahora la bandera del Reino de la Ciencia
quitar(); // put('SMALL_PAINTING', 41, 0);
put('HANGING_PLANT', 42, 0);
quitar(); // put('SMALL_TABLE_FRONT', 38, 4);
quitar(); // put('COFFEE', 38, 5);
quitar(); // put('COFFEE', 39, 5);
quitar(); // put('CUSHIONED_BENCH', 38, 6);
quitar(); // put('CACTUS', 42, 3);
quitar(); // put('SMALL_TABLE_SIDE', 42, 6);
quitar(); // put('LAMP', 37, 8);
put('ZONE_POST_PERMISSION', 41, 8);

// Pasillo-galería (wall row 11 seen from the hall; cols 9-10, 14-15 and 17-18
// stay free for the memorial paintings)
put('SMALL_PAINTING', 3, 10);
put('ZONE_SIGN_COMMIT', 24, 10);
put('CLOCK', 33, 10);
put('SMALL_PAINTING_2', 41, 10);
put('PLANT', 1, 12);
put('PLANT_2', 42, 12);
put('LAMP', 12, 12);
put('LAMP', 30, 12);
quitar(); // put('POT', 26, 13): ahora RING_PEDESTAL

// Taller DeLorean
quitar(); // put('WHITEBOARD', 2, 16);
put('ZONE_SIGN_COMMANDS', 5, 16);
quitar(); // put('SMALL_PAINTING_2', 11, 16);
quitar(); // put('SMALL_TABLE_FRONT', 3, 20);
quitar(); // put('SMALL_TABLE_FRONT', 5, 20);
quitar(); // put('PC_FRONT_OFF', 4, 20);
quitar(); // put('CUSHIONED_BENCH', 4, 22);
quitar(); // put('CUSHIONED_BENCH', 5, 22);
quitar(); // put('SMALL_TABLE_SIDE', 13, 19);
quitar(); // put('COFFEE', 13, 20);
quitar(); // put('LAMP', 1, 23);
quitar(); // put('LAMP', 12, 23);
quitar(); // put('BIN', 13, 28);

// Laboratorio Aperture
quitar(); // put('WHITEBOARD', 16, 16);
quitar(); // put('SMALL_PAINTING_2', 23, 16);
quitar(); // DESK_FRONT (16,20): ahora TEST_TABLE
quitar(); // PC_FRONT_OFF
quitar(); // put('CUSHIONED_BENCH', 17, 22);
quitar(); // DESK_FRONT (20,20): ahora TEST_TABLE
quitar(); // PC_FRONT_OFF
quitar(); // put('CUSHIONED_BENCH', 21, 22);
quitar(); // put('SMALL_TABLE_SIDE', 24, 23);
quitar(); // put('COFFEE', 24, 24);
quitar(); // put('CACTUS', 15, 26);
quitar(); // put('LAMP', 23, 26);
put('ZONE_POST_TESTS', 19, 25);

// Becarios
quitar(); // put('LARGE_PAINTING', 27, 16);
quitar(); // put('SMALL_PAINTING', 32, 16);
put('CLOCK', 34, 16);
// lounge(27, 21): salita original, reemplazada por los sillones de Becarios v2
quitar(); // put('SOFA_FRONT', 28, 21);
quitar(); // put('SOFA_SIDE', 27, 22);
quitar(); // put('COFFEE_TABLE', 28, 22);
quitar(); // put('SOFA_SIDE:left', 30, 22);
quitar(); // put('SOFA_BACK', 28, 24);
quitar(); // put('COFFEE', 28, 23);
// lounge(32, 21): salita original, reemplazada por los sillones de Becarios v2
quitar(); // put('SOFA_FRONT', 33, 21);
quitar(); // put('SOFA_SIDE', 32, 22);
quitar(); // put('COFFEE_TABLE', 33, 22);
quitar(); // put('SOFA_SIDE:left', 35, 22);
quitar(); // put('SOFA_BACK', 33, 24);
quitar(); // put('COFFEE', 33, 23);
quitar(); // put('PLANT', 26, 18);
quitar(); // put('LAMP', 35, 18);
quitar(); // put('LAMP', 26, 26);
quitar(); // put('LARGE_PLANT', 33, 26);
put('ZONE_POST_INTERNS', 29, 26);

// Sótano
put('ZONE_SIGN_ERROR', 38, 16);
quitar(); // put('LAMP', 42, 19);
quitar(); // put('POT', 37, 27);
quitar(); // put('BIN', 42, 28);

// Fase 4: muebles de PixelLab (uid fijo para no recorrer la numeración de los demás)
const putFijo = (uid, type, col, row) => furniture.push({ uid, type, col, row });
putFijo('taller-delorean', 'DELOREAN', 5, 26);
putFijo('taller-condensador', 'FLUX_CAPACITOR', 8, 16);
putFijo('taller-banco', 'WORKBENCH', 10, 18);
putFijo('taller-gabinete', 'TOOL_CHEST', 1, 18);
putFijo('taller-llantas', 'TIRES', 3, 18);
putFijo('taller-ae86', 'AE86', 5, 21);
putFijo('taller-armadura', 'IRON_ARMOR', 12, 26);
putFijo('taller-plutonio', 'PLUTONIUM_CASE', 13, 23);
putFijo('taller-hoverboard', 'HOVERBOARD', 2, 17);
putFijo('taller-tofu', 'TOFU_SIGN', 11, 17);
// Light Labs (Mega Man)
putFijo('light-capsula', 'TELEPORTER', 34, 2);
putFijo('light-mesa', 'HELMET_TABLE', 32, 7);
putFijo('light-monitor', 'BOSS_MONITOR', 33, 0);
putFijo('light-consola', 'LIGHT_CONSOLE', 30, 3);
putFijo('light-etank', 'E_TANK', 29, 4);
// Taller, segunda tanda
putFijo('taller-gigante', 'IRON_GIANT_HEAD', 1, 26);
putFijo('taller-brazo', 'ROBOT_ARM', 12, 18);
putFijo('taller-gato', 'FLOOR_JACK', 11, 23);
// Aperture (Portal)
putFijo('aperture-portal-azul', 'PORTAL_BLUE', 16, 16);
putFijo('aperture-portal-naranja', 'PORTAL_ORANGE', 23, 16);
putFijo('aperture-mesa-1', 'TEST_TABLE', 16, 20);
putFijo('aperture-mesa-2', 'TEST_TABLE', 20, 20);
putFijo('aperture-torreta', 'TURRET', 23, 22);
putFijo('aperture-cubo', 'COMPANION_CUBE', 18, 27);
// Senku (Dr. Stone)
putFijo('senku-pizarron', 'FORMULA_BOARD', 37, 0);
putFijo('senku-estante', 'SENKU_SHELF', 41, 5);
putFijo('senku-bandera', 'SCIENCE_FLAG', 39, 0);
// Anillo
putFijo('anillo-pedestal', 'RING_PEDESTAL', 26, 12);
// Archivo Jedi (las piezas privadas solo están en el plano local ~/.pixel-agents/layout.json)
for (const c of [1, 3, 8, 10]) putFijo(`jedi-holocrones-${c}`, 'HOLOCRON_SHELF', c, 0); // en (6,0): los sables
// Sótano (The Binding of Isaac)
putFijo('sotano-isaac', 'ISAAC', 39, 23);
putFijo('sotano-corazon', 'HEART_PEDESTAL', 38, 20);
putFijo('sotano-cofre', 'ISAAC_CHEST', 38, 27);
putFijo('sotano-trampilla', 'TRAPDOOR', 39, 25);
// Becarios (cuarto de descanso)
putFijo('becarios-dulces', 'VENDING_MACHINE', 33, 18);
putFijo('sotano-puerta', 'BASEMENT_DOOR', 41, 16);
putFijo('sotano-antorcha', 'BASEMENT_TORCH', 37, 16);
putFijo('sotano-fogata-1', 'BASEMENT_FIRE', 37, 19);
putFijo('sotano-fogata-2', 'BASEMENT_FIRE', 42, 19);
putFijo('sotano-cebolla', 'ONION_PEDESTAL', 41, 20);
putFijo('sotano-lagrimas-1', 'TEAR_STAINS', 40, 23);
putFijo('sotano-roca-1', 'BASEMENT_ROCK', 37, 27);
putFijo('sotano-roca-marcada', 'BASEMENT_ROCK_MARKED', 42, 27);
putFijo('sotano-bomba', 'ISAAC_BOMB', 41, 27);
putFijo('senku-telescopio', 'SENKU_TELESCOPE', 37, 2);
putFijo('senku-rueda', 'SENKU_WATERWHEEL', 39, 2);
putFijo('senku-estatua-totoro', 'STATUE_TOTORO', 41, 2);
putFijo('senku-cola', 'SENKU_COLA', 40, 5);
putFijo('senku-estatua-goku', 'STATUE_GOKU', 39, 7);
putFijo('senku-galeria-ranma', 'STATUE_RANMA', 3, 12);
putFijo('senku-galeria-link', 'STATUE_LINK', 9, 12);
putFijo('senku-galeria-mario', 'STATUE_MARIO', 15, 12);
putFijo('senku-galeria-kirby', 'STATUE_KIRBY', 23, 12);
putFijo('senku-galeria-chief', 'STATUE_CHIEF', 35, 12);
putFijo('jedi-sables', 'LIGHTSABER_RACK', 6, 0);
putFijo('jedi-sable-rojo', 'LIGHTSABER_RED', 12, 0);
putFijo('jedi-mesa-holo', 'HOLO_TABLE', 6, 3);
putFijo('jedi-brasero-1', 'JEDI_BRAZIER', 1, 3);
putFijo('jedi-brasero-11', 'JEDI_BRAZIER', 12, 3);
putFijo('jedi-fantasma-capucha', 'JEDI_GHOST_HOOD', 3, 2);
putFijo('jedi-fantasma-anciano', 'JEDI_GHOST_ELDER', 10, 2);
putFijo('jedi-mesa-estudio-izq', 'JEDI_STUDY_TABLE', 2, 6);
putFijo('jedi-mesa-estudio-der', 'JEDI_STUDY_TABLE', 9, 6);
putFijo('jedi-piedras-lunares', 'MOONSTONES', 3, 6);
putFijo('jedi-cojin-consejo-1', 'JEDI_CUSHION', 5, 4);
putFijo('jedi-cojin-consejo-2', 'JEDI_CUSHION', 8, 4);
putFijo('jedi-cojin-consejo-3', 'JEDI_CUSHION', 6, 5);
putFijo('jedi-cojin-consejo-4', 'JEDI_CUSHION', 7, 5);
putFijo('jedi-cojin-izq-1', 'JEDI_CUSHION', 2, 8);
putFijo('jedi-cojin-izq-2', 'JEDI_CUSHION', 3, 8);
putFijo('jedi-cojin-der-1', 'JEDI_CUSHION', 9, 8);
putFijo('jedi-cojin-der-2', 'JEDI_CUSHION', 10, 8);
putFijo('taller-reflector-1', 'WORK_LIGHT', 2, 20);
putFijo('taller-reflector-2', 'WORK_LIGHT', 12, 20);
putFijo('taller-neon-88', 'NEON_88', 13, 17);
putFijo('taller-moto-kaneda', 'KANEDA_BIKE', 1, 22);
putFijo('becarios-chamarra-kaneda', 'KANEDA_JACKET', 32, 16);
putFijo('senku-mesa-tablones', 'SENKU_PLANK_TABLE', 38, 4);
putFijo('senku-tocon-1', 'SENKU_STUMP', 38, 6);
putFijo('senku-tocon-2', 'SENKU_STUMP', 39, 6);
putFijo('senku-foco', 'SENKU_BULB', 37, 8);
putFijo('senku-tabla-dias', 'SENKU_TALLY', 41, 0);
putFijo('light-vitrina-proto', 'PROTO_CASE', 29, 7);
putFijo('light-rush', 'RUSH', 34, 6);
putFijo('light-banco', 'LAB_STOOL', 31, 5);
putFijo('aperture-letrero-camara', 'CHAMBER_SIGN', 17, 16);
putFijo('aperture-wheatley', 'WHEATLEY', 21, 16);
putFijo('aperture-banco-1', 'APERTURE_STOOL', 17, 22);
putFijo('aperture-banco-2', 'APERTURE_STOOL', 21, 22);
putFijo('aperture-boton', 'BIG_BUTTON', 16, 27);
putFijo('aperture-pastel', 'CAKE', 23, 26);
putFijo('aperture-hierba', 'GREEN_HERB', 15, 18);
putFijo('aperture-maquina', 'TYPEWRITER', 23, 18);
putFijo('aperture-maletin', 'VIRUS_CASE', 15, 26);
putFijo('aperture-ambar', 'AMBER_PEDESTAL', 15, 23);
putFijo('aperture-lata', 'EMBRYO_CAN', 24, 27);
putFijo('becarios-velero', 'BOAT_PAINTING', 27, 16);
putFijo('becarios-poster-tetris', 'POSTER_TETRIS', 26, 16);
putFijo('becarios-poster-invasor', 'POSTER_INVADER', 29, 16);
putFijo('becarios-poster-fantasma', 'POSTER_GHOST', 35, 16);
putFijo('becarios-sillon-simpson', 'SOFA_SIMPSON', 27, 20);
putFijo('becarios-tele', 'RETRO_TV', 27, 24);
putFijo('becarios-puff-1', 'BEANBAG', 27, 26);
putFijo('becarios-puff-2', 'BEANBAG', 28, 26);
putFijo('becarios-sillon-friends', 'SOFA_ORANGE', 32, 22);
putFijo('becarios-mesa-tazas', 'MUG_TABLE', 32, 25);
putFijo('becarios-arcade', 'ARCADE', 34, 25);
putFijo('becarios-lava-1', 'LAVA_LAMP', 35, 18);
putFijo('becarios-lava-2', 'LAVA_LAMP', 26, 26);
putFijo('codigo-matrix', 'MATRIX_SCREEN', 17, 0);
putFijo('codigo-mascara', 'FSOCIETY_MASK', 26, 0);
putFijo('codigo-disco-tron', 'TRON_DISC', 24, 0);
putFijo('codigo-rack', 'SERVER_RACK', 14, 7);
putFijo('codigo-cafetera', 'COFFEE_MAKER', 27, 8);
putFijo('codigo-rubik', 'RUBIK_CUBE', 20, 7);
putFijo('codigo-pokebola', 'POKEBALL', 17, 3);
putFijo('codigo-gameboy', 'GAMEBOY', 21, 3);
putFijo('codigo-groot', 'BABY_GROOT', 25, 3);
// Pizarrón de actividad (al darle clic abre el panel con lo que hizo cada agente), en el pasillo, bajo Código
putFijo('pasillo-pizarron', 'WHITEBOARD', 14, 10);

// ── Zones ─────────────────────────────────────────────────
const areas = [
  { label: 'Jedi', color: '#54a0ff', zoneKind: 'library' },
  { label: 'Código', color: '#1dd1a1', zoneKind: 'code' },
  { label: 'Light Labs', color: '#48dbfb', zoneKind: 'web' },
  { label: 'Senku', color: '#5f27cd', zoneKind: 'permission' },
  { label: 'Anillo', color: '#feca57', zoneKind: 'commit' },
  { label: 'DeLorean', color: '#ff6b6b', zoneKind: 'commands' },
  { label: 'Aperture', color: '#ffa502', zoneKind: 'tests' },
  { label: 'Becarios', color: '#ff9ff3', zoneKind: 'interns' },
  { label: 'Sótano', color: '#8395a7', zoneKind: 'error' },
];
const zone = (label, c0, c1, r0, r1) => {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) if (tiles[idx(c, r)] !== WALL) areaTiles[idx(c, r)] = label;
};
// Upper rooms: rows 2-9 (row 10 hides behind the hall wall)
zone('Jedi', 1, 12, 2, 9);
zone('Código', 14, 27, 2, 9);
zone('Light Labs', 29, 35, 2, 9);
zone('Senku', 37, 42, 2, 9);
zone('Anillo', 24, 28, 12, 15);
zone('DeLorean', 1, 13, 18, 28);
zone('Aperture', 15, 24, 18, 28);
zone('Becarios', 26, 35, 18, 28);
zone('Sótano', 37, 42, 18, 28);

// ── Write ────────────────────────────────────────────────
for (const file of process.argv.slice(2)) {
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  const layout = {
    version: 1,
    cols: COLS,
    rows: ROWS,
    layoutRevision: old.layoutRevision ?? 1,
    tiles,
    tileColors,
    carpetTiles,
    furniture: [...furniture, ...(old.furniture || []).filter((f) => f.uid.startsWith('privado-'))],
    pets: old.pets || [],
    areas,
    areaTiles,
  };
  fs.writeFileSync(file, JSON.stringify(layout, null, 2) + '\n');
  console.log('ok', file, `${COLS}x${ROWS}`, furniture.length, 'muebles');
}
