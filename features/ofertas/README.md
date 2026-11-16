# Ofertas: buscador y vigía de precios

Escribes el nombre de un producto, la oficina lo busca en varias tiendas de México al momento y, si quieres, se
queda vigilándolo: revisa sola cada cierto tiempo, guarda el historial de precios y te avisa cuando llega a tu
precio, cuando baja de golpe o cuando es el más barato que ha visto.

Es una función normal de la oficina: reglas y código, sin servicios de pago.

## Qué hace

- **Buscar:** un producto → resultados de todas las fuentes, sin accesorios colados (fundas, refacciones,
  "compatible con…"), con el mismo producto agrupado entre tiendas y el más barato primero.
- **Vigilar:** guarda la búsqueda con precio objetivo opcional, palabras que debe traer y palabras que descartan.
- **Historial propio:** cada revisión guarda el mejor precio. Con eso dice "bajó 18 % desde ayer" o "el más bajo
  que ha visto la oficina", y desconfía del precio "antes" de la tienda: si la tienda dice "antes $2,999" y la
  oficina nunca lo vio arriba de $1,899, lo dice.
- **Avisos:** al llegar al objetivo, al bajar más de cierto porcentaje, al marcar un mínimo y cuando la comunidad
  publica una oferta nueva del producto. Sale una notificación de escritorio, queda en la pestaña Avisos y el
  quiosco de la oficina se prende.
- **Respeta a las tiendas:** una petición por tienda en cada revisión, cada 45 minutos más o menos (con variación),
  y más espaciado en las fuentes frágiles. Si una tienda falla, espera cada vez más; si bloquea, se pausa horas y no
  insiste. Nunca intenta saltarse un bloqueo.

## Grupos

Cada vigilancia puede ir en un **grupo** ("Bocinas", "Receptor", "Red"…). En "Vigilando" salen agrupadas: cada
grupo con su encabezado, cuántas tiene y **lo mejor del grupo** (la más barata con veredicto "Buen precio"), plegable
(lo plegado se recuerda en ese navegador), con **↑ ↓** para ordenar los grupos a mano (el orden se guarda en
`ajustes.groupOrder`; los que no tienen lugar van después, en orden alfabético) y "Sin grupo" al final.

El grupo se escoge al crear la vigilancia (los que ya existen, uno nuevo escrito a mano o "Sin grupo") y se cambia
después con **Cambiar grupo**. A una vigilancia sin grupo el panel le **sugiere** uno por las palabras del título que
da la tienda (bocina/altavoz/parlante → Bocinas; subwoofer → Subwoofer; receptor/amplificador → Receptor;
router/mesh/wifi → Red; audífonos; televisión; consola…; la tabla está en `webview/constants.ts`,
`GROUP_SUGGESTIONS`). Es solo una sugerencia: se acepta con un clic ("Sí, ponla ahí"), nunca se pone sola. Los avisos
empiezan con el grupo: "Bocinas · Marca B20: bajó 10 %…".

## Dónde buscó

Cada revisión guarda, por tienda, qué pasó y a qué hora (`stores` en cada búsqueda de `ofertas.json`):

| Marca | Qué quiere decir                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------- |
| ✓     | Lo tiene (con el precio más bajo que pasó el filtro)                                                    |
| –     | Contestó, pero ningún resultado pasó el filtro: cuántos dio y el primero, para ver por qué no coincidió |
| ✗     | No contestó o bloqueó la consulta                                                                       |
| !     | Falta la llave (Ajustes dice los pasos)                                                                 |
| ○     | Apagada en Ajustes                                                                                      |
| ↗     | La oficina no la lee: su búsqueda va lista para abrirla tú                                              |

Al pasar el ratón sale la frase completa; **Ver detalle** despliega todas, cada una con **Ábrela tú** (la búsqueda en
esa tienda). Una vigilancia sin precio ya no dice solo "Ninguna tienda lo tiene": dice "Amazon contestó 20 resultados,
ninguno coincide con «…»" y ofrece buscar con menos palabras. Si una tienda solo se pregunta cada varias horas, la
fila usa su última respuesta y lo dice ("respuesta de antes, a las 14:05"). Las búsquedas guardadas antes de esto
cargan igual; la fila sale desde su siguiente revisión.

