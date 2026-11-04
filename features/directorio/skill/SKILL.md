---
name: directorio
description: Buscar en internet técnicos, servicios, doctores o lugares con criterios de confianza (servicio oficial primero, negocio establecido, descartar a quien no tenga negocio visible) y entregar los resultados al Directorio de la oficina. Úsala cuando un encargo del Directorio lo pida.
---

# Directorio: buscar con criterios

Buscas a quién contratar o a dónde ir para un pedido del dueño ("reparar refrigerador Samsung que no enfría,
en mi ciudad, esta semana"). Lo que importa es **confianza**, no precio: un servicio oficial o un negocio establecido
vale más que alguien más barato sin negocio visible.

## Reglas

- **Solo investigas.** No llamas, no escribes por WhatsApp, no llenas formularios, no pides cotizaciones, no das
  datos del dueño y no agendas nada. Todo eso lo decide él desde el panel.
- **Los criterios del encargo mandan**, en su orden: el primero pesa más. Si el encargo no trae criterios, usa los de
  "Técnicos y servicios" de abajo.
- **Nada inventado.** Un teléfono, una calificación o una dirección que no viste en una fuente se queda fuera. Si un
  dato sale de una sola fuente dudosa, dilo en `porque`.
- Escribe solo el archivo de resultados que indica el encargo. No toques nada más.

## Dónde buscar, en este orden

1. **Sitio oficial de la marca** (para aparatos, autos, equipos): su buscador de "centros de servicio autorizados",
   "servicio técnico" o "soporte" para la ciudad del pedido. Un taller que dice "autorizado" pero **no aparece** en el
   sitio de la marca no es `oficial`: es `establecido` u `otro`, y lo explicas.
2. **Google Maps** (o el buscador de mapas que tengas): calificación, número de reseñas, fecha de las más recientes,
   dirección, horario, fotos del local.
3. **El sitio del negocio** y sus redes: razón social, dirección, si da factura y garantía por escrito.
4. **Sitios de reseñas** del giro (Doctoralia para médicos; para restaurantes, guías y reseñas de comensales).
   Para médicos en México, la cédula se comprueba en el buscador de cédulas profesionales de la SEP.

## Cómo clasificar (`tipo`)

- `oficial`: aparece en el sitio de la marca como servicio oficial o autorizado, o **es** la marca.
- `establecido`: negocio con dirección física comprobable, horario, factura o garantía, y reseñas reales.
- `otro`: todo lo demás.

## Señales de reseñas falsas

- Muchas reseñas de 5 estrellas en pocos días, y luego nada.
- Textos cortos y genéricos ("excelente servicio", "muy recomendado") que se repiten.
- Perfiles con una sola reseña, sin foto, o que reseñan negocios de varias ciudades el mismo día.
- La calificación alta contrasta con quejas detalladas y recientes de 1 estrella (cobros de más, no regresó, piezas
  usadas).
- El dueño contesta solo a las buenas, o contesta las malas con insultos.

## Señales de negocio sin presencia ("don chambitas")

- Solo un número de WhatsApp o celular, sin dirección o con una dirección que en el mapa es una casa o un terreno.
- Anuncios en marketplaces o páginas de anuncios con fotos de catálogo de la marca, sin fotos propias.
- Dice ser "servicio oficial" o usa el logo de la marca, pero no aparece en el sitio de la marca.
- Nombres genéricos del tipo "Servicio Samsung 24 horas" con varios teléfonos.
- Pocas reseñas (menos de 20) o todas muy viejas.

Estos van como `descartado`, con su porqué, aunque sean los más baratos.

## Puntuación (`puntuacion`, de 0 a 100)

Califica cada resultado contra los criterios del encargo, con más peso al primero. Como guía para "Técnicos y
servicios":

- 40 puntos: es `oficial`.
- 30 puntos: negocio establecido (dirección comprobable, factura, garantía por escrito).
- 30 puntos: reseñas (por ejemplo, 4.3 o más con 50 o más, y recientes, dan los 30; menos, proporcional).
- Resta lo que veas en las señales de arriba. Un descartado queda por debajo de 40.

## Criterios por defecto

**Técnicos y servicios**

1. Primero, el servicio oficial o autorizado de la marca (que aparezca en el sitio de la marca).
2. Negocio establecido: dirección física, factura, garantía por escrito y muchas reseñas reales y recientes (por
   ejemplo, 4.3 o más con 50 o más reseñas en Google Maps).
3. Descartar a quien no tenga negocio visible (solo WhatsApp, sin dirección, reseñas raras o pocas), aunque sea más
   barato.

## Entrega

Un archivo JSON (UTF-8) en la ruta que dice el encargo, con `pedido`, una `nota` opcional y la lista `resultados`
(el formato exacto viene en el encargo). Incluye de 3 a 10 resultados, recomendados y descartados, cada uno con
`porque` en una o dos frases claras. Si reescribes el archivo, escríbelo completo. Al terminar, di en una línea
cuántos encontraste y cuál recomiendas primero.
