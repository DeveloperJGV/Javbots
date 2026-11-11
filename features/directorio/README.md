# Directorio (feature opcional)

Un cuarto del piso Personal con estilo de **vestíbulo de edificio**: directorio de fieltro negro con letras blancas,
mostrador con campanita, tablero de llaves y teléfono de disco. Un clic en cualquiera abre el panel **Directorio**:

1. **Pedido.** Escribes qué necesitas, dónde y para cuándo ("reparar refrigerador que no enfría, mi ciudad, esta
   semana") y escoges un juego de criterios. Guardarlo no lanza nada todavía.
2. **Buscar.** Abre un agente de Claude Code en una pestaña nueva de [herdr](https://herdr.dev) ("Directorio"), con
   sus **permisos normales**, y le da el encargo. El agente sale en la oficina como cualquier sesión. Si Claude
   pregunta algo al arrancar (por ejemplo, si confías en la carpeta), contesta en esa pestaña y presiona **Mandar
   encargo**.
3. **Copiar encargo.** Sin herdr, copia una sola línea para pegarla en cualquier sesión de Claude Code
   ("Lee el encargo en …/pedidos/<id>.md y síguelo paso a paso.").
4. **Resultados.** El agente escribe un archivo; el panel lo lee solo en unos segundos y los muestra ordenados:
   recomendados por puntuación, luego los descartados, cada uno con tipo (oficial, establecido u otro), calificación,
   reseñas, teléfono, dirección, liga, fuente y **por qué**.
5. **Contacté / Descartado / Agendar.** Agendar crea la cita en tu calendario de la casa (`casa` en el `agenda.json` de la agenda) con el título
   `Servicio: <nombre>`, la dirección y el teléfono, después de mostrar **"¿Lo agrego así?"**. Necesita la sesión de
   Google ([features/google](../google/README.md)).

## Criterios

Vienen tres juegos: **Técnicos y servicios** (el de fábrica), **Doctores y clínicas** y **Restaurantes**. Se editan
en el panel (un criterio por línea; el de arriba pesa más) y se guardan en `~/.pixel-agents/directorio.json`, que
también se puede editar a mano:

```json
{
  "criterios": [
    {
      "id": "tecnicos",
      "nombre": "Técnicos y servicios",
      "reglas": ["Primero, el servicio oficial…", "…"]
    }
  ]
}
```

## Archivos

Todo en `~/.pixel-agents/directorio/` (es la carpeta donde trabaja el agente):

| Archivo                | Qué es                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| `estado.json`          | Los pedidos y lo que marcaste en cada resultado                     |
| `pedidos/<id>.md`      | El encargo: pedido, criterios en orden, entrega y la skill completa |
| `resultados/<id>.json` | Lo que escribe el agente (formato en el encargo y en la skill)      |

El servidor revisa `resultados/` cada 2 segundos. Lo que llega se limpia antes de mostrarse: solo ligas `http(s)`,
textos recortados, puntuación de 0 a 100 y a lo más 25 resultados.

## Skill

`skill/SKILL.md`: cómo buscar con los criterios, qué fuentes usar (sitio de la marca, mapas y reseñas, sitio del
negocio), cómo detectar reseñas falsas y negocios sin presencia, y el formato de entrega. **No se instala en
`~/.claude`**: el servidor la pega dentro de cada encargo, así el agente lee un solo archivo.

## Seguridad

- El agente arranca **sin** `--dangerously-skip-permissions`: Claude Code te pide permiso como siempre.
- herdr se llama con `execFile` (sin consola) y el encargo se le da con `herdr agent prompt`, que lo escribe en
  Claude, no en una terminal. Lo que tú escribes en el pedido nunca llega a una línea de comandos.
- La línea del encargo no lleva el token de la oficina: el agente entrega por archivo, no por HTTP.
- Solo las páginas abiertas con el token de la oficina ven el panel y pueden lanzar, marcar o agendar.

## Carpetas

| Carpeta    | Qué hay                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `server/`  | `directorioFeature.ts` (cuarto, Agendar), `brief.ts` (el encargo), `constants.ts` (criterios)  |
| `webview/` | `DirectorioPanel.tsx`, `directorioStore.ts`, `directorioText.ts`                               |
| `arte/`    | `armar.py` dibuja los 4 muebles provisionales por código; `plano.cjs` arma el plano del cuarto |
| `planos/`  | `directorio.json`: el cuarto solo, 19×11, para juntarlo en el piso Personal                    |
| `skill/`   | La skill del agente de búsqueda                                                                |
| `test/`    | Pruebas del servidor (sin herdr ni Google de verdad) y de la página                            |

La parte de "pedido → agente → resultados" es genérica y vive en [features/busquedas](../busquedas/README.md).

Toca al resto del proyecto en: mensajes en `core/asyncapi.yaml` (los de `features/busquedas`), el registro en
`server/src/cli.ts`, la copia de `skill/` en `esbuild.js`, el clic en los muebles (`officeState.ts`,
`OfficeCanvas.tsx`) y el panel en `App.tsx`.
