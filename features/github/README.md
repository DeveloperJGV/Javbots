# Sala de GitHub

Una sala de archivo donde **cada archivero es uno de tus repos**. El de arriba a la izquierda es el que tuvo el push
más reciente, y los demás siguen en orden de lectura. Los archiveros que sobran se quedan de madera, vacíos.

- **Nivel**, según los commits de la rama principal: madera, metal (desde 20) y oro (desde 100).
- **Hojas encima**: una más al llegar a 1, 5, 20, 60 y 150 commits.
- **Foco verde**: hubo push en los últimos 7 días.
- **Etiquetas rojas**: el repo es privado.
- **Tablero de contribuciones** (`GITHUB_GRAPH`): tus últimas 9 semanas con los verdes de GitHub.
- **Corcho** (`GITHUB_PRS`): una nota por PR abierto en tus repos (caben 6).

Al pasar el mouse sobre un archivero sale el letrero de la oficina con el nombre del repo y sus commits (y sobre el
tablero, "Contribuciones de las últimas semanas"). Un clic en un archivero o en el tablero abre la lista de repos y
PRs, con enlaces a GitHub. El corcho es de adorno: no tiene clic.

## De dónde salen los datos

El servidor le hace una sola consulta a `gh api graphql`: tus 40 repos con el push más reciente, con sus commits,
estrellas y PRs abiertos, más tu calendario de contribuciones. La hace al abrir una página y luego cada 10 minutos
mientras haya una abierta.

### Qué cuenta de gh usa cada oficina

- Cada oficina puede tener su propia sesión de `gh` (su carpeta `GH_CONFIG_DIR`). Un paquete privado elige la de sus
  oficinas con `ctx.githubConfigDir(oficina, () => carpeta)` (`server/src/packTypes.ts`).
- Las demás oficinas usan la de `~/.pixel-agents/sala-github.json`, si existe:
  `{ "ghConfigDir": "~/.config/gh-personal" }`. Sin ese archivo, la sesión normal de `gh` (`gh auth login`).
- Nada sale de la terminal que abrió la oficina: `gh` se busca con ruta completa (PATH, Homebrew, `GH_PATH`) y
  `GH_CONFIG_DIR`, `GH_TOKEN` y `GITHUB_TOKEN` heredados se ignoran. Igual desde el Dock, una terminal o tras reiniciar.

### Si gh no tiene sesión

Al arrancar (y cuando cambia la carpeta de una oficina) revisa una vez cada cuenta con una llamada barata
(`gh api user`). Si falla:

- Sale **un aviso** en las páginas de las oficinas que usan esa cuenta, con el comando exacto para arreglarlo
  (por ejemplo `GH_CONFIG_DIR=~/.config/gh-x gh auth login`), y **una** línea en el registro con el motivo real.
- Lo vuelve a revisar callado cada minuto; cuando la sesión regresa, el aviso se quita solo y llegan los datos. No hay
  que reiniciar la oficina.
- El tablero de Conexiones dice qué cuenta usa cada oficina y si está bien.

Además:

- Solo páginas con la clave (`privileged`): los nombres de repos privados no salen a una página sin clave.
- Solo la oficina del navegador (`server/src/cli.ts`); la extensión de VS Code no lo carga.

| Carpeta    | Qué hay                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| `server/`  | `createGithubFeature`: consulta `gh` y manda `githubStatus` y `githubNotice`           |
| `webview/` | `githubStore`, los muebles (`githubFurniture.ts`) y el panel con la lista              |
| `arte/`    | `armar.py` dibuja los tres muebles por código (`python features/github/arte/armar.py`) |
| `assets/`  | `GITHUB_CABINET`, `GITHUB_GRAPH`, `GITHUB_PRS`                                         |
| `test/`    | Pruebas del servidor y de la página                                                    |

La sala se agrega a un plano con `node arte/provisionales/sala-github.cjs <layout.json>`.