## ¿Es oferta de verdad?

Cada producto (en una búsqueda y en "Vigilando") lleva una etiqueta y una línea con el porqué:
**Buen precio**, **Precio normal**, **Caro** o **Todavía no sé**. Son reglas (`server/vigia/verdict.ts`, umbrales en
`server/vigia/constants.ts`, sección _Verdict_); cada fuente de datos vota y gana la mayoría:

- **Lo que vio la oficina:** promedio (por día) y mínimo de 30 y 90 días. "El más bajo en 34 días, 12 % abajo de su
  promedio de 30 días". Con menos de 3 días o 3 revisiones no decide y lo dice: "llevo 2 días viéndolo".
- **Las demás tiendas ahora:** con 3 tiendas o más, contra la mediana: "el más barato de 5 tiendas, 18 % abajo del
  precio típico entre tiendas".
- **Lo que viste tú:** en una búsqueda vigilada, "Lo he visto en $… el …" (Más opciones o Editar). Entra como un dato
  más: "5 % abajo de los $1,250 que viste el 9 nov".
- **El «antes» de la tienda no se cree:** si subió el precio en la última semana y hoy dice rebaja, o si su «antes»
  nunca lo vio la oficina, la línea termina con "ojo: …".
- **Tienda contra revendedor:** cada revisión guarda aparte el precio más barato que vende una tienda misma
  (`storePrice`); una opción de la tienda se juzga solo con eso, así que la baja de un revendedor no cuenta.

**"La mejor":** una sola opción por producto, la más barata que vende la tienda misma (no un revendedor). En un empate
gana la que dice envío gratis; si nada las distingue, la línea lo dice. Si solo hay revendedores, la más barata y se
avisa. No se sabe el costo del envío de ninguna tienda (solo si dice "envío gratis").

**Lo vende la tienda / Revendedor:** "Lo vende la tienda" = la tienda misma o la tienda oficial de la marca dentro de
ella; "Revendedor" = un vendedor externo de su mercado (Amazon, Walmart, Elektra, Mercado Libre).

**Mínimo y máximo:** en "Vigilando", junto a la gráfica: "mínimo $X (12 nov) · máximo $Y (3 nov) · N días".

**MSI:** "MSI: hasta N meses · ver condiciones" solo donde la fuente lo dice para ese producto: Amazon (texto de la
tarjeta), Elektra (`Installments` de VTEX con interés 0, comprobado con una respuesta real), Promodescuentos (del
título, con banco solo si lo nombra) y Mercado Libre (`installments` con `rate` 0, según su documentación; sin
comprobar porque falta la llave). Nunca se dice banco ni monto mínimo si el dato no lo trae.

**Ligas, sin consultar esos servicios:** "Ver historial en Keepa" en lo de Amazon y "Comparador de Profeco" (el del
Buen Fin hasta el 17 de noviembre de 2026; después Quién es Quién en los Precios).

## Asistente (opcional)

Un extra para cuando las reglas no bastan: si en la computadora está instalado **Claude Code**, cada producto (en una
búsqueda y en "Vigilando") trae dos botones más:

- **Investigar precio (asistente):** un modelo chico (Haiku de fábrica) busca en internet, como lo haría una
  persona, el precio normal del producto en tiendas de México y sitios de ofertas. Regresa el precio típico, el
  mínimo y el máximo que encontró (si los hay), una nota, qué tanta confianza le tiene y las ligas de donde lo sacó.
  Si trae precio típico o mínimo, **entra al veredicto como un dato más**, marcado "(asistente)" y con medio voto:
  pesa menos que lo que vio la oficina.
- **Buscar similares (asistente):** de 3 a 6 productos parecidos, "su compa" (el que queda casi igual) primero. Cada
  uno trae **Buscar en tiendas** (lo busca en las tiendas de la oficina) y **Vigilar**.

Tarda de 40 s a 1 min ("Buscando a mano…" con el tiempo y **Cancelar**); una consulta a la vez. En una búsqueda
vigilada la respuesta se guarda en `ofertas.json` con su fecha (hasta 30 días) para verla otra vez sin gastar otra
consulta; en una búsqueda en vivo dura mientras la búsqueda esté en pantalla.

