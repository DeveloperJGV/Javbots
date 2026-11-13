# Agenda (feature opcional)

Un cuarto estilo **centro de mando**: un clic en la **consola** abre **"Hoy y esta semana"** (las pantallas de la
semana, el radar y las tareas siguen la agenda pero son de adorno, sin clic):

- **Tu agenda de hoy y los 6 días siguientes:** los eventos de **todos tus calendarios de Google** (los que tienes
  visibles), cada uno con su color; los que solo compartes como libre/ocupado (por ejemplo el del trabajo) salen
  como bloques "Ocupado". El tipo lo dice la primera palabra del título (`Concierto: …`, `Salida: …`). Además, tus
  **tareas de Google Tasks**, que solo ves tú (las atrasadas salen en "Hoy"; las que no tienen fecha, al final).
- **Agregar escribiendo:** escoge el tipo con un botón (`Concierto:`, `Salida:`, evento normal o tarea), escribe,
  pon el día y, si quieres, la hora. Antes de guardar se muestra cómo quedará y dónde, y se pide confirmar. Una
  tarea va a Tasks. Un evento va al calendario que escojas: por defecto `Concierto:` y `Salida:` van al
  **compartido** (lo de los dos) y lo demás a **tu calendario de la casa**.
- **Marcar una tarea como hecha** con un clic.
- **Choques de horario** (entre todos los calendarios, trabajo incluido): se avisan en el panel, antes de agregar algo que se empalma, en el mapa de la semana
  (marca roja) y con el foco rojo de la consola.

## Plan del día: la agenda se acomoda sola

Arriba del panel sale **"Plan de hoy"**: la oficina toma tus tareas pendientes (de **todas** tus listas de Google
Tasks, con las atrasadas) y les pone hora en tus huecos libres, con reglas fijas y sin escribir nada en Google.

- **Todo en ratos de 30 minutos:** cada bloque dura 30 min, 1 h, 1 h 30… y empieza en punto o a la media. Los
  totales también ("3 ratos · 1 h 30").
- **Lista corta:** hora (digital), cuánto dura, la tarea y un porqué ("atrasada 3 días", "vence mañana", "cabe
  antes de lo de las 11:00").
- **Botones por bloque:** **Hecho** (marca la tarea en Google Tasks), **Hoy no** (se va a mañana; se guarda solo en
  la oficina) y **cuánto tarda**.
- **Tope diario** para no abrumar (de fábrica 3 ratos = 1 h 30). Lo que no cabe hoy se reparte en los días
  siguientes ("Esta semana"); lo que no cabe en la semana sale en **"No cupo esta semana"**.
- **Orden:** atrasadas, las de hoy, las que vencen pronto y al final las que no tienen fecha (las más viejas
  primero).
- **Ventanas del día:** mañana, horario de trabajo y tarde; el fin de semana tiene la suya. En los **descansos** no
  se pone nada, y se deja un margen alrededor de cada evento.
- **Cuánto tarda una tarea:** lo que le pusiste a mano en el panel; si no, una marca en el título o la nota
  (`(15 min)`, `(1 h)`, `(1 h 30)`); si no, las reglas por palabra ("llamar" 10, "limpiar" 30…); si no, un rato.
- **Pendientes rápidos:** las cosas chicas (15 min o menos) no salen sueltas: se juntan en un rato de 30 min con
  las que quepan, cada una con su casilla. Ese rato es el único que cabe en horario de trabajo.
- **Ronda de plantas:** los cuidados del jardín del mismo día (lista "Jardín" de Tasks, la que llena
  [features/jardin](../jardin/README.md)) se juntan en un solo bloque: minutos por tipo de cuidado (regar 3,
  limpiar 5, abonar 2, podar 15) más unos minutos de arranque, cerrado a ratos de 30 (hasta 35 min cuenta como un
  rato). Los recordatorios que el jardín pone en el calendario no cuentan como tiempo ocupado.
- **Tareas largas:** se parten en varios ratos ("parte 1 de 2") solo si no caben en un día o si ya son para hoy.
- **Se recorre solo:** el plan se vuelve a calcular cada vez; lo que no palomeaste se mueve al siguiente hueco.
- **Resumen de la mañana:** un aviso de escritorio ("Hoy toca: 3 ratos (1 h 30): …") a la hora que escojas, o al
  abrir la oficina si la abriste más tarde. Una vez al día. Opcional: un aviso unos minutos antes de cada bloque
  (apagado de fábrica).

Todo se cambia en **"Preferencias del plan"**, dentro del panel. Los horarios de fábrica son provisionales: pon
los tuyos. Lo que la oficina guarda del plan vive en `~/.pixel-agents/agenda-plan.json` (preferencias, minutos
puestos a mano, los "hoy no" y el día del último resumen); bórralo para volver a empezar.

El plan **no crea eventos ni cambia tareas** en Google: lo único que escribe es la palomita de "Hecho".

Las pantallas del cuarto están vivas: el **mapa de la semana** pinta un bloque por evento (cian) o tarea (ámbar)
en cada día, la **lista de tareas** prende una casilla por pendiente y el **radar** gira.

## Configurar

Usa la sesión de Google de la oficina ([features/google](../google/README.md)), con los permisos de Calendar y
Tasks (en Google Cloud hay que activar también **Google Tasks API**). Los calendarios se buscan por nombre entre los
tuyos, en `~/.pixel-agents/agenda.json` (todo opcional):

```json
{
  "calendario": "Compartido",
  "casa": "Casa",
  "nombres": { "yo@trabajo.com": "Trabajo" }
}
```

- `calendario`: el compartido, solo para lo de los dos (por defecto `Familia`).
- `casa`: el tuyo para lo demás: servicios, pendientes de la casa, la mascota (por defecto `Casa`). El
  [Directorio](../directorio/README.md) agenda ahí sus `Servicio:`.
- `nombres`: cómo mostrar un calendario (por su nombre o id), útil para el del trabajo.

La oficina **no crea ni comparte calendarios**, y nunca borra eventos ni tareas.

## Skill

`skill/SKILL.md` tiene las mismas reglas para que cualquier sesión de Claude Code agende bien (qué va al calendario
y qué a Tasks, las palabras de los títulos, preguntar siempre antes de crear o cambiar). No se instala sola.

## Carpetas

| Carpeta    | Qué hay                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `plan/`    | El motor del plan, puro (sin red ni reloj oculto): `plan.ts`, minutos por tarea, preferencias, textos          |
| `server/`  | `agendaFeature.ts` (estado, agregar, completar, plan, avisos), `agendaGoogle.ts`, `agendaPlanStore.ts`, config |
| `webview/` | `AgendaPanel.tsx`, `PlanSection.tsx` (plan de hoy), `agendaText.ts`, `agendaFurniture.ts`, `agendaStore.ts`    |
| `arte/`    | `armar.py` dibuja los 4 muebles por código; `plano.cjs` arma el plano del cuarto                               |
| `planos/`  | `agenda.json`: el cuarto solo, como plano aparte                                                               |
| `skill/`   | La skill de agenda                                                                                             |
| `test/`    | Pruebas del servidor (con un doble de la sesión de Google, sin red) y de la página                             |

Toca al resto del proyecto en: mensajes en `core/asyncapi.yaml` (`agendaStatus`, `refreshAgenda`, `addAgendaItem`,
`completeAgendaTask`, `agendaPlanAction`, `setAgendaPlanPrefs`), el registro en `server/src/cli.ts`, el clic en los muebles (`officeState.ts`,
`OfficeCanvas.tsx`) y el panel en `App.tsx`.
