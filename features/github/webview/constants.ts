/** The GitHub room's furniture (features/github/arte/armar.py draws them). */
export const GITHUB_CABINET_TYPE = 'GITHUB_CABINET';
export const GITHUB_GRAPH_TYPE = 'GITHUB_GRAPH';
export const GITHUB_PRS_TYPE = 'GITHUB_PRS';

/** Commits on the default branch for each cabinet level: wood below METAL, metal below GOLD, then gold. */
export const CABINET_METAL_COMMITS = 20;
export const CABINET_GOLD_COMMITS = 100;
/** Sheets piled on top of a cabinet: one per threshold reached (commits). */
export const CABINET_SHEET_COMMITS = [1, 5, 20, 60, 150] as const;
/** Pushed this recently: the cabinet's light is on. */
export const CABINET_RECENT_MS = 7 * 24 * 3600_000;

/** Cabinet palette as drawn (wood), and the same slots in metal and gold: outline, dark, mid, light, shine, handle, feet. */
export const CABINET_WOOD = [
  '#3a2418',
  '#6e442a',
  '#96603a',
  '#ba804e',
  '#d6a468',
  '#e6d6aa',
  '#3c2c24',
];
export const CABINET_METAL = [
  '#262c36',
  '#4a5462',
  '#6c7888',
  '#909cac',
  '#bcc6d2',
  '#e8ecf0',
  '#262c36',
];
export const CABINET_GOLD = [
  '#4a3410',
  '#9a6c18',
  '#c89a2a',
  '#e2bc48',
  '#f6e08a',
  '#fff6c8',
  '#4a3410',
];
/** Drawer labels (cream as drawn; red for a private repo) and the light. */
export const CABINET_LABEL = '#ece4ce';
export const CABINET_LABEL_PRIVATE = '#e06c6c';
export const CABINET_LIGHT = { x: 12, y: 7, on: '#39d353' } as const;
/** Label rectangle of each drawer (sprite px). */
export const CABINET_LABELS = [10, 16, 22].map((y) => ({ x: 4, y: y + 1, w: 4 }));
/** Sheets: from this row upward, alternating colors and edges. */
export const CABINET_SHEET_ROW = 5;
export const CABINET_SHEET_COLORS = ['#f4f4ec', '#dcdcd0'];
export const CABINET_SHEET_EDGE = '#9a9a90';

/** Contribution graph: 9 weeks × 7 days of 2 px cells, 3 px apart. */
export const GRAPH_WEEKS = 9;
export const GRAPH_ORIGIN = { x: 3, y: 5, cell: 2, step: 3 } as const;
/** GitHub's own greens, by contributions that day: 1, 2-3, 4-6, 7+. */
export const GRAPH_GREENS = ['#0e4429', '#006d32', '#26a641', '#39d353'];
export const GRAPH_STEPS = [1, 2, 4, 7] as const;

/** Cork board: a note per open PR at these spots (sprite px), up to as many as fit. */
export const PR_NOTE_SPOTS = [
  { x: 5, y: 7 },
  { x: 12, y: 8 },
  { x: 19, y: 7 },
  { x: 7, y: 15 },
  { x: 15, y: 16 },
  { x: 22, y: 15 },
] as const;
export const PR_NOTE_SIZE = 5;
export const PR_NOTE_COLORS = ['#f6e08a', '#9be9a8'];
export const PR_NOTE_LINE = '#8a8a70';
export const PR_NOTE_PIN = '#d14249';
