# Atención de los agentes

Cada agente de la oficina tiene un **estado de atención**: dice si trabaja, si te espera, si se atoró o si falló.
Sirve para no perder horas con un agente parado en un aviso de permiso o en el límite de uso mientras el personaje
parece que sigue trabajando.

El estado vive en el servidor (`AgentStateStore`), lo calcula `server/src/agentAttention.ts` y lo leen:

- la página (un globo encima del personaje),
- el aviso de la computadora,
- las funciones y los paquetes del servidor (`ctx.attention`, más abajo).

## Estados

| `estado`      | Qué quiere decir                                             | Globo | Aviso |
| ------------- | ------------------------------------------------------------ | ----- | ----- |
| `trabajando`  | Llegan eventos: herramientas, texto, "pensando".             | no    | no    |
| `esperandote` | Necesita a la persona: un permiso o una pregunta.            | sí    | sí \* |
| `atorado`     | Está activo o "pensando", pero no llega nada hace N minutos. | sí    | sí    |
| `fallo`       | El turno terminó por un error: límite de uso, API, cuenta.   | sí    | sí    |
| `termino`     | Se detuvo normal: acabó su turno o lo interrumpiste.         | no    | no    |

\* El aviso de `esperandote` sale si el agente sigue esperando 30 s después (si contestas luego luego, no suena).
`atorado` y `fallo` avisan al instante. Solo se avisa al **entrar** a un estado, no cada vez que cambia el motivo.

`atorado` no mata ni toca nada: solo marca y avisa.

## Motivos

`motivo` dice por qué está en ese estado. Es un texto fijo (para comparar), no una frase para mostrar.

| `estado`      | `motivo`            | De dónde sale                                                                       |
| ------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `trabajando`  | `herramienta`       | Empezó o terminó una herramienta, o llegó texto.                                    |
| `trabajando`  | `pensando`          | Mandaste un mensaje y aún no usa herramientas.                                      |
| `trabajando`  | `herdr`             | herdr volvió a decir `working` después de `blocked`.                                |
| `esperandote` | `permiso`           | Aviso de permiso (`PermissionRequest`, `Notification` de permiso).                  |
| `esperandote` | `pregunta`          | `AskUserQuestion`, o un formulario de un MCP (`elicitation_dialog`).                |
| `esperandote` | `herdr-bloqueado`   | herdr dice `blocked` (por ejemplo, "¿confías en esta carpeta?").                    |
| `atorado`     | `sin-eventos`       | Pasaron N minutos sin ningún evento.                                                |
| `fallo`       | `limite-de-uso`     | `StopFailure` con `rate_limit` (el límite de 5 horas o el semanal).                 |
| `fallo`       | `error-api`         | `StopFailure` con otro error (`overloaded`, `server_error`, `billing_error`, etc.). |
| `termino`     | `inicio`            | Recién llegó a la oficina y todavía no hace nada.                                   |
| `termino`     | `fin-de-turno`      | `Stop`: acabó su turno.                                                             |
| `termino`     | `esperando-entrada` | `idle_prompt`: lleva un rato terminado, esperando tu siguiente mensaje.             |
| `termino`     | `interrumpido`      | Presionaste Esc a media herramienta.                                                |
| `termino`     | `herdr-inactivo`    | herdr dice `idle` o `done` y no llega nada hace más de 60 s (Esc sin herramienta).  |

## Campos

```ts
// core/src/attention.ts
interface AgentAttention {
  agentId: number; // el id del agente en la oficina
  sessionId: string; // la sesión de Claude Code
  estado: 'trabajando' | 'esperandote' | 'atorado' | 'fallo' | 'termino';
  motivo: AttentionReason; // la tabla de arriba
  desde: number; // ms desde 1970: cuándo entró a este estado. En `atorado`, la hora del último evento.
  ultimoEvento: number; // ms desde 1970: el último evento que llegó de este agente
  detalle?: string; // solo en `fallo`: el código de Claude Code (`rate_limit`, `overloaded`…)
  nombre: string; // como se ve en la oficina: pestaña de herdr, nombre de compañero o carpeta
  perfil?: string; // el perfil de Claude Code (`personal`, …); vacío en el perfil por omisión
}
```

