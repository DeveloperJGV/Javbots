import type { SearchCriteriaSet } from '../../../core/src/messages.js';
import type { RequestPaths, StoredRequest } from '../../busquedas/server/searchRoom.js';
import { FREELANCE_KINDS, FREELANCE_MIN_RECOMMENDED } from './constants.js';
import type { FreelanceOffer } from './defaults.js';

/** The result file's shape, as an example for the agent. */
const EXAMPLE = {
  pedido: '<id del pedido>',
  nota: 'Opcional: algo que el dueño deba saber de la búsqueda.',
  resultados: [
    {
      nombre: 'Título del trabajo, como sale en el anuncio',
      tipo: 'directo | plataforma | otro',
      liga: 'https://… (la página exacta del anuncio)',
      fuente: 'Dónde lo encontraste',
      porque: 'Por qué se recomienda o se descarta, según la oferta y los criterios.',
      puntuacion: 85,
      veredicto: 'recomendado | dudoso | descartado',
      nota: 'Opcional: algo de este anuncio (por ejemplo, que no se pudo verificar sin iniciar sesión).',
      detalles: [
        { etiqueta: 'Pago', valor: '800 USD, precio fijo' },
        { etiqueta: 'Publicado', valor: 'AAAA-MM-DD' },
        { etiqueta: 'Cliente', valor: 'Lo que se sepa del cliente' },
        { etiqueta: 'Modalidad', valor: 'Remoto' },
      ],
    },
  ],
};

const bullets = (items: string[]): string =>
  items.length ? items.map((s) => `  - ${s}`).join('\n') : '  - (no lo dijo)';

/** The offer as the agent reads it (markdown). */
export function offerMarkdown(offer: FreelanceOffer, isExample: boolean): string {
  return [
    ...(isExample
      ? [
          '> **Ojo:** es la oferta de ejemplo de fábrica; el dueño todavía no la llena. Guíate sobre todo por el',
          '> pedido y dilo en "nota".',
          '',
        ]
      : []),
    `- **Qué ofrece:** ${offer.titulo || '(sin título)'}`,
    '- **Servicios:**',
    bullets(offer.servicios),
    `- **Tecnologías:** ${offer.tecnologias.join(', ') || '(no lo dijo)'}`,
    `- **Tarifa:** ${offer.tarifa || '(no lo dijo)'}`,
    `- **Disponibilidad:** ${offer.disponibilidad || '(no lo dijo)'}`,
    `- **Desde dónde trabaja:** ${offer.desde || '(no lo dijo)'}${
      offer.desde
        ? ' (descarta los anuncios que no acepten ese país o esa zona horaria, o que pidan vivir en otro lado)'
        : ''
    }`,
    `- **Idiomas:** ${offer.idiomas.join(', ') || '(no lo dijo)'}`,
    '- **No acepta (descarta sin discusión):**',
    bullets(offer.noQuiero),
  ].join('\n');
}

/**
 * The brief an agent reads for one request (pedidos/<id>.md): what to look for, the owner's offer, the criteria in
 * order, where and how to deliver, and the room's skill inline (one file to read, nothing installed in ~/.claude).
 */
export function freelanceBrief(
  req: StoredRequest,
  criteria: SearchCriteriaSet | undefined,
  paths: RequestPaths,
  offer: { offer: FreelanceOffer; isExample: boolean },
  skill: string,
): string {
  const rules = criteria?.rules.length
    ? criteria.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : '(sin criterios: usa los de la skill)';
  const example = JSON.stringify({ ...EXAMPLE, pedido: req.id }, null, 2);
  return [
    `# Encargo de Freelance (pedido ${req.id})`,
    '',
    'Eres el agente de búsqueda del cuarto de Freelance de la oficina. Busca en internet trabajo de freelance que',
    'encaje con la oferta de abajo, con los criterios en orden, y entrega los resultados en el archivo que se indica.',
    '**Solo lees páginas públicas:** nunca te registras, nunca inicias sesión, nunca mandas mensajes ni propuestas,',
    'nunca pagas y nunca das datos del dueño. Él decide desde el panel a qué se postula.',
    '',
    '## Qué busca',
    '',
    req.text,
    '',
    '## Su oferta',
    '',
    offerMarkdown(offer.offer, offer.isExample),
    '',
    `## Criterios: ${criteria?.label ?? 'sin juego'} (en orden de importancia)`,
    '',
    rules,
    '',
    '## Cómo buscar',
    '',
    'Con la oferta y el pedido arma **varias** consultas, no una sola tecnología: la tecnología fuerte, el servicio, y',
    'también automatización con IA o agentes, consultoría o capacitación y web si la oferta los incluye. Haz cada una',
    'en inglés y en español. Sigue la sección "Dónde buscar" de la skill (abajo), que incluye las ligas armadas de',
    'Upwork y Workana para que el dueño las abra.',
    '',
    '## Entrega',
    '',
    `Escribe (o reescribe completo) este archivo, en JSON y UTF-8: \`${paths.resultsFile}\``,
    '',
    `- \`tipo\`: uno de ${FREELANCE_KINDS.map((k) => `\`${k}\``).join(', ')}.`,
    '- `puntuacion`: de 0 a 100, según la oferta y los criterios (el primero pesa más).',
    `- \`veredicto\`: \`recomendado\`, \`dudoso\` o \`descartado\`. \`recomendado\` es solo de ${FREELANCE_MIN_RECOMMENDED}`,
    '  para arriba (si pones menos, el panel lo muestra como dudoso); `dudoso` es para lo que puede servir pero el',
    '  dueño debe revisar (pago no visible, cliente sin verificar, zona no clara). Incluye también los descartados que',
    '  ayuden, con su porqué.',
    '- `detalles`: opcional, a lo más 6 renglones cortos `{ "etiqueta", "valor" }` (Pago, Publicado, Cliente,',
    '  Modalidad…), solo con lo que viste en la página.',
    '- Sin datos inventados: si algo no lo encontraste, deja el campo fuera.',
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
