# Asistente de Ofertas (opcional)

Un extra del buscador de precios: si en la computadora está instalado **Claude Code**, la oficina puede pedirle a un
modelo chico (Haiku) que investigue un producto en internet como lo haría una persona. Hace dos trabajos:

- **Investigar precio:** el precio normal del producto en tiendas de México y sitios de ofertas, el más bajo y el más
  alto que se han visto (con fecha) y de dónde salió cada dato.
- **Buscar similares:** de 3 a 6 productos parecidos: su "compa" (el que queda casi igual) y alternativas del mismo
  rango, cada uno con la búsqueda lista para que la oficina lo busque en sus tiendas.

El buscador por reglas **sigue funcionando igual sin esto**. Si Claude Code no está instalado, `available()` dice
`false` y el panel no muestra los botones.

## Qué pide

- Claude Code instalado y con sesión iniciada (`claude` en el PATH, o en `~/.local/bin`).
- Cada consulta usa la suscripción de esa sesión. En las pruebas de esta máquina cada una tardó entre 40 s y 1 min y
  Claude Code estimó entre 0.08 y 0.09 USD de uso por consulta (con suscripción no se cobra así, pero cuenta para
  los límites de uso).

## Cómo se apaga o se ajusta

En `~/.pixel-agents/ofertas.json` (a mano; todo es opcional):

```json
{
  "asistente": {
    "apagado": true,
    "comando": "C:/ruta/claude.exe",
    "modelo": "haiku",
    "minutosLimite": 4
  }
}
```

- `apagado`: `true` y la función desaparece (también desde Ajustes de Ofertas).
- `comando`: otra ruta al CLI (de fábrica `claude`, buscado en el PATH; en Windows sirve `claude.exe` o `claude.cmd`).
- `modelo`: alias o nombre del modelo (de fábrica `haiku`; Ajustes ofrece `haiku` o `sonnet`).
- `minutosLimite`: tiempo máximo por consulta (de fábrica 4; entre 0.5 y 15).

## Qué puede y qué no puede hacer el modelo

Corre sin ventana con `claude -p` y solo con las herramientas de web (`WebSearch`, `WebFetch`): no ve archivos, no
corre comandos, no usa servidores MCP ni otros agentes, no carga ajustes ni hooks del usuario y no guarda la sesión.
Trabaja en una carpeta temporal vacía que se borra al terminar. La petición va por la entrada estándar, nunca en la
línea de comandos. Del entorno se quitan las variables de la oficina, todo lo que parezca secreto y todo acceso de
pago (`ANTHROPIC_*`, Bedrock, Vertex): solo queda el inicio de sesión de suscripción del propio CLI.

Su respuesta se trata como **dato no confiable**: se valida contra el esquema, solo pasan ligas `http(s)` sin
usuario/contraseña, los textos se recortan y se limpian, los precios deben ser positivos y razonables (y cerca del
precio que vio la persona, si lo hay), las fechas reales y no futuras, y lo que sobre se descarta. Números sin
ninguna fuente detrás se tiran. Nada de la respuesta se ejecuta.

## Banderas del CLI

| Bandera                                                   | Para qué                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `-p`                                                      | Sin ventana; la petición llega por la entrada estándar                      |
| `--model haiku`                                           | El modelo chico                                                             |
| `--output-format json` + `--json-schema <esquema>`        | Respuesta estructurada en `structured_output`                               |
| `--tools WebSearch,WebFetch`                              | Las únicas herramientas que existen en la sesión                            |
| `--allowedTools WebSearch,WebFetch`                       | Que esas dos no pidan permiso                                               |
| `--disallowedTools mcp__*`                                | Ninguna herramienta MCP                                                     |
| `--permission-mode dontAsk` + `--permission-prompts none` | Todo lo que pediría permiso se niega solo                                   |
| `--restricted`                                            | Sin ajustes del usuario ni del proyecto; herramientas de archivo encerradas |
| `--strict-mcp-config`                                     | Ningún servidor MCP de la configuración                                     |
| `--settings {"disableAllHooks":true}`                     | Sin hooks (la oficina no ve un personaje fantasma)                          |
| `--no-session-persistence`                                | No se guarda la conversación                                                |
| `--no-chrome`, `--disable-slash-commands`                 | Sin navegador ni comandos                                                   |
| `--max-turns 24`, `--max-budget-usd 0.5`                  | Topes por consulta                                                          |

## Interfaz

```ts
import { createAsistente } from './asistente/asistente.js';

const asistente = createAsistente(); // lee ofertas.json → "asistente" antes de cada consulta
asistente.available(); // ¿mostrar los botones?
asistente.busy(); // ¿hay una consulta en curso?
asistente.cancel(); // detiene la consulta en curso
await asistente.investigarPrecio('Producto', { precioActual: 1899, tienda: 'Tienda' }, signal);
await asistente.buscarSimilares('Producto', { presupuesto: 2500 }, signal);
```

Nunca lanza errores. Regresa `{ ok: true, data, meta: { ms, model, costUsd?, turns? } }` o
`{ ok: false, reason, detail? }` con `reason`:

| `reason`          | Qué pasó                                                      | Texto sugerido en el panel                       |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `no-cli`          | Claude Code no está instalado (o la ruta está mal)            | (no se muestran los botones)                     |
| `off`             | Apagado en `ofertas.json`                                     | (no se muestran los botones)                     |
| `busy`            | Ya hay una consulta en curso (una a la vez)                   | "El asistente está ocupado con otra consulta"    |
| `no-subscription` | Claude Code no tiene sesión de suscripción (cobraría por uso) | "…no tiene una sesión con suscripción…"          |
| `timeout`         | Pasó el tiempo límite                                         | "El asistente tardó demasiado; intenta de nuevo" |
| `cancelled`       | Se canceló                                                    | "Consulta cancelada"                             |
| `bad-output`      | Respondió algo que no cumple el formato                       | "El asistente no dio una respuesta usable"       |
| `failed`          | El CLI falló (sesión, red, límites); `detail` dice qué        | "El asistente falló: {detail}"                   |

`data` de **investigarPrecio**: `{ precioTipico?, minimoVisto?, maximoVisto?, nota, confianza: 'alta'|'media'|'baja',
fuentes: [{ titulo, url, fecha?, precio? }], revisado }` (`revisado` lo pone la oficina, en ISO).

`data` de **buscarSimilares**: `{ similares: [{ tipo: 'compa'|'alternativa', nombre, porque, precioAprox?, consulta,
fuentes }], revisado }`, con el "compa" primero (cuando lo hay).

### Cómo está conectado

`server/ofertasAsistente.ts` lo conecta al panel (detalles en el README del feature). Mensajes en `core/asyncapi.yaml`,
todos solo para conexiones con token: `ofertasAsistenteInvestigar`, `ofertasAsistenteSimilares`,
`ofertasAsistenteCancelar` y `setOfertasAsistente` (cliente → servidor); `ofertasAsistenteEstado` (al conectar, al
empezar y terminar una consulta y al cambiar los ajustes) y `ofertasAsistenteResultado` (solo a quien preguntó).

Antes de cada consulta se corre `claude auth status --json` con el mismo entorno limpio: solo se sigue si la sesión
es de suscripción (`apiProvider: firstParty` y un `authMethod` que no sea llave). Si no, `reason: 'no-subscription'`.
