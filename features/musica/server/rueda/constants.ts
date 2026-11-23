/** "Rueda de volumen" (features/musica/rueda): a separate Windows program the office shows and controls. */

export const LOG_PREFIX = '[Rueda]';

/** Its data folder under %APPDATA% (the program's own default). */
export const RUEDA_DIR_NAME = 'rueda-volumen';
/** Points the office (and the program it starts) to another data folder: tests and isolated offices. */
export const RUEDA_DIR_ENV = 'JAVBOTS_RUEDA_DIR';
/** The program reads its data folder from this variable. */
export const RUEDA_PROGRAM_DIR_ENV = 'RUEDA_CARPETA';

export const STATE_FILE = 'estado.json';
export const SETTINGS_FILE = 'ajustes.json';
export const LAUNCHER_FILE = 'lanzador.json';

/** How often the office looks at the files while a page is open. */
export const POLL_MS = 1000;
/** Faster for a while after starting or stopping, so the page follows quickly. */
export const POLL_FAST_MS = 250;
export const POLL_FAST_FOR_MS = 6000;
/** A result in words stays on the panel this long. */
export const MESSAGE_MS = 10_000;
/** Short commands (stop, sign in, startup) must finish within this. */
export const COMMAND_TIMEOUT_MS = 15_000;

/** The only interpreters the office will run, and the only script. */
export const LAUNCHER_PYTHONS = ['pythonw.exe', 'python.exe', 'python3.exe'];
export const LAUNCHER_SCRIPT = 'rueda.pyw';

/** The fixed arguments of each action: nothing from the page ever reaches the command line. */
export const ARGS = {
  start: [] as string[],
  stop: ['--salir'],
  signIn: ['--iniciar-sesion'],
  startupOn: ['--arranque', 'si'],
  startupOff: ['--arranque', 'no'],
} as const;

export const STEP_MIN = 1;
export const STEP_MAX = 25;
export const COMPUTER_NAME_MAX = 64;

/** The program's reason codes → the protocol's. */
export const REASONS: Record<string, string> = {
  spotify: 'spotify',
  pausado: 'paused',
  sin_sesion: 'no_session',
  espera_429: 'rate_limited',
  sin_red: 'offline',
  '403': 'forbidden',
  '404': 'not_found',
  error: 'error',
  sin_datos: 'no_data',
  viejo: 'stale',
  nada_suena: 'nothing_playing',
  lap: 'this_computer',
  sin_volumen: 'no_volume_control',
};
