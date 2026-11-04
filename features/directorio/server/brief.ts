import type { SearchCriteriaSet } from '../../../core/src/messages.js';
import type { RequestPaths, StoredRequest } from '../../busquedas/server/searchRoom.js';
import { DIRECTORIO_KINDS } from './constants.js';

/** The result file's shape, as an example for the agent. */
const EXAMPLE = {
  pedido: '<id del pedido>',
  nota: 'Opcional: algo que el dueño deba saber de la búsqueda.',
  resultados: [
    {
      nombre: 'Nombre del negocio',
      tipo: 'oficial | establecido | otro',
      calificacion: 4.6,
      resenas: 312,
      telefono: '33 0000 0000',
      direccion: 'Calle, número, colonia, ciudad',
      liga: 'https://…',
      fuente: 'Sitio de la marca; Google Maps',
      porque: 'Por qué se recomienda o se descarta, según los criterios.',
      puntuacion: 90,
      veredicto: 'recomendado | descartado',
    },
  ],
};

/**
 * The brief an agent reads for one request (pedidos/<id>.md): what is needed, the criteria in order, where and how to
 * deliver, and the room's skill inline (so it is one file to read and nothing has to be installed in ~/.claude).
 */
export function directorioBrief(
  req: StoredRequest,
  criteria: SearchCriteriaSet | undefined,
  paths: RequestPaths,
  skill: string,
): string {
  const rules = criteria?.rules.length
    ? criteria.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : '(sin criterios: usa los de la skill)';
  const example = JSON.stringify({ ...EXAMPLE, pedido: req.id }, null, 2);
  return [
    `# Encargo del Directorio (pedido ${req.id})`,
    '',
    'Eres el agente de búsqueda del Directorio de la oficina. Busca en internet quién puede hacer esto, con los',
    'criterios de abajo, y entrega los resultados en el archivo que se indica. No contactes a nadie, no llenes',
    'formularios, no compartas datos del dueño y no agendes nada: eso lo hace él desde el panel.',
    '',
    '## Qué se necesita',
    '',
    req.text,
    '',
    `- Dónde: ${req.place ?? 'no lo dijo (usa el lugar del texto; si no hay, dilo en "nota")'}`,
    `- Para cuándo: ${req.when ?? 'no lo dijo'}`,
    '',
    `## Criterios: ${criteria?.label ?? 'sin juego'} (en orden de importancia)`,
    '',
    rules,
    '',
    '## Entrega',
    '',
    `Escribe (o reescribe completo) este archivo, en JSON y UTF-8: \`${paths.resultsFile}\``,
    '',
    `- \`tipo\`: uno de ${DIRECTORIO_KINDS.map((k) => `\`${k}\``).join(', ')}.`,
    '- `puntuacion`: de 0 a 100, según los criterios (el primero pesa más).',
    '- `veredicto`: `recomendado` o `descartado`. Incluye también a los descartados que encontraste, con su porqué.',
    '- Entre 3 y 10 resultados. Sin datos inventados: si algo no lo encontraste, deja el campo fuera.',
    '- El panel de la oficina lo lee solo en unos segundos. Al terminar, di en una línea cuántos encontraste.',
    '',
    '```json',
    example,
    '```',
    '',
    '---',
    '',
    skill.trim(),
    '',
  ].join('\n');
}
