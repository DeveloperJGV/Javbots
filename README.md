# Pixel Agents (fork)

Una oficina en pixel art donde cada sesión de **Claude Code** es un personaje que trabaja, piensa,
pide permiso y descansa según lo que está haciendo de verdad.

Es un fork de [Pixel Agents](https://github.com/pablodelucca/pixel-agents) de Pablo De Lucca.
La documentación original está en [docs/README-original.md](docs/README-original.md).

> 🚧 Proyecto en desarrollo. El nombre definitivo está por decidir.

## Qué cambia respecto al original

- **Estado "pensando":** cuando le escribes a un agente, se sienta en su escritorio con una nube de puntitos
  hasta que empieza a usar herramientas. El texto de tu mensaje **nunca** sale del script del hook:
  solo se avisa _que_ mandaste un mensaje.
- **Nombres completos:** las sesiones muestran el nombre real de su carpeta (`mi-proyecto`, no `proyecto`).
- **Becarios:** los sub-agentes se dibujan más chicos y su etiqueta dice de quién son.
- **Pruebas aisladas en Windows:** las pruebas ya no tocan la configuración real del usuario
  (`~/.claude` y `~/.pixel-agents`).

En camino: interfaz en español, sombras y luces, animaciones en reposo, y zonas de la oficina según lo
que hace cada agente.

## Requisitos

- Node.js 20 o más nuevo (recomendado 22+)
- Claude Code instalado

## Cómo correrlo

```bash
npm install
npm run compile
node dist/cli.js --port 3100
```

Abre la dirección que imprime (incluye un token; trátalo como contraseña). La primera vez, la página
pide permiso para agregar hooks a `~/.claude/settings.json`; antes de tocar el archivo, guarda un respaldo.

Para usar el comando `pixel-agents` desde cualquier terminal: `npm link`.

## Pruebas

```bash
npm test          # servidor + página (Vitest)
npm run e2e       # Playwright (navegador)
```

## Créditos y licencia

- Código original: © 2026 Pablo De Lucca, licencia [MIT](LICENSE). Este fork mantiene la misma licencia.
- Personajes propios (homenajes), hechos con [PixelLab](https://www.pixellab.ai) y retocados por código.
