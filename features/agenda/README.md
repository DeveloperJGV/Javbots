# Agenda (feature opcional)

Un cuarto estilo **centro de mando**: un clic en la consola o en cualquiera de sus pantallas abre **"Hoy y esta
semana"**:

- **Tu agenda de hoy y los 6 días siguientes:** los eventos de un calendario compartido de Google (el tipo lo dice
  la primera palabra del título: `Concierto: …`, `Salida: …`) y tus **tareas de Google Tasks**, que solo ves tú
  (las atrasadas salen en "Hoy"; las que no tienen fecha, al final).
- **Agregar escribiendo:** escoge el tipo con un botón (`Concierto:`, `Salida:`, evento normal o tarea), escribe,
  pon el día y, si quieres, la hora. Antes de guardar se muestra cómo quedará y dónde, y se pide confirmar. Un
  evento va al calendario; una tarea, a Tasks.
- **Marcar una tarea como hecha** con un clic.
- **Choques de horario:** se avisan en el panel, antes de agregar algo que se empalma, en el mapa de la semana
  (marca roja) y con el foco rojo de la consola.

Las pantallas del cuarto están vivas: el **mapa de la semana** pinta un bloque por evento (cian) o tarea (ámbar)
en cada día, la **lista de tareas** prende una casilla por pendiente y el **radar** gira.

## Configurar

Usa la sesión de Google de la oficina ([features/google](../google/README.md)), con los permisos de Calendar y
Tasks (en Google Cloud hay que activar también **Google Tasks API**). El calendario se busca por nombre entre los
tuyos; por defecto `Familia`, o el que digas en `~/.pixel-agents/agenda.json`:

```json
{ "calendario": "Mi calendario" }
```

La oficina **no crea ni comparte calendarios**, y nunca borra eventos ni tareas.

## Skill

`skill/SKILL.md` tiene las mismas reglas para que cualquier sesión de Claude Code agende bien (qué va al calendario
y qué a Tasks, las palabras de los títulos, preguntar siempre antes de crear o cambiar). No se instala sola.

## Carpetas

| Carpeta    | Qué hay                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `server/`  | `agendaFeature.ts` (estado, agregar, completar, conexiones), `agendaGoogle.ts` (Calendar y Tasks), config    |
| `webview/` | `AgendaPanel.tsx`, `agendaText.ts` (días, choques), `agendaFurniture.ts` (pantallas vivas), `agendaStore.ts` |
| `arte/`    | `armar.py` dibuja los 4 muebles por código; `plano.cjs` arma el plano del cuarto                             |
| `planos/`  | `agenda.json`: el cuarto solo, como plano aparte                                                             |
| `skill/`   | La skill de agenda                                                                                           |
| `test/`    | Pruebas del servidor (con un doble de la sesión de Google, sin red) y de la página                           |

Toca al resto del proyecto en: mensajes en `core/asyncapi.yaml` (`agendaStatus`, `refreshAgenda`, `addAgendaItem`,
`completeAgendaTask`), el registro en `server/src/cli.ts`, el clic en los muebles (`officeState.ts`,
`OfficeCanvas.tsx`) y el panel en `App.tsx`.
