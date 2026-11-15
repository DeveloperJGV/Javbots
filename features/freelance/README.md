# Freelance (feature opcional)

El cuarto de **Freelance** del piso Personal (estilo cuartel hacker: pantallas verdes, mapa de clientes, servidor) ya
busca trabajo. Un clic en el **escritorio con tres pantallas** abre el panel **Freelance**, verde sobre negro:

1. **Mi oferta.** Lo que ofreces: título, servicios, tecnologías, tarifa, disponibilidad, idiomas y lo que no aceptas.
   Se edita ahí mismo (**Editar**; las listas, una cosa por línea). De fábrica trae una **oferta de ejemplo** y el
   panel lo dice en amarillo hasta que la cambies; puedes buscar de todos modos.
2. **Pedido.** Escribes qué buscas ("proyectos de apps Android, remoto, de 500 USD para arriba, publicados esta
   semana") y escoges un juego de criterios. Guardarlo no lanza nada todavía.
3. **Buscar.** Abre un agente de Claude Code en una pestaña nueva de [herdr](https://herdr.dev) ("Freelance"), con
   sus **permisos normales** y el modelo de `freelance.json` (de fábrica `sonnet`), y le da el encargo. Si Claude
   pregunta algo al arrancar, contesta en esa pestaña y presiona **Mandar encargo**.
4. **Copiar encargo.** Sin herdr, copia una sola línea para pegarla en cualquier sesión de Claude Code.
5. **Resultados.** El agente escribe un archivo; el panel lo lee solo en unos segundos y los muestra ordenados
   (recomendados por puntuación, luego descartados), cada uno con tipo (**cliente directo**, **plataforma** u
   **otro**), sus **detalles** (pago, publicado, cliente, modalidad…), liga, fuente, por qué y la nota del agente.
6. **Postulé / Descartado** en cada resultado. Tú te postulas: el agente nunca lo hace.

**Detalle con vida:** el **mapa de clientes** de la pared prende un punto amarillo por cada trabajo recomendado que
no has marcado (hasta 8) y los hace parpadear uno por uno. Sin la llave de la oficina el mapa se queda como está
dibujado.

## Lo que hace y lo que no hace el agente

Solo **lee páginas públicas**: nunca se registra, nunca inicia sesión, nunca manda mensajes ni propuestas, nunca paga
y nunca da tus datos. Eso está en el encargo y en la skill (`skill/SKILL.md`), que dice dónde buscar, cómo calificar
contra tu oferta y cómo reconocer estafas.

## `~/.pixel-agents/freelance.json`

Tus datos viven aquí, nunca en el repo. El panel lo escribe al guardar la oferta o los criterios (sin borrar lo
demás) y también se puede editar a mano:

```json
{
  "oferta": {
    "titulo": "Desarrollo de apps móviles",
    "servicios": ["Apps Android de cero", "Mejoras a apps existentes"],
    "tecnologias": ["Kotlin", "Jetpack Compose"],
    "tarifa": "desde 25 USD/h o por proyecto",
    "disponibilidad": "20 h por semana, remoto",
    "idiomas": ["Español", "Inglés"],
    "noQuiero": ["Trabajo gratis a prueba"]
  },
  "modelo": "sonnet",
  "criterios": [{ "id": "proyectos", "nombre": "Proyectos por encargo", "reglas": ["…"] }]
}
```

- `modelo`: el modelo de Claude Code con el que arranca el agente (`sonnet`, `opus`…). Sin la clave, `sonnet`; con
  `""`, el que tenga la máquina de fábrica. Se le pasa a herdr como `herdr agent start … -- --model <modelo>`; un
  nombre raro (con espacios o símbolos) se ignora.
- `criterios`: tres juegos de fábrica (**Proyectos por encargo**, **Trabajo por horas o de largo plazo**, **Clientes
  directos**); se editan en el panel, un criterio por línea, el de arriba pesa más.

## Archivos

Todo en `~/.pixel-agents/freelance/` (la carpeta donde trabaja el agente):

| Archivo                | Qué es                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| `estado.json`          | Los pedidos y lo que marcaste en cada resultado                                |
| `pedidos/<id>.md`      | El encargo: pedido, oferta, criterios en orden, entrega y la skill completa    |
| `resultados/<id>.json` | Lo que escribe el agente (formato en el encargo y en la skill, con `detalles`) |

El servidor revisa `resultados/` cada 2 segundos. Lo que llega se limpia antes de mostrarse: solo ligas `http(s)`,
textos recortados, puntuación de 0 a 100, a lo más 25 resultados y 6 detalles por resultado.

## Seguridad

- El agente arranca **sin** `--dangerously-skip-permissions`: Claude Code te pide permiso como siempre.
- herdr se llama con `execFile` (sin consola) y el encargo se le da con `herdr agent prompt`. Lo que escribes en el
  pedido o en la oferta nunca llega a una línea de comandos; el modelo solo pasa si es un nombre simple.
- Solo las páginas abiertas con el token de la oficina ven el panel y pueden guardar, lanzar o marcar.

## Carpetas

| Carpeta    | Qué hay                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/`  | `freelanceFeature.ts` (cuarto, oferta, Conexiones), `brief.ts` (encargo), `offer.ts` (`freelance.json`), `defaults.ts` (oferta de ejemplo y criterios de fábrica), `constants.ts` |
| `webview/` | `FreelancePanel.tsx`, `freelanceStore.ts`, `freelanceFurniture.ts` (el mapa), `freelanceText.ts`, `constants.ts`                                                                  |
| `skill/`   | La skill del agente de búsqueda                                                                                                                                                   |
| `test/`    | Pruebas del servidor (sin herdr ni red: dobles) y de la página                                                                                                                    |

El arte del cuarto ya existía (`FREELANCE_*` en `webview-ui/public/assets/furniture/`); esta función no cambia
ningún plano. La parte de "pedido → agente → resultados" vive en [features/busquedas](../busquedas/README.md), a la
que se le agregaron `detalles`, la nota por resultado, el rótulo de la marca y el modelo al lanzar.

Toca al resto del proyecto en: mensajes en `core/asyncapi.yaml` (`freelanceStatus`, `saveFreelanceOffer`,
`SearchResult.details` y `note`), el registro en `server/src/cli.ts`, el clic en el escritorio (`officeState.ts`,
`office/hint/`), el mapa (`officeState.ts`) y el panel en `App.tsx`.
