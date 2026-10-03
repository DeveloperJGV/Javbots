/**
 * Spanish display text for tool statuses.
 *
 * The server keeps sending statuses in English (`Reading foo.ts`, `Subtask: …`):
 * `extractToolName` and the sub-agent label parse those prefixes, so they are
 * part of the protocol. Translate only at the point of display.
 */

/** English status prefix → Spanish, longest/most specific first. */
const STATUS_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['Searching the web', 'Buscando en internet'],
  ['Searching files', 'Buscando archivos'],
  ['Searching code', 'Buscando en el código'],
  ['Fetching web content', 'Leyendo una página web'],
  ['Waiting for your answer', 'Esperando tu respuesta'],
  ['Editing notebook', 'Editando notebook'],
  ['Creating team', 'Creando equipo'],
  ['Sending message', 'Enviando mensaje'],
  ['Reading', 'Leyendo'],
  ['Editing', 'Editando'],
  ['Writing', 'Escribiendo'],
  ['Running:', 'Ejecutando:'],
  ['Subtask:', 'Subtarea:'],
  ['Planning', 'Planeando'],
  ['Using', 'Usando'],
];

export function translateStatus(status: string): string {
  for (const [en, es] of STATUS_PREFIXES) {
    if (
      status === en ||
      status.startsWith(`${en} `) ||
      (en.endsWith(':') && status.startsWith(en))
    ) {
      return es + status.slice(en.length);
    }
  }
  return status;
}
