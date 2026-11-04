# Google (feature opcional)

Una sola sesión de Google para todas las funciones de la oficina que la usan. Te conectas **una vez** y aceptas
los tres permisos: **Calendar** (leer y agregar eventos), **Tasks** (tus tareas) y **leer Drive** (`drive.readonly`,
solo lectura). La usan [Conciertos](../conciertos/README.md), la [agenda](../agenda/README.md) y el
[jardín](../jardin/README.md).

**Por qué `drive.readonly` y no `drive.file`:** `drive.file` solo ve los archivos que creó esta misma app, y las
notas y fotos del jardín las crea el celular (otra app). `drive.readonly` deja ver tus archivos sin poder cambiarlos;
la oficina solo abre la carpeta del jardín y nunca escribe, mueve ni borra nada en Drive. Si te conectaste antes de
que existiera este permiso, **vuelve a conectar** para aceptarlo (lo demás sigue funcionando sin él).

## Configurar

1. En [Google Cloud](https://console.cloud.google.com) crea un proyecto y activa **Google Calendar API**, **Google
   Tasks API** y **Google Drive API**. Configura **Google Auth Platform** (público externo) y crea un cliente de tipo **App de escritorio**.
   Mientras la app esté en "Prueba", agrégate como usuario de prueba.
2. Pon su ID y su secreto en `~/.pixel-agents/google.json` (la oficina lo vuelve a leer sin reiniciar):

   ```json
   { "clientId": "…", "clientSecret": "…" }
   ```

3. Abre la oficina con su enlace con token y usa **Conectar con Google** (por ejemplo, en el panel de los boletos).
   Como la app no está verificada, Google avisa: dale **Continuar**.

En "Prueba", Google corta la sesión a los 7 días; un día antes se avisa para **Reconectar**.

## Para las funciones

`createGoogleFeature` (`server/googleFeature.ts`) se registra en `server/src/cli.ts` y se pasa a quien lo use. Un
paquete privado lo encuentra con `findGoogleSession(features)`. Lo que ofrece (`GoogleSession`):

| Miembro                      | Qué hace                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `configured` / `connected`   | Hay llaves / hay sesión                                                                                     |
| `hasScope(scope)`            | El permiso se aceptó al conectar (`GOOGLE_CALENDAR_SCOPE`, `GOOGLE_TASKS_SCOPE`, `GOOGLE_DRIVE_READ_SCOPE`) |
| `api(url, { method, body })` | Llamada JSON a cualquier API de Google con el token; lanza `GoogleReconnectNeeded` si la sesión murió       |
| `download(url)`              | Los bytes de un archivo (contenido de Drive), con el token; mismos errores que `api`                        |
| `reconnectInDays()`          | Días para que caduque, solo cuando falta un día o menos                                                     |
| `forget()`                   | Cierra la sesión (todas las funciones pierden Google)                                                       |
| `onChange(listener)`         | Aviso al conectar, desconectar o caducar                                                                    |

Rutas: `/api/google/login?token=<token de la oficina>` y `/api/google/callback`. El mensaje `disconnectGoogle` (solo
páginas con token) cierra la sesión.

## Privacidad

Las llaves y la sesión viven en `google.json`, en tu computadora. Solo quien abrió la oficina con su token puede
conectar o desconectar Google.
