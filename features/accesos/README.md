# Accesos

Una mesa de cartógrafo en la oficina que abre **páginas propias que corren en la computadora**: un mapa, un tablero,
cualquier página con su propio servidor local. La mesa dice si la página está prendida y, si se le explica cómo, la
prende.

Es una función normal de la oficina: reglas y código, sin cuentas ni servicios de internet. Nunca sale de la
computadora: solo conoce direcciones `http://localhost:<puerto>/` y `http://127.0.0.1:<puerto>/`.

## Qué hace

- **La mesa:** un mapa de pergamino desplegado con una ruta punteada, una brújula, una lupa, un rollo de mapa y una
  vela. La vela se prende (y parpadea) cuando una de las páginas contesta, y chisporrotea mientras una se está
  prendiendo. Al pasar el ratón dice «<nombre>: abrir» (o «Accesos» si hay varias páginas).
- **El panel:** al hacer clic sale un panel chico con cada página: nombre, descripción, dirección y si está
  **prendida** o **apagada** (la oficina le hace una petición a su dirección, con 1.5 s de límite, al abrir el panel
  y cada 20 s mientras la oficina está abierta).
- **Abrir:** con la página prendida, «Abrir» es un enlace normal que la abre en una pestaña nueva.
- **Prender:** con la página apagada y con `iniciar` en la lista, «Prender» arranca su programa aparte de la oficina,
  espera a que la dirección conteste (hasta 30 s) y entonces deja abrirla. Si el programa no existe, la carpeta no
  existe o se cierra con error, el panel lo dice. Lo que el programa escribe queda en
  `~/.pixel-agents/accesos-logs/<id>.log` (se reescribe en cada arranque).

También se abre con `#accesos` al final de la dirección de la oficina.

## La lista: `~/.pixel-agents/accesos.json`

Se escribe a mano (la oficina nunca la escribe). Sin el archivo, la lista está vacía.

```json
{
  "accesos": [
    {
      "id": "tablero",
      "nombre": "Tablero",
      "descripcion": "El tablero de mi proyecto.",
      "url": "http://localhost:4000/",
      "iniciar": {
        "comando": "node",
        "argumentos": ["servidor.mjs"],
        "carpeta": "C:/proyectos/tablero"
      }
    }
  ]
}
```

- `id`: minúsculas, números y guiones (hasta 32). Único.
- `nombre` (hasta 40 letras) y `descripcion` (hasta 240): se limpian de caracteres de control antes de pintarse.
- `url`: solo `http://localhost:<puerto>/…` o `http://127.0.0.1:<puerto>/…`, con puerto y sin usuario ni contraseña.
  Cualquier otra se deja fuera con un aviso.
- `iniciar` (opcional): `comando` es el programa (por ejemplo `node`, o su ruta completa), `argumentos` una lista de
  textos y `carpeta` la ruta completa desde donde se corre (tiene que existir). En Windows, `comando` tiene que ser un
  programa (`.exe`): un `.cmd` o `.bat` (como `npm`) no se acepta, porque se corre sin consola de comandos.
- Hasta 20 páginas. Lo que no se entiende sale como aviso abajo del panel y lo demás sigue funcionando.

## Seguridad

- Solo la página con la llave de la oficina ve la lista y puede prender. Una página sin llave no recibe nada.
- El mensaje de «Prender» solo lleva el `id`: el programa, sus argumentos y su carpeta salen **siempre** del archivo
  del dueño, y nunca viajan a la página.
- Se arranca sin consola de comandos (`spawn` con la lista de argumentos), desde una carpeta que existe, sin las
  variables de la oficina (su llave entre ellas), de Claude Code ni nada que parezca secreto, y a lo más una vez a la
  vez por página. Si ya contesta, no se arranca otra.
- La comprobación de «prendida» solo pregunta a direcciones locales y no sigue redirecciones.
- La página prendida queda corriendo aparte: cerrar la oficina no la apaga. Para apagarla, ciérrala como se cierre ese
  programa (o desde el Administrador de tareas).

## Dónde vive cada cosa

```
features/accesos/
  server/      La lista (accesosConfig.ts), la comprobación y el arranque (accesosFeature.ts)
  webview/     El panel, su store, la vela de la mesa (accesosFurniture.ts) y los textos
  arte/        La mesa dibujada por código (armar.py) y el script que la pone en un plano (poner.cjs)
  assets/      ACCESOS_MAP_TABLE (2×2)
  test/        Pruebas del servidor y del panel
```

## El mueble

`ACCESOS_MAP_TABLE` (2×2, la fila de arriba es fondo) se dibuja con `python features/accesos/arte/armar.py`. La vela
está apagada en el PNG; la flama la pinta la página (`webview/constants.ts`, `ACCESOS_FLAME_*`). Para ponerla en un
plano: `node features/accesos/arte/poner.cjs [plano.json] [--piso <id>] [--en <col>,<fila>]`. Sin `--en` la pone en
el cuarto Becarios de la planta baja, cerca de la tele y del estante de la colección, y si ahí no cabe, en el primer
lugar libre que no corte el paso. No la duplica si ya está y no toca la carpeta real de la persona sin `--real`.

## Pruebas

```bash
npm run test:server -- accesos
npm run test:webview -- accesos
```
