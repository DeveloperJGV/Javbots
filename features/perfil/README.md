# Pantalla de perfil (feature opcional)

Una pantalla verde en la pared del cuarto de freelance (piso Personal) con el resultado de un test de personalidad:
el tipo arriba, una barra por rasgo y un cursor que parpadea. **Un clic** abre el panel con los rasgos y sus
porcentajes, el rol, la estrategia y los datos curiosos.

- **El resultado no está en el repositorio.** Se lee de `~/.pixel-agents/perfil.json` cada vez que se abre la página
  (cambias el archivo y basta con F5) y solo se manda a la página abierta con su llave. Sin archivo, o en una pestaña
  sin llave, la pantalla es una terminal vacía con el cursor.
- La pieza es `PERFIL_SCREEN` (2×2, de pared). Se arma con `python features/perfil/arte/armar.py` a partir del marco
  del póster del candado; el texto y las barras se pintan en vivo (`webview/perfilFurniture.ts`).

## `perfil.json`

```json
{
  "code": "ABCD-X",
  "name": "Nombre del tipo",
  "role": "Rol",
  "strategy": "Estrategia",
  "traits": [{ "letter": "A", "name": "Rasgo", "percent": 60 }],
  "facts": ["Un dato curioso"],
  "source": "Nombre del test",
  "date": "2026-01-31"
}
```

`code`, `name` y al menos un rasgo son obligatorios. En la pantalla caben 6 letras del código y 5 barras; el panel
muestra hasta 8 rasgos y 12 datos.

## Archivos

- `server/perfilFeature.ts`, `server/perfilData.ts` (lee y valida el archivo), `server/constants.ts`.
- `webview/perfilFurniture.ts` (la pantalla), `webview/PerfilPanel.tsx`, `webview/perfilStore.ts`,
  `webview/usePerfil.ts`, `webview/perfilText.ts`, `webview/constants.ts` (colores, letras 3×5, posiciones).
- Protocolo (`core/asyncapi.yaml`): `perfilStatus` (servidor → página).
- Pruebas: `test/server/perfil.test.ts`, `test/webview/perfil.test.ts`.
