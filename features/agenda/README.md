# Agenda (feature opcional)

Un cuarto estilo **centro de mando**: un clic en la consola o en cualquiera de sus pantallas abre **"Hoy y esta
semana"**:

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
