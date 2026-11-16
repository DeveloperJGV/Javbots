import type { SearchCriteriaSet } from '../../../core/src/messages.js';

/**
 * Factory values for the Freelance room. Both are generic examples: the owner's real offer and criteria live in
 * ~/.pixel-agents/freelance.json and are edited from the panel or by hand (Spanish keys).
 */

/** What the person offers, as the search agent reads it. Edited in freelance.json (Spanish keys). */
export interface FreelanceOffer {
  titulo: string;
  servicios: string[];
  tecnologias: string[];
  tarifa: string;
  disponibilidad: string;
  /** Where the person works from (country, time zone, remote): ads that do not take it are discarded. */
  desde: string;
  idiomas: string[];
  noQuiero: string[];
}

/** Criteria sets until the owner saves his own; the first one is the default. */
export const FREELANCE_DEFAULT_CRITERIA: SearchCriteriaSet[] = [
  {
    id: 'proyectos',
    label: 'Proyectos por encargo',
    rules: [
      'Primero, que encaje con la oferta: servicios y tecnologías que sí se ofrecen, sin pedir lo que aparece en "lo que no acepto".',
      'Alcance claro y entregable definido; mejor si el pago es por proyecto (precio fijo) y se ve en el anuncio.',
      'Pago a la vista y razonable contra la tarifa (por ejemplo, que equivalga a la tarifa o más); sin pago visible, bajar la puntuación.',
      'Publicado en los últimos 14 días y todavía abierto, de preferencia con pocas propuestas recibidas.',
      'Cliente con historial: pago verificado, trabajos anteriores o empresa reconocible.',
      'Descartar señales de estafa: pago por adelantado al revés (el freelancer paga), prueba o muestra gratis larga, pedir salir de la plataforma, cheques, cripto, pago irreal para la tarea.',
    ],
  },
  {
    id: 'largo-plazo',
    label: 'Trabajo por horas o de largo plazo',
    rules: [
      'Primero, que encaje con la oferta y que sea trabajo continuo (por horas, mensual o contrato de varios meses).',
      'Tarifa por hora o mensual visible y al menos igual a la tarifa de la oferta; sin tarifa, bajar la puntuación.',
      'Que acepte trabajo remoto desde Latinoamérica y la zona horaria o las horas por semana se ajusten a la disponibilidad.',
      'Publicado en los últimos 30 días y todavía abierto.',
      'Empresa o cliente con historial comprobable (sitio propio, pagos verificados, reseñas de otros freelancers).',
      'Descartar señales de estafa: pago por adelantado al revés, pruebas gratis largas, salir de la plataforma, cheques, cripto, "data entry" con pago irreal.',
    ],
  },
  {
    id: 'directos',
    label: 'Clientes directos',
    rules: [
      'Primero, anuncios de la empresa o persona que contrata, sin intermediario ni plataforma de por medio (tipo `directo`).',
      'Que encaje con la oferta y diga con claridad qué se necesita; mejor si trae pago o rango de pago.',
      'Empresa real y comprobable: sitio propio, dominio con correo de la empresa, personas con nombre y perfil público.',
      'Publicado en los últimos 30 días.',
      'Descartar a quien pida trabajo gratis, pagos o datos personales por adelantado, o solo se deje contactar por mensajería sin nombre ni empresa.',
    ],
  },
  {
    id: 'automatizacion',
    label: 'Automatización con IA y agentes',
    rules: [
      'Primero, proyectos de automatizar procesos con IA: agentes, chatbots, integraciones entre servicios, servidores MCP o configurar herramientas como Claude Code para un equipo.',
      'Alcance claro y entregable definido (qué se automatiza, con qué herramientas y cómo se entrega); sin alcance, bajar la puntuación.',
      'Pago a la vista y razonable contra la tarifa; sin pago visible, bajar la puntuación.',
      'Publicado en los últimos 14 días y todavía abierto.',
      'Cliente real y comprobable: pago verificado, trabajos anteriores, sitio propio o empresa reconocible.',
      'Descartar los de pago irreal para la tarea (como "hazme un clon de ChatGPT por 50 USD") y las señales de estafa: el freelancer paga, prueba gratis larga, salir de la plataforma, cheques, cripto.',
    ],
  },
  {
    id: 'consultoria',
    label: 'Consultoría y capacitación',
    rules: [
      'Primero, consultoría, talleres, cursos o capacitación en IA o herramientas de desarrollo para equipos o empresas.',
      'Que la oferta esté en un idioma que se habla (el de la oferta) y diga el tema, el público y el formato (en línea o presencial).',
      'Horas o fechas claras y pago claro (por hora, por sesión o por curso); sin pago visible, bajar la puntuación.',
      'Cliente comprobable: empresa, escuela o comunidad con sitio propio, personas con nombre o pagos verificados.',
      'Publicado en los últimos 30 días y todavía abierto.',
      'Descartar los que piden contenido gratis, temarios completos o una "clase muestra" sin pago antes de contratar.',
    ],
  },
];

/** Example offer, clearly an example, until the owner writes his own. */
export const FREELANCE_DEFAULT_OFFER: FreelanceOffer = {
  titulo: 'Ejemplo: desarrollo de apps móviles y sitios web',
  servicios: [
    'Apps móviles para Android (de cero o mejoras a una existente)',
    'Sitios web y tiendas sencillas',
    'Automatización de tareas y conexión entre servicios',
  ],
  tecnologias: ['Kotlin', 'Jetpack Compose', 'TypeScript', 'React', 'Node.js', 'Python'],
  tarifa: 'Ejemplo: desde 25 USD/h, o por proyecto',
  disponibilidad: 'Ejemplo: 20 h por semana, remoto',
  desde: 'Ejemplo: Latinoamérica, remoto',
  idiomas: ['Español', 'Inglés'],
  noQuiero: [
    'Trabajo gratis o "a prueba" sin pago',
    'Pagar por adelantado para recibir el trabajo',
    'Salir de la plataforma para pagar o cobrar',
  ],
};
