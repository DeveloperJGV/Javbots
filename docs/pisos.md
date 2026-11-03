# Edificios, pisos y elevador

Javbots puede tener varias **oficinas** y cada oficina puede tener varios **pisos**.

- **Edificio** = una oficina (`core/src/offices.ts`, `OfficeDef`). La principal es `principal`. Las demás llegan con
  los paquetes privados (`privado/<paquete>/pack.json`).
- **Piso** = un plano propio dentro de un edificio. Cada edificio tiene su **Planta baja** (`pb`): es el plano de
  siempre.
- **Elevador** = el panel de la izquierda (`webview-ui/src/components/Elevator.tsx`):
  - arriba, los edificios;
  - abajo, los botones de piso (S, PB, 1, 2…) con su nombre;
  - el piso actual se ve prendido.

  Con un solo edificio y un solo piso, el elevador se esconde y todo se ve igual que antes.

## Reglas

- **Los agentes viven en la Planta baja.** Sus escritorios y asientos solo existen ahí. Los demás pisos son cuartos
  sin personajes de Claude Code. El personal de un paquete es un mueble, así que sale en cualquier piso donde esté
  puesto.
- Una página pide un piso con `?piso=<id>`, igual que pide una oficina con `?oficina=<id>`. El navegador recuerda el
  último piso de cada edificio. Si el piso no existe, la página cae en la Planta baja.
- El editor de planos guarda el piso que estás viendo.
- Archivos en `~/.pixel-agents/`:

  | Edificio     | Planta baja             | Otro piso                      |
  | ------------ | ----------------------- | ------------------------------ |
  | principal    | `layout.json`           | `layout~<piso>.json`           |
  | otra oficina | `layout-<oficina>.json` | `layout-<oficina>~<piso>.json` |

  Mientras nadie guarde un piso desde el editor, se usa el plano por defecto que trae quien lo declaró.

## Cómo se declara un piso

Cada piso lleva estos campos:

| Campo           | Qué es                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | Minúsculas, números y guiones. No puede ser `pb`.                                                                                        |
| `level`         | Entero distinto de 0: 1, 2… hacia arriba; -1, -2… hacia abajo (botones S, S2…). Ordena el elevador y no se repite dentro de un edificio. |
| `button`        | Opcional, hasta 3 caracteres. Si falta, sale del nivel.                                                                                  |
| `label`         | El nombre que se ve en el elevador.                                                                                                      |
| `defaultLayout` | El plano con el que arranca el piso. Si no hay, sale un cuarto vacío.                                                                    |

### Desde una función (`features/<nombre>/`)

`ServerFeature.floors()` (`server/src/serverFeature.ts`) regresa la lista de pisos:

```ts
floors: () => [
  {
    id: 'agenda',
    level: 1,
    label: 'Agenda',
    office: 'principal',     // opcional: si falta, el edificio principal
    defaultLayout: planoJson, // objeto OfficeLayout, o null
  },
],
```

Los planos de una función van en `features/<nombre>/planos/`. Al compilar se copian a `dist/<nombre>/planos/`, y
`readLayoutFile` (`server/src/packLoader.ts`) los lee.

### Desde un paquete (`privado/<paquete>/pack.json`)

Los pisos van dentro de `mainOffice`, para agregarlos al edificio principal, o dentro de cada oficina del paquete:

```json
{
  "offices": [
    {
      "id": "mi-oficina",
      "label": "Mi oficina",
      "floors": [
        { "id": "taller", "level": 1, "label": "Taller", "defaultLayout": "planos/taller.json" }
      ]
    }
  ]
}
```

`defaultLayout` es una ruta dentro de la carpeta del paquete.

Los pisos se leen una sola vez, al arrancar el servidor. Un piso que choca con otro, o que apunta a un edificio que no
existe, se ignora y se avisa en el log.

En la página, una función sabe dónde está con `officesStore.get()` (`webview-ui/src/offices.ts`): `.current` es el
edificio y `.floor` es el piso.

## Pisos de hoy

- **Edificio principal:**
  - **PB · Planta baja**: la oficina de siempre.
  - **1 · Agenda** (`features/agenda`): el panel "Hoy y esta semana", con el calendario compartido y las tareas de
    Google.