**Es opcional:** sin Claude Code los botones no aparecen y todo lo demás funciona igual. **Se apaga** en Ajustes de
Ofertas (casilla "Asistente (usa Claude Code de esta máquina)"), donde también se escoge el modelo (Haiku o Sonnet).

**Nunca cobra por uso:** usa la sesión de suscripción de Claude Code. Antes de cada consulta se quita del entorno
cualquier llave de pago (`ANTHROPIC_API_KEY` y demás `ANTHROPIC_*`, Bedrock/Vertex) y se pregunta a
`claude auth status` cómo está iniciada la sesión; si no es una suscripción, no se lanza y el panel lo dice. Solo
conexiones con el token de la oficina pueden pedirlo. Lo que hace el modelo (solo búsqueda y lectura de páginas web,
sin archivos ni comandos) y cómo se valida su respuesta está en `server/asistente/README.md`.

## Fuentes

Probadas con llamadas reales el 2026-11-12 y otra vez el 2026-11-16 (pocas consultas, espaciadas). Ninguna tienda
ofrece una API pública pensada para esto; las que contestan JSON lo hacen porque su propia página lo usa. Todas son de
solo lectura, sin cuenta y sin datos de la persona.

**`robots.txt`:** se leyó a mano el 16 nov 2026 (la regla `User-agent: *` contra la URL exacta que usa cada fuente)
en Amazon, Costco, Office Depot, El Palacio de Hierro, Walmart, Promodescuentos, Cyberpuerta, Sam's Club y Liverpool.
Si no permite leer su búsqueda con programas, la fuente se queda "solo con liga" (`ROBOTS_LINK_ONLY` en `sources/index.ts`): nunca se
consulta, no se puede prender, y el panel da su búsqueda para abrirla a mano. **No se pudo leer** el de Elektra ni
el de Coppel (contestan HTTP 403 hasta a esa página). Mercado Libre se lee por su API oficial con llave, no por su
página. El programa **no** lee el `robots.txt` por su cuenta: si una tienda lo cambia, hay que revisarlo otra vez.
Office Depot pide 5 s entre páginas; no se comprobó que el vigía siempre deje ese tiempo.

| Fuente               | Cómo se lee                                    | Llave  | Estado (16 nov 2026)                                                                                                                                                                     |
| -------------------- | ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amazon México        | Página de resultados                           | No     | Contesta. Su `robots.txt` no prohíbe `/s?`, pero sus condiciones no permiten lectura automática: **apagada de fábrica**, la prende el dueño en Ajustes; se consulta cada 6 h como máximo |
| Costco               | JSON del buscador de la tienda                 | No     | Contesta (no vende mucho audio ni redes: casi nunca coincide)                                                                                                                            |
| Office Depot         | Datos estructurados de la página de resultados | No     | Contesta; con cero resultados su página no trae la lista y sale como "no contestó" (sin comprobar a fondo)                                                                               |
| Elektra              | JSON del catálogo de la tienda (VTEX)          | No     | **Bloquea** (HTTP 403, muro Incapsula; hasta su `robots.txt`)                                                                                                                            |
| El Palacio de Hierro | Datos estructurados de la página de resultados | No     | **Bloquea** (HTTP 403)                                                                                                                                                                   |
| Mercado Libre        | API oficial                                    | **Sí** | Falta la llave (Ajustes dice los pasos); la página web manda a "tráfico sospechoso" y no se lee                                                                                          |
| Walmart              | —                                              | —      | **Solo con liga**: su `robots.txt` dice `Disallow: /search*`                                                                                                                             |
| Promodescuentos      | —                                              | —      | **Solo con liga**: su `robots.txt` dice `Disallow: /search`                                                                                                                              |
| Cyberpuerta          | —                                              | —      | **Solo con liga**: su `robots.txt` dice `Disallow: /index.php?cl=search`                                                                                                                 |

