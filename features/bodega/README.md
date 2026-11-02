# Bodega (feature opcional)

Un estante en la oficina (`STORAGE_SHELF`) que guarda **todo lo que existe y no está puesto**. Un clic en el
estante abre un panel con miniaturas por categoría (Escritorios, Sillas, Pared…) y una pestaña **DLC** con los
personajes que están en pausa.

- **Sacar:** escoge un mueble y dale "Sacar". Se abre el editor con ese mueble listo para colocarlo.
- **Guardar:** borra un mueble en el editor y aparece solo en la bodega. No hay lista aparte: la bodega se calcula
  comparando el catálogo con lo que hay en la oficina, así que nunca se desincroniza.
- Las rotaciones y los estados prendido/apagado de un mueble cuentan como el mismo mueble.
- Sin el estante en la oficina, no hay forma de abrir el panel; lo demás funciona igual.

## Archivos

- `webview/storedItems.ts`: qué está guardado (función pura, con pruebas en `test/webview/`).
- `webview/BodegaPanel.tsx`: el panel.
- `webview/bodegaStore.ts`: abrir, cerrar y "sacar" (App escucha y abre el editor).
- `webview/constants.ts`: tipos del estante y la lista de personajes DLC (`assets/dlc-*.png`, primer cuadro de cada
  hoja).
