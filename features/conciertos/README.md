# Conciertos (feature opcional)

**Un clic en los boletos de concierto** (sobre el mostrador de la sala de música) abre "Mis próximos conciertos":

- **En tu calendario:** los eventos de tu Google Calendar cuyo título empieza con `Concierto:` (por ejemplo
  `Concierto: Daft Punk – Alive Tour`), con la fecha, el lugar y cuántos días faltan.
- **En México, de lo que escuchas:** el botón **Buscar conciertos** revisa Ticketmaster México con tus artistas más
  escuchados en Spotify (y los que ya tienes en el calendario). Lo que ya está en el calendario no se repite, y lo
  demás se agrega con **Agregar** (el título queda con `Concierto:`).

Sin llaves, el panel dice qué falta y la oficina funciona igual.

## La regla del título

Un evento es concierto si su título **empieza con `Concierto:`** (sin importar mayúsculas). Lo que sigue es el
nombre; el artista se toma de lo que va antes de `–`, `-` o `: `. Así lo entienden igual tú, la oficina y
cualquiera que agregue eventos a tu calendario.

## Configurar

Las llaves van en `~/.pixel-agents/conciertos.json` (se edita a mano; la oficina lo vuelve a leer sin reiniciar):

```json
{
  "ticketmasterKey": "…",
  "setlistfmKey": "…",
  "calendario": "Conciertos"
}
```

1. **Google:** la sesión es la de [features/google](../google/README.md) (`google.json`), la misma para todas las
   funciones que usan Google.
2. **Calendario:** `calendario` es el nombre de un calendario tuyo que **ya existe** (por defecto `Conciertos`). La
   oficina no crea ni comparte calendarios.
3. **Ticketmaster:** regístrate en [developer.ticketmaster.com](https://developer.ticketmaster.com) y copia la
   _Consumer Key_ de tu app (la _callback URL_ puede ser `http://127.0.0.1:3100/`; no se usa).
4. **Spotify:** los artistas más escuchados salen de la cuenta conectada en Ajustes → Música (permiso
   `user-top-read`). Si la conectaste antes de que existiera este feature, desconéctala y vuelve a conectarla.
5. Abre la oficina con su enlace con token, haz clic en los boletos y en **Conectar con Google**.

`setlistfmKey` ([setlist.fm](https://www.setlist.fm/settings/api), uso no comercial) es para la playlist del
setlist probable de cada concierto, que todavía no está.

## Privacidad

Todo se queda en tu computadora: las llaves viven en `conciertos.json` y la sesión de Google en `google.json`. La oficina solo habla
con Google Calendar (tu calendario), Ticketmaster (nombres de artistas, para buscar) y Spotify (tus artistas más
escuchados). Solo quien abrió la oficina con su token ve el panel.

## Carpetas

| Carpeta    | Qué hay                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/`  | `concertsFeature.ts` (estado y acciones), `googleCalendar.ts` (el calendario, con la sesión de features/google), `ticketmaster.ts`, `concertsConfig.ts` |
| `webview/` | `ConcertsPanel.tsx` (el panel), `concertsStore.ts`, `concertsText.ts` (fechas y días que faltan)                                                        |
| `test/`    | Pruebas del servidor (corren con `npm test`)                                                                                                            |

Toca al resto del proyecto en: mensajes en `core/asyncapi.yaml` (`concertsStatus`, `refreshConcerts`,
`searchConcerts`, `addConcert`), la sesión de `features/google`, el registro en `server/src/cli.ts`, `topArtists()` en
`features/musica/server`, el clic en los boletos (`officeState.ts`, `OfficeCanvas.tsx`) y el panel en `App.tsx`. La compilación, el lint y
las pruebas lo toman solos (`features/*/`).