"Frágil" quiere decir que se lee la página que ve cualquier persona: el día que la tienda cambie su página o ponga
un captcha, esa fuente deja de contestar y el panel lo dice ("Walmart bloqueó la consulta; lo demás sí"). Las demás
siguen funcionando.

**Solo con liga** (el panel pone el enlace a la búsqueda para abrirla con un clic): Liverpool, Coppel, Sam's Club,
Sears, DDTech, RadioShack y Mercado Libre. Coppel bloquea hasta su `robots.txt` (HTTP 403), Sam's dice
`Disallow: /search*`, RadioShack no contestó, y Sears y DDTech no entregan resultados legibles sin ejecutar su página.
Liverpool sí permite todo en su `robots.txt` (`Allow: /`), pero no se comprobó si su página de búsqueda se puede leer
sin ejecutarla: queda con liga hasta comprobarlo.

**Filtro:** una palabra de la búsqueda vale si el título la trae entera, partida o con guion ("TP-Link", "TP Link",
"TPLink"), y al revés. Eso solo para lo que _debe_ estar; las palabras que descartan nunca juntan pedazos del título.
"Compatible con" ya no descarta por sí sola (un producto real dice "Compatible con Dolby Atmos" después de su nombre);
un accesorio lo dice antes del producto ("Cable compatible con …"), o vuelve a nombrar lo buscado después ("Cargador
iPhone 15 compatible con iPhone 15 Pro"), y ese sí se descarta.

### Llave de Mercado Libre (opcional)

1. Entra a <https://developers.mercadolibre.com.mx/devcenter> con una cuenta de Mercado Libre y crea una aplicación
   (cualquier nombre; URL de redirección `https://localhost`).
2. Copia el _App ID_ y el _Secret key_ a `~/.pixel-agents/ofertas.json`:

   ```json
   { "llaves": { "mercadolibre": { "clientId": "…", "clientSecret": "…" } } }
   ```

3. La fuente toma la llave en la siguiente búsqueda, sin reiniciar. Si Mercado Libre rechaza la búsqueda aun con
   llave (desde 2025 restringe ese servicio a ciertas aplicaciones), el panel lo dice y queda la liga.

## Dónde vive cada cosa

```
features/ofertas/
  server/vigia/        El núcleo ("vigía"): Node puro, no sabe nada de la oficina
    types.ts           El contrato: Offer, Source, Watch, Alert, Notifier, Vigia
    sources/           Una fuente por archivo; cada una falla sola
    relevance.ts       Qué resultado sí es el producto
    grouping.ts        El mismo producto entre tiendas
    rules.ts           Tendencia, "antes" inflado y cuándo avisar
    storage.ts         ~/.pixel-agents/ofertas.json
    notifiers.ts       Avisadores (consola, ntfy; aquí se enchufa Firebase)
    vigia.ts           Búsqueda en vivo, revisiones programadas, esperas
    consola.ts         El mismo vigía como programa de consola
  server/asistente/    El asistente opcional (Claude Code local): corre la consulta y valida la respuesta
  server/ofertasFeature.ts   La oficina: mensajes del panel, aviso de escritorio, rack de Conexiones
  server/ofertasAsistente.ts El asistente en el panel: quién puede pedirlo, una a la vez, dónde se guarda
  webview/             El panel y el mueble
  arte/                El quiosco (dibujado por código) y el script que lo pone en un plano
  scripts/build-vigia.mjs    Empaqueta el vigía de consola en un solo archivo
  test/                Pruebas sin red, con respuestas reales recortadas (test/muestras)
```

Los datos de la persona viven en `~/.pixel-agents/ofertas.json`: búsquedas (con la última respuesta del asistente),
historial, avisos, ajustes, llaves y los ajustes del asistente (`asistente`).

## Avisos al celular

El vigía manda cada aviso a una lista de **avisadores** (`Notifier` en `types.ts`). Hoy hay tres: la notificación de
escritorio (la pone la oficina), la consola y ntfy (opcional, apagado). Agregar otro es escribir un objeto con
`notify(aviso, búsqueda)` y pasarlo en la lista; el vigía no cambia.

| Opción             | Qué se necesita                                                                                                                                               | A favor                                                   | En contra                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Firebase (FCM)** | Proyecto de Firebase; una app Android o una página instalada (PWA) que reciba el aviso y registre su token; llave de servicio (JSON) en la máquina que vigila | Avisos nativos, gratis, se integra con otras apps propias | Lo más laborioso: hay que hacer y mantener la app o página que recibe                                                        |
| **ntfy**           | Instalar la app ntfy en el celular y suscribirse a un tema con nombre difícil de adivinar                                                                     | Listo en cinco minutos, sin cuenta ni llave, gratis       | El tema es público si alguien adivina el nombre (se puede usar un servidor ntfy propio); el texto del aviso pasa por ntfy.sh |
| **Telegram**       | Crear un bot con BotFather y guardar su token y el id del chat                                                                                                | Gratis, confiable, historial en el chat                   | Depende de una cuenta de Telegram; el token es un secreto más                                                                |

Para prender ntfy en el vigía de consola, en `ofertas.json`:

```json
{ "avisadores": { "ntfy": { "tema": "un-nombre-largo-y-dificil" } } }
```

## Qué se necesita para que busque todo el día

La oficina solo vigila mientras está abierta. Para que vigile siempre, el mismo núcleo corre como programa de
consola en cualquier máquina que se quede prendida (una mini computadora o un teléfono viejo con Linux):

1. **Node 18 o más nuevo** en esa máquina. Nada más: el vigía no tiene dependencias.
2. Empaquetarlo aquí y copiar un solo archivo:

   ```bash
   node features/ofertas/scripts/build-vigia.mjs      # escribe dist/ofertas-vigia.cjs
   scp dist/ofertas-vigia.cjs <máquina>:ofertas/
   ```

3. Copiar también `~/.pixel-agents/ofertas.json` (las búsquedas) a la carpeta `.pixel-agents` de esa máquina.
4. Dejarlo corriendo: `node ofertas-vigia.cjs` (con `tmux`, `nohup` o un servicio). Opciones:
   `--una-vez` hace una ronda y sale (sirve para cron), `--buscar "texto"` busca al momento,
   `--home <carpeta>` usa otra carpeta de datos, `--help` (o `-h`, o `/?`, en cualquier lugar de la línea) imprime la
   ayuda y sale **sin leer ni escribir** `ofertas.json`. Una opción que no conoce, o `--home` / `--buscar` sin valor
   (o con un valor que empieza con `-`), imprime la ayuda y sale con código 2, también sin tocar nada. Ojo: solo
   `--help` y `--buscar` no escriben. `--una-vez` y la vigilancia sin opciones guardan precios en `ofertas.json` y
   mandan avisos; `--buscar` sí lee el archivo y, si está dañado, lo aparta como `ofertas.json.roto`. Para probar,
   usa `--home` con una carpeta de prueba.
5. **Cómo llegan los avisos al celular:** esa máquina no tiene escritorio, así que necesita un avisador de la tabla
   de arriba. El más rápido es ntfy; Firebase queda para después.

Pendiente: hoy la oficina y el vigía de consola no se sincronizan entre sí; cada uno lee su propio `ofertas.json`.
Si corren los dos, lo que se agregue en el panel hay que copiarlo a la otra máquina.

## El mueble

El quiosco de ofertas (`OFERTAS_KIOSK`, 1×2 losetas) se dibuja por código con
`python features/ofertas/arte/armar.py`. Un clic lo abre y se prende (`OFERTAS_KIOSK_ON`) mientras haya avisos sin
ver. También se abre sin mueble, con `#ofertas` al final de la dirección de la oficina.

Para ponerlo en un plano: `node features/ofertas/arte/poner.cjs [plano.json] [--piso <id>] [--en <col>,<fila>]`.
Sin argumentos busca el piso Personal de la carpeta de datos y lo pone en el cuarto Cerebro, entre la impresora y la
caja fuerte. No lo duplica si ya está, y se niega a tocar la carpeta real de la persona si no se le pasa `--real`.

## Pruebas

```bash
npm run test:server -- ofertas     # fuentes (con muestras), relevancia, agrupado, reglas, reloj del vigía, feature
npm run test:webview               # textos del panel, store y mueble
```
