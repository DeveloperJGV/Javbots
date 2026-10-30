# Uso de Claude en la oficina

Una barra abajo a la izquierda con los **límites del plan**: **5 horas**, **semana** y **semana de Fable**, en % y
con cuándo se reinician. Clic → cada perfil, lo que lleva cada modelo y lo que lleva **cada sesión (agente)**: costo
estimado, tokens y contexto. Si en el plano hay un mueble `USAGE_METER`, sus tres tubos se llenan con los mismos
límites (verde, naranja a partir de 50 %, rojo a partir de 80 %) y un clic en él abre el mismo detalle.

## De dónde salen los datos

Dos fuentes; la oficina no lee credenciales.

1. **`/usage` de Claude Code.** Al abrir una página, y cada 5 min mientras hay una abierta, el servidor corre
   `claude -p /usage` sin hooks, sin guardar la sesión y con un turno de Haiku como tope. Claude Code lo contesta
   él mismo, sin modelo y sin costo. De ahí sale el límite semanal por modelo (Fable), que la barra de estado no
   trae, y también 5 horas y semana si son más nuevos que los de la barra de estado. Va al perfil `personal`
   (la cuenta con la que está iniciado `claude`). Si una respuesta llegara a costar algo (porque `/usage` dejó de
   ser un comando local), deja de pedirlo hasta que se reinicie la oficina.
2. **El script de la barra de estado.** Claude Code le da `rate_limits` (5 horas y semana). Tu script de la barra de estado tiene que dejar una copia en
   `~/.pixel-agents/uso/<perfil>.json` cada vez que pinta la barra, con esta forma:

```json
{
  "updatedAt": 1792904033,
  "rate_limits": {
    "five_hour": { "used_percentage": 23, "resets_at": 1792910000 },
    "seven_day": { "...": "" }
  },
  "sessions": {
    "<session_id>": {
      "cwd": "...",
      "model": "Opus",
      "costUsd": 0.13,
      "inputTokens": 46185,
      "outputTokens": 26,
      "contextPct": 5,
      "updatedAt": 1792904033
    }
  }
}
```

Todo sale del JSON que Claude Code le pasa al script: `rate_limits`, `session_id`, `cwd`, `model.display_name`,
`cost.total_cost_usd` y `context_window` (`total_input_tokens`, `total_output_tokens`, `used_percentage`). Conviene
escribir a un archivo temporal y renombrarlo, guardar solo las sesiones de las últimas 24 h y conservar los
`rate_limits` anteriores cuando no vengan.

- Solo se actualiza mientras hay una sesión abierta.
- `rate_limits` solo aparece en planes **Pro/Max**, y después de la primera respuesta de la sesión. Un límite que
  ya pasó su reinicio no se muestra.
- El costo es el **estimado** de Claude Code a precio de lista, no la factura.
- El servidor lee la carpeta cada 30 s (`usageStatus`, solo páginas con la clave).

| Carpeta    | Qué hay                                                                               |
| ---------- | ------------------------------------------------------------------------------------- |
| `server/`  | `createUsageFeature`: lee `~/.pixel-agents/uso/*.json` y `/usage` (`usageCommand.ts`) |
| `webview/` | Barra, detalle, `usageStore` y el mueble `USAGE_METER` (`usageFurniture.ts`)          |
| `test/`    | Pruebas del servidor y de la página                                                   |
