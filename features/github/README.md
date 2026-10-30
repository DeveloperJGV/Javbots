# Sala de GitHub

Una sala de archivo donde **cada archivero es uno de tus repos**. El de arriba a la izquierda es el que tuvo el push
más reciente, y los demás siguen en orden de lectura. Los archiveros que sobran se quedan de madera, vacíos.

- **Nivel**, según los commits de la rama principal: madera, metal (desde 20) y oro (desde 100).
- **Hojas encima**: una más al llegar a 1, 5, 20, 60 y 150 commits.
- **Foco verde**: hubo push en los últimos 7 días.
- **Etiquetas rojas**: el repo es privado.
- **Tablero de contribuciones** (`GITHUB_GRAPH`): tus últimas 9 semanas con los verdes de GitHub.
- **Corcho** (`GITHUB_PRS`): una nota por PR abierto en tus repos (caben 6).

Al pasar el mouse sobre un archivero sale el nombre del repo y sus commits. Un clic (en un archivero, el tablero o
el corcho) abre la lista de repos y PRs, con enlaces a GitHub.

## De dónde salen los datos

El servidor le hace una sola consulta a `gh api graphql`: tus 40 repos con el push más reciente, con sus commits,
estrellas y PRs abiertos, más tu calendario de contribuciones. La hace al abrir una página y luego cada 10 minutos
mientras haya una abierta, con la sesión que ya tiene `gh` (`gh auth login`). Sin `gh`, o sin sesión, no manda nada
y los archiveros se quedan de madera.

- Busca `gh` en el PATH, luego en `GH_PATH` y en la instalación normal (`C:\Program Files\GitHub CLI\gh.exe`, o
  Homebrew en Mac): la consola de la oficina no siempre trae el PATH.
- Solo páginas con la clave (`privileged`): los nombres de repos privados no salen a una página sin clave.
- Solo la oficina del navegador (`server/src/cli.ts`); la extensión de VS Code no lo carga.

| Carpeta    | Qué hay                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| `server/`  | `createGithubFeature`: consulta `gh` y manda `githubStatus`                            |
| `webview/` | `githubStore`, los muebles (`githubFurniture.ts`) y el panel con el nombre y la lista  |
| `arte/`    | `armar.py` dibuja los tres muebles por código (`python features/github/arte/armar.py`) |
| `assets/`  | `GITHUB_CABINET`, `GITHUB_GRAPH`, `GITHUB_PRS`                                         |
| `test/`    | Pruebas del servidor y de la página                                                    |

La sala se agrega a un plano con `node arte/provisionales/sala-github.cjs <layout.json>`.
