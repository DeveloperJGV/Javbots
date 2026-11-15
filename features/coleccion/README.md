# Colección de juegos

Un estante en la oficina, junto a la tele del cuarto de juegos. Al abrirlo, la colección sale en **repisas por
consola**, de NES a Xbox Series X, con cada caja o cartucho dibujado por código y el nombre en el lomo. Se llena a
mano: arranca vacía.

Es una función normal de la oficina: reglas y código, sin cuentas ni servicios de internet.

## Qué hace

- **Repisas por consola:** una por consola que tenga algo, en el orden del riel de la izquierda (agrupado por época,
  con cuántos juegos hay en cada una). Cada repisa se recorre sola con sus flechas, con la rueda de lado (o Shift +
  rueda) o arrastrando. Cada una dice cuántos tiene, cuántos busca y cuántos van a medias; la consola con más juegos
  (5 o más) se ilumina.
- **Caja abierta:** la caja sale de la repisa y se abre como estuche. Atrás, su ficha: región, completo / suelto /
  sellado, cómo va, última vez que se jugó, jugadores, cuánto dura una partida, de quién es, cuándo llegó, su serie
  (con los demás de la serie en todas las consolas, los que faltan punteados) y notas. Adentro, el disco girando o el
  cartucho. Botones: anterior / siguiente de la repisa, Editar, «Lo jugamos hoy» y Borrar (en dos pasos).
- **Agregar a mano:** solo el nombre y la consola son obligatorios. Pensado para meter muchos seguidos: Enter guarda
  y deja la consola (y la región y el dueño) puestos, con el cursor otra vez en el nombre.
- **«Se busca»:** huecos punteados en su repisa con el precio que se vio (y dónde, si se quiere). «¡Ya lo tengo!» lo
  convierte en juego (entra a la colección ese día). «Solo «se busca»» deja iluminados solo los huecos.
- **Buscador** por juego o por serie: una serie se ilumina en todas las repisas; un juego se abre. **Agrupar por
  serie** junta en cada repisa los de una misma serie, con su placa.
- **«¿Qué jugamos hoy?»:** quiénes (solo, dos, 3-4), cuánto tiempo, qué se antoja (terminar uno a medias, uno sin
  jugar, uno de siempre, sorpréndeme) y qué consola. Propone tres, con el porqué; «Otras tres» sigue con la lista.
- **Vacía** enseña una repisa con huecos y «Agrega el primero».

Teclado: `/` busca, `N` agrega, las flechas recorren las cajas (izquierda / derecha en la repisa, arriba / abajo a la
otra repisa), Inicio / Fin, Enter abre, Esc regresa un paso (y cierra). Con la caja abierta, las flechas pasan a la
siguiente.

Se abre con un clic en el estante o con `#coleccion` al final de la dirección de la oficina. Solo la página con la
llave de la oficina ve la colección y puede guardar, editar o borrar.

## Dónde viven los datos

Todo en un archivo: `~/.pixel-agents/coleccion.json`. Se escribe de forma atómica (archivo temporal y renombrar), y
la oficina ve sola los cambios hechos a mano antes de escribir encima.

```json
{
  "version": 1,
  "games": [
    {
      "id": "k3x9q2ab",
      "title": "Capitán Cohete 2",
      "platform": "n64",
      "wanted": false,
      "region": "ntsc-u",
      "condition": "completo",
      "progress": "a-medias",
      "players": 2,
      "coop": true,
      "length": "1h",
      "series": "Capitán Cohete",
      "owner": "",
      "notes": "",
      "price": "",
      "seenAt": "",
      "addedAt": "2026-11-13",
      "lastPlayed": "2026-11-01",
      "updatedAt": "2026-11-13T20:15:00.000Z"
    }
  ],
  "trash": []
}
```

- Texto vacío y 0 quieren decir «sin anotar». Un hueco «se busca» es un juego con `"wanted": true` y su `price`.
- `platform`: `nes`, `snes`, `n64`, `ps1`, `gc`, `xbox`, `ps2`, `x360`, `wii`, `ps3`, `wiiu`, `xone`, `ps4`, `switch`,
  `ps5`, `xsx`. Otra escrita a mano sale en su propia repisa al final.
- `region`: `ntsc-u`, `pal`, `ntsc-j`, `otra`. `condition`: `completo`, `suelto`, `sellado`. `progress`: `sin-jugar`,
  `a-medias`, `terminado`, `de-siempre`. `length`: `rato`, `1h`, `tarde`.
- `externalId`, `barcode` y `cover` (opcionales) quedan listos para la etapa 2 y todavía no se usan.
- Al leer, lo que no se entiende toma su valor de fábrica y sale como aviso abajo de las repisas; al guardar se
  conservan los campos desconocidos.
- **Borrar** no pierde nada: el juego pasa a `trash` dentro del mismo archivo (los 100 más recientes).
- Un archivo que no se puede leer se aparta como `coleccion.danado-<fecha>.json` al guardar el siguiente juego. Uno
  de más de 8 MB no se lee ni se escribe encima. Como mucho 5000 juegos.

## Dónde vive cada cosa

```
features/coleccion/
  core/        TypeScript puro, sin la oficina: formato del archivo, consolas, repisas, buscador, «¿Qué jugamos hoy?»
  server/      La oficina: el archivo coleccion.json y los mensajes
  webview/     El panel (repisas, estuche, cartel de «se busca», formulario, «¿Qué jugamos hoy?») y su store
  arte/        El estante dibujado por código (armar.py) y el script que lo pone en un plano (poner.cjs)
  assets/      COLECCION_SHELF (2×2)
  test/        Pruebas del núcleo, del servidor y del panel
```

`core/` no importa nada de Node ni de la oficina, para poder usarlo en una página de teléfono o una app.

## El mueble

`COLECCION_SHELF` (2×2, la fila de arriba es fondo) se dibuja con `python features/coleccion/arte/armar.py`: un
estante de madera con lomos de cajas de colores, cartuchos y un control encima. Para ponerlo en un plano:
`node features/coleccion/arte/poner.cjs [plano.json] [--piso <id>] [--en <col>,<fila>]`. Sin `--en` lo pone a la
derecha de la tele del cuarto Becarios (planta baja) y, si ahí no cabe, en el primer lugar libre que no corte el
paso. No lo duplica si ya está y no toca la carpeta real de la persona sin `--real`.

## Lo que sigue (etapa 2, no está)

Autocompletar y portadas desde una base de juegos, código de barras con el celular, importar listas, logros y
búsqueda automática de precios.

## Pruebas

```bash
npm run test:server -- coleccion
npm run test:webview
```
