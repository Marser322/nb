# Manifiesto de imágenes — NB Barber

Este documento lista las imágenes críticas de `public/images/`. Los placeholders duplicados ya fueron
reemplazados por assets generados con IA para demo. Para una sesión fotográfica real, sustituir cada
archivo en la MISMA ruta para que el código no requiera cambios.

Ver también `public/images/ASSET_PRODUCTION_BRIEF.md` para prompts, brief fotográfico y criterios QA.

## Estética global (aplicar a todas las imágenes salvo que se indique lo contrario)

- Fotografía realista de barbería premium (no ilustración, no 3D render).
- Iluminación cálida, tenue, tipo "ambiente de barbería" (spot lights, tonos cálidos, sombras suaves).
- Paleta dominante: negro profundo + dorado/ámbar `#D4AF37` como acento (reflejos, detalles, ropa, elementos metálicos).
- Estética masculina, elegante, "lujo minimalista" — sin desorden visual, composición limpia.
- Evitar marcas de agua, texto superpuesto o logos de terceros.
- Formato de salida: `.jpg` para hero, features, branches, lookbook y barberos; `.webp` para productos y módulos. Mantener la ruta exacta que consume el código.

## Tabla de imágenes a generar

| Ruta exacta | Dimensiones / aspect ratio | Dónde se usa | Descripción del contenido |
|---|---|---|---|
| `public/images/hero/ambiente-barberia.jpg` | 800×800 (1:1) | Home hero (imagen flotante "Atmosphere"), Home CTA final (fondo, ~2074px ancho), WhyChooseUs feature "Profesionales Expertos" (imagen principal), Reservar (fallback de preview de servicio) | Interior general de la barbería: sillones, espejos, ambiente cálido de salón premium. |
| `public/images/hero/herramientas-barberia.jpg` | 800×800 (1:1) | Home hero (imagen flotante "Tools"), WhyChooseUs feature "Reservas Online" (imagen secundaria), Reservar hero (imagen flotante "Scissor"), Admin login (fondo tenue de la pantalla de acceso) | Primer plano de herramientas de barbero: tijeras y peine sobre superficie oscura. |
| `public/images/hero/detalle-corte.jpg` | 800×800 (1:1) | Home hero (imagen flotante "Cut Detail"), WhyChooseUs feature "Profesionales Expertos" (imagen secundaria), Auth layout (panel izquierdo de login/registro) | Primer plano de un corte de cabello en proceso, manos del barbero trabajando. |
| `public/images/hero/estilo-moderno.jpg` | 800×800 (1:1) | Home hero (imagen flotante "Style"), Home before/after slider 2 ("after" del Classic Fade) | Retrato de cliente con corte moderno terminado, estilo prolijo y actual. |
| `public/images/hero/maquina-clippers.jpg` | 800×800 (1:1) | Home hero (imagen flotante "Machine"), Home servicio "Corte Clásico" (card), Home before/after slider 2 ("before" del Classic Fade), Reservar STATIC_BRANCHES fallback visual, Reservar hero (imagen flotante "Clippers") | Primer plano de máquina de cortar cabello (clippers) profesional, metal y detalles dorados. |
| `public/images/hero/detalle-barba.jpg` | 800×800 (1:1) | Home hero (imagen flotante "Beard") | Primer plano de perfilado/arreglo de barba con navaja o tijera. |
| `public/images/hero/tijera-detalle.jpg` | 800×800 (1:1) | Lookbook hero (imagen flotante "Scissor") | Detalle artístico de tijeras de barbero, alto contraste, grayscale-friendly. |
| `public/images/after-makeover.jpg` | 800×800 (1:1) | Home before/after slider 1 ("after" del Full Makeover, complementa a `before-makeover.jpg` ya existente) | Resultado final de un makeover completo (corte + barba + styling), mismo modelo/ángulo que `before-makeover.jpg` para que el slider sea coherente. |
| `public/images/features/reservas-online.jpg` | 800×800 (1:1) | WhyChooseUs feature "Reservas Online" (imagen principal) | Cliente o barbero usando un teléfono/tablet para agendar un turno, ambiente de barbería de fondo. |
| `public/images/features/productos-premium.jpg` | 800×800 (1:1) | WhyChooseUs feature "Productos Premium" (imagen principal) | Exhibición de productos de grooming premium (pomadas, aceites, cremas) en estante oscuro con luz cálida. |
| `public/images/features/producto-textura.jpg` | 500×500 (1:1) | WhyChooseUs feature "Productos Premium" (imagen secundaria), Lookbook hero (imagen flotante "Corte Style") | Primer plano de textura de producto de peinado (pomada/cera) o cabello texturizado con producto aplicado. |
| `public/images/branches/sucursal-central.jpg` | 800×600 (4:3) | Reservar, paso "Sucursal" — card "New Brothers Central" | Fachada o interior de la sucursal Central: ambiente urbano, elegante. |
| `public/images/branches/sucursal-norte.jpg` | 800×600 (4:3) | Reservar, paso "Sucursal" — card "New Brothers Norte" | Interior de la sucursal Norte (shopping): moderno, luminoso pero manteniendo paleta oscura/dorada en el mobiliario. |
| `public/images/branches/sucursal-beach.jpg` | 800×600 (4:3) | Reservar, paso "Sucursal" — card "New Brothers Beach" | Interior de la sucursal Beach (rambla costanera): toque relajado/costero sin perder la estética premium. |

## Assets adicionales

| Ruta exacta | Dimensiones | Dónde se usa | Descripción del contenido |
|---|---|---|---|
| `src/app/opengraph-image.tsx` | 1200×630 | Metadata Open Graph / Twitter Card (compartir en redes) | Imagen de marca: logo NB Barber sobre fondo negro con acentos dorados y el tagline "Estética Masculina". |
| `public/images/barbers/<nombre-barbero>.jpg` | ~600×600 (1:1) | Sección de barberos (perfiles, panel admin, "Elegí tu barbero" en Reservar) | Retrato profesional de cada barbero, fondo oscuro liso, iluminación de estudio cálida, encuadre desde el pecho hacia arriba. Un archivo por barbero (nombrar según el barbero real, ej. `carlos-martinez.jpg`). |
