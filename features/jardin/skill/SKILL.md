---
name: jardin
description: Registrar plantas del jardín de la azotea o cuidados hechos (regar, abonar, limpiar, podar) desde una sesión de Claude Code en la compu, por ejemplo cuando el usuario pasa una foto de una planta. Úsala siempre que hable de sus plantas, del riego o del inventario del jardín.
---

# Jardín: registrar plantas y cuidados

El jardín vive en la oficina (Javbots), en `~/.pixel-agents/jardin.json`. **No edites ese archivo.** Para
registrar algo, deja una nota o una foto en la carpeta de entrada de la compu:

```
~/.pixel-agents/jardin/entrada/
```

La oficina la lee en unos minutos (o al darle "Sincronizar ahora" en el panel del jardín), aplica lo claro y deja lo
demás en la bandeja **Del celular** del panel, para que el usuario lo acomode. Después mueve el archivo a
`entrada/leidos/`.

## Reglas

1. **Pregunta antes de escribir.** Enséñale la nota exacta que vas a dejar y espera un "sí".
2. **Usa el nombre de la planta tal como está en el jardín.** Si no lo sabes, pregúntale (o pídele que abra el panel
   del jardín: piso **AZ** del elevador → pantalla de control).
3. Las plantas nuevas **no se crean solas**: la oficina las deja en la bandeja y el usuario las revisa antes de que
   se agenden avisos en Google. Dile eso.
4. **No crees calendarios, listas ni eventos por tu cuenta.** Los avisos (calendario "Plantas" y la lista de tareas
   "Jardín") los maneja la oficina.

## Formato de las notas

Un archivo de texto, `AAAA-MM-DD nota.txt`, con una cosa por renglón:

| Qué                        | Cómo se escribe                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Cuidado hecho hoy          | `ya regué la monstera` · `aboné el limonero` · `limpié la orquídea` · `podé la lavanda`                               |
| Cuidado hecho ayer         | `ayer regué la monstera`                                                                                              |
| Varias plantas, un cuidado | `regué la monstera y la lavanda`                                                                                      |
| Planta nueva               | `nueva planta: lavanda (Lavandula angustifolia), en la maceta azul; regar cada 3 días a las 7:30; podar cada 60 días` |

Un renglón con duda o plan ("¿ya toca?", "mañana riego", "no regué") no cuenta como hecho: va a la bandeja.

## Fotos

Copia la foto a la carpeta de entrada con el nombre de la planta en el nombre del archivo:
`monstera 2026-11-03.jpg` (una planta por foto; jpg, png, webp o heic). La oficina la liga a esa planta. Si el
usuario te pasa la foto de una planta nueva, deja la foto y una nota `nueva planta: …` con lo que te diga.

## Ejemplo

El usuario: "ya regué la monstera, y te paso esta foto de la lavanda".

1. Propón: nota `2026-11-03 nota.txt` con `ya regué la monstera`, y la foto como `lavanda 2026-11-03.jpg`.
2. Con su "sí", escribe los dos archivos en `~/.pixel-agents/jardin/entrada/`.
3. Dile que en el panel del jardín se verá en unos minutos ("Sincronizar ahora" lo hace de inmediato).