Lo que **no** trae, a propósito: texto de mensajes, del error ni de la respuesta. El hook quita
`last_assistant_message` antes de mandar `StopFailure`.

## Cómo lo lee un paquete

`privado/<paquete>/server.ts` recibe `ctx.attention` (`AgentAttentionApi`, en `server/src/packTypes.ts`):

```ts
import type { PackServerEntry } from '../../server/src/packTypes.js';
import { NEEDS_YOU_STATES } from '../../core/src/attention.js';

const entry: PackServerEntry = (ctx) => {
  // Todos los agentes de la oficina, ahora.
  const pendientes = ctx.attention.list().filter((a) => NEEDS_YOU_STATES.has(a.estado));

  // Cada cambio de estado (o de motivo). Regresa la función para dejar de escuchar.
  const dejar = ctx.attention.subscribe(({ agentId, actual, anterior }) => {
    // actual === null: el agente se fue de la oficina.
    // anterior === null: el agente acaba de llegar.
  });

  return [{ name: 'mi-funcion', dispose: dejar }];
};
export default entry;
```

- `list()`: un renglón por agente de la oficina (también los que están en `trabajando` o `termino`).
- `get(agentId)`: uno solo, o `undefined`.
- `subscribe(fn)`: avisa cada cambio, de forma síncrona y en orden. Llega también cuando solo cambia `motivo`.
  Un error dentro de `fn` se registra y no rompe a los demás.
- `stuckAfterMs()`: los N minutos de `atorado`, en ms, como están ahora.

`NEEDS_YOU_STATES` (`esperandote`, `atorado`, `fallo`) son los que necesitan a la persona. Las funciones públicas de
`server/src/cli.ts` reciben lo mismo. La página recibe el mensaje `agentAttention` (`core/asyncapi.yaml`) con `id`,
`estado`, `motivo`, `desde` y `detalle`.

## Cómo se configura

En `~/.pixel-agents/config.json` (fuera de git):

```json
{
  "agentAttention": {
    "stuckMinutes": 15,
    "notify": true
  }
}
```

- `stuckMinutes`: minutos sin eventos para pasar a `atorado`. Por omisión 15; acepta de 1 a 1440.
- `notify`: `false` apaga el aviso de la computadora (el globo se sigue viendo). Por omisión `true`.

El servidor lo vuelve a leer cada 30 s: no hace falta reiniciar la oficina.

## Señales y sus límites

- **Hooks de Claude Code** (lo principal): `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`
  (con `is_interrupt` para Esc), `PermissionRequest`, `Notification` (`permission_prompt`,
  `worker_permission_prompt`, `elicitation_dialog`, `elicitation_url_dialog`, `agent_needs_input`, `idle_prompt`),
  `Stop` y **`StopFailure`**, que se instala con el mismo instalador con consentimiento de los demás hooks.
- **Transcripción** (`.jsonl`): cada línea nueva cuenta como evento para `atorado`. Sin hooks, los estados salen de
  la transcripción como siempre (sin `fallo`: eso solo lo manda el hook).
- **herdr** (segunda señal): `agent_status` de `herdr pane list`. `blocked` cuenta como `esperandote`; `idle` o
  `done` cierran un `trabajando` sin eventos hace más de 60 s. Solo se pregunta a herdr mientras hay una página
  abierta (cada 5 s).
- **"¿Confías en esta carpeta?"**: los hooks no corren antes de confiar en la carpeta, así que solo se ve con herdr
  (`blocked`) y solo si la sesión ya está en la oficina (una sesión nueva todavía no tiene personaje).
- **Esc sin herramienta** (mientras "piensa"): Claude Code no manda nada. Con herdr pasa a `termino` en ~1 min; sin
  herdr, a los N minutos sale como `atorado`.
- **Una herramienta muy larga** (un build de 20 min sin imprimir nada) puede salir como `atorado`. Es a propósito:
  no hay forma de distinguirla de una colgada.
- **Avisos de la computadora**: hoy solo en Mac (`server/src/notifyMac.ts`); en Windows y Linux el estado y el globo
  funcionan igual, pero sin aviso.
