# Prompts de imágenes de tarjetas — NB Barber (para GPT / generador de imágenes)

> Reemplazar cada archivo en su **ruta exacta** de `public/` para que el código no cambie. Manifiesto completo de usos en `public/images/IMAGES_TODO.md`. Formato de salida: JPG para sucursales, lookbook y barberos; WEBP para productos. Mantener el nombre exacto que consume el código.

## Estilo global (pegar al inicio de CADA prompt)
`Fotografía realista de barbería premium (no ilustración, no 3D). Iluminación cálida y tenue tipo "ambiente de barbería", sombras suaves. Paleta: negro profundo + acentos dorado/ámbar #D4AF37 (reflejos metálicos, detalles). Estética masculina, elegante, lujo minimalista, composición limpia sin desorden. Sin texto, sin marcas de agua, sin logos de terceros.`

---

## 1. Tarjetas de sucursal — `public/images/branches/` · 800×600 (4:3)
Usadas en `/reservar` paso "Sucursal".

- **`sucursal-central.jpg`**: `[estilo global] Interior de una barbería premium urbana de noche: hilera de sillones de cuero negro frente a espejos con marco dorado, luz cálida de apliques, piso de madera oscura. Ambiente elegante y sofisticado del centro de la ciudad. Encuadre horizontal amplio.`
- **`sucursal-norte.jpg`**: `[estilo global] Interior de una barbería premium moderna dentro de un shopping: más luminosa y contemporánea pero manteniendo mobiliario negro y detalles dorados, plantas discretas, vidrio. Encuadre horizontal amplio.`
- **`sucursal-beach.jpg`**: `[estilo global] Interior de una barbería premium con toque costero relajado (rambla): madera clara combinada con negro y dorado, luz natural suave entrando por ventanales, atmósfera cálida junto al mar sin perder la elegancia. Encuadre horizontal amplio.`

## 2. Tarjetas de producto — `public/products/` · 1:1 (~1000×1000), fondo oscuro
Packshots para la tienda. `[estilo global] Packshot de producto de grooming sobre superficie de piedra/madera oscura, fondo negro degradado, un foco cálido lateral, reflejo dorado sutil en el envase. Producto centrado, nítido, premium.` + descripción por producto:

- **`beard-elixir.webp`**: frasco ámbar con gotero, aceite para barba de sándalo.
- **`classic-pomade.webp`**: lata/tarro metálico de pomada clásica con tapa dorada.
- **`matte-clay.webp`**: tarro de arcilla mate de acabado natural, envase oscuro.
- **`shampoo.webp`**: botella de shampoo de carbón, negra con etiqueta minimalista dorada.
- **`cooling-balm.webp`**: tarro bajo de bálsamo post-afeitado, fresco, envase claro con tapa oscura.
- **`shave-gel.webp`**: tubo/botella de gel de afeitar, translúcido.
- **`texture-powder.webp`**: envase pequeño de polvo texturizador para peinado.
- **`wooden-comb.webp`**: peine de madera artesanal sobre paño oscuro, detalle de veta.

## 3. Tarjetas de Lookbook — `public/lookbook/` · 4:5 vertical (~1000×1250)
Estilos reales para inspirar la reserva. `[estilo global] Retrato/detalle vertical, enfoque en el peinado o servicio, modelo masculino real, fondo de barbería desenfocado.` + por imagen:

- **`fade-cut.jpg`**: degradado (fade) alto y prolijo, cliente joven de perfil.
- **`scissor-cut.jpg`**: corte clásico a tijera, textura natural, peinado con raya.
- **`beard-trim.jpg`**: barba perfilada y definida, líneas limpias en el cuello y mejillas.
- **`hot-towel.jpg`**: afeitado tradicional con toalla caliente y navaja, ambiente spa.
- **`styling-pomade.jpg`**: peinado con pomada, brillo medio, estilo pompadour/retro.
- **`hair-wash.jpg`**: lavado de cabello en lavacabezas, momento de relax.
- **`clipper-detail.jpg`**: primerísimo plano de la máquina trabajando el contorno.
- **`barber-chair.jpg`**: sillón de barbero icónico vacío, luz cálida, invitación al ritual.

## 4. Retratos de barberos — `public/images/barbers/` · 1:1 (~600×600)
`[estilo global] Retrato profesional de un barbero masculino, encuadre del pecho hacia arriba, fondo oscuro liso, iluminación de estudio cálida, expresión confiada y amable, vestimenta oscura con detalle dorado sutil.` Un archivo por barbero (nombres actuales: `carlos.jpg, diego.jpg, facundo.jpg, lucas.jpg, martin.jpg, miguel.jpg` — variar edad/estilo/barba entre ellos para que se distingan).

## 5. Tarjetas de servicio (home) — reutilizan `public/images/hero/`
Si se quieren imágenes dedicadas por servicio (en vez de reutilizar hero), generar 1:1:
- **Corte Clásico**: `[estilo global] Cliente recibiendo un corte clásico a tijera, manos del barbero en acción.`
- **Corte + Barba**: `[estilo global] Barbero perfilando barba con navaja mientras el corte ya está terminado, combo premium.`
- **Diseño de Barba**: `[estilo global] Primer plano de perfilado de barba con detalle de líneas y navaja.`

## QA (revisar antes de subir)
- Aspect ratio correcto por sección (cards de sucursal 4:3, productos/barberos 1:1, lookbook 4:5).
- Sin texto ni logos. Dorado presente pero sutil (acento, no saturado). Peso < 400 KB por imagen (optimizar).
- Coherencia de paleta entre todas (mismo negro/dorado).
