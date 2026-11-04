# Búsquedas con agente (pieza común)

La parte de **pedido → agente → resultados** que comparten los cuartos donde un agente de Claude Code busca algo en
internet con criterios y deja lo que encontró en un panel. Hoy la usa el [Directorio](../directorio/README.md); está
pensada para que el cuarto de freelance la use igual. No tiene cuarto ni panel propios.

## Qué da

| Archivo                         | Qué hace                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `server/searchRoom.ts`          | `createSearchRoom`: pedidos en `estado.json`, encargo por pedido, lanzar, leer resultados  |
| `server/herdrLauncher.ts`       | `createHerdrLauncher`: pestaña de herdr + `agent start --kind claude` + `agent prompt`     |
| `server/criteria.ts`            | Juegos de criterios en un JSON editable (claves en español), con los de fábrica del cuarto |
| `webview/searchRoomStore.ts`    | `SearchRoomStore` (uno por cuarto) y `useSearchRoom`                                       |
| `webview/SearchRequestCard.tsx` | Un pedido con Buscar, Copiar encargo, Borrar y sus resultados con Contacté y Descartado    |
| `webview/CriteriaEditor.tsx`    | Editor de juegos de criterios                                                              |

Mensajes (`core/asyncapi.yaml`), todos con `room` para saber de qué cuarto son: `searchRoomStatus` (servidor →
página) y `createSearchRequest`, `launchSearchAgent`, `markSearchResult`, `deleteSearchRequest`,
`saveSearchCriteria`, `scheduleSearchResult` (página → servidor; este último lo atiende el cuarto que sepa agendar).

## Cómo lo usa un cuarto

```ts
const room = createSearchRoom({
  room: 'freelance', // va en cada mensaje
  label: 'Freelance', // nombre de la pestaña en herdr
  dir: path.join(home, 'freelance'), // ~/.pixel-agents/freelance/
  criteria: createCriteriaStore(path.join(home, 'freelance.json'), CRITERIOS_DE_FABRICA),
  kinds: ['directo', 'plataforma', 'otro'], // sus tipos, el mejor primero
  brief: (pedido, criterios, rutas) => encargoFreelance(pedido, criterios, rutas, skill),
  launcher: createHerdrLauncher(),
});
```

Su `ServerFeature` reenvía a `room.handleMessage(msg)` los mensajes de páginas con token, manda
`{ type: 'searchRoomStatus', ...room.statusParts(), saving }` al conectar y en `room.onChange`, y agrega lo suyo
(el Directorio agrega Agendar). En la página: `new SearchRoomStore('freelance')`, `useSearchRoom` en `App.tsx` y
un panel que use `SearchRequestCard` con sus propios botones en `actions`.

## El archivo de resultados

`resultados/<id>.json`, en español porque lo escribe el agente según su skill:

```json
{
  "pedido": "<id>",
  "nota": "opcional",
  "resultados": [
    {
      "nombre": "…",
      "tipo": "…",
      "calificacion": 4.6,
      "resenas": 312,
      "telefono": "…",
      "direccion": "…",
      "liga": "https://…",
      "fuente": "…",
      "porque": "…",
      "puntuacion": 90,
      "veredicto": "recomendado"
    }
  ]
}
```

Lo que no cuadra se tira: ligas que no son `http(s)`, tipos desconocidos (pasan al último tipo del cuarto),
números fuera de rango, textos largos. El id de cada resultado sale de su nombre, así que las marcas sobreviven a
que el agente reescriba el archivo.
