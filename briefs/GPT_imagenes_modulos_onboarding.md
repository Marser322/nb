# Prompts de imágenes — módulos + onboarding premium (para GPT)

> Objetivo: profesionalizar los módulos con imágenes coherentes con los textos y darle al onboarding un aire premium. Salida **WebP < 300 KB**, guardar en la ruta exacta. Estas imágenes las consume la FASE 14 (Gemini).

## Estilo global (pegar al inicio de CADA prompt)
`Fotografía/render realista premium de barbería, iluminación cálida y tenue, paleta negro profundo + dorado/ámbar #D4AF37 como acento, estética masculina de lujo minimalista, composición limpia, sin texto ni logos ni marcas de agua. Coherente entre todas las imágenes.`

## 1. Onboarding — héroes de bienvenida (16:9, ~1600×900)
Se muestran en el modal de bienvenida de primera visita.
- **`public/images/onboarding/welcome-cliente.webp`**: `[estilo global] Cliente satisfecho mirándose al espejo tras un corte impecable en una barbería premium, barbero de fondo desenfocado, sensación aspiracional y cálida. Espacio negativo a un lado para superponer texto.`
- **`public/images/onboarding/welcome-admin.webp`**: `[estilo global] Escritorio elegante de un dueño de barbería: laptop mostrando un panel, taza de café, herramientas de barbero al costado, luz cálida. Transmite control y profesionalismo. Espacio negativo para texto.`

## 2. Tienda — banners de categoría (3:2, ~1200×800)
Encabezan cada categoría del catálogo. Coherentes con el nombre.
- **`public/images/tienda/cat-styling.webp`**: `[estilo global] Pomadas y ceras de peinado sobre mármol oscuro, peine, reflejo dorado.`
- **`public/images/tienda/cat-barba.webp`**: `[estilo global] Aceites y bálsamos para barba, cepillo de madera, ambiente cálido.`
- **`public/images/tienda/cat-cabello.webp`**: `[estilo global] Shampoos y tónicos capilares premium, toalla oscura, gotas de agua.`
- **`public/images/tienda/cat-afeitado.webp`**: `[estilo global] Navaja clásica, brocha y bol de afeitar, toalla caliente humeante.`

## 3. Módulos del admin — miniaturas (1:1, ~500×500)
Una por módulo, para las tarjetas de `/admin/configuracion` y encabezados. Iconográficas pero fotográficas, minimalistas.
- **`public/images/modulos/tienda.webp`**: estante de productos de barbería iluminado.
- **`public/images/modulos/suscripciones.webp`**: calendario/agenda con un turno recurrente marcado.
- **`public/images/modulos/contabilidad.webp`**: caja registradora / billetes y monedas con luz cálida.
- **`public/images/modulos/propinas.webp`**: monedas/propina sobre bandeja dorada.
- **`public/images/modulos/mensajes.webp`**: teléfono mostrando un chat/WhatsApp, ambiente barbería.
- **`public/images/modulos/lookbook.webp`**: pared con fotos de cortes (galería).
- **`public/images/modulos/reservas.webp`**: mano agendando en un teléfono, sillón de fondo.
- **`public/images/modulos/portal-barbero.webp`**: barbero revisando su agenda del día en una tablet.

## 4. Empty states — ilustraciones sobrias (1:1, ~600×600)
Para listas vacías, en la misma estética (pueden ser foto minimalista o ilustración de línea dorada sobre negro).
- **`public/images/empty/no-citas.webp`**: sillón de barbero vacío, sereno.
- **`public/images/empty/no-clientes.webp`**: silueta/asiento de espera vacío.
- **`public/images/empty/no-productos.webp`**: estante vacío elegante.

## QA
- WebP < 300 KB, aspect ratio correcto por sección. Dorado como acento (no saturado). Sin texto/logos. Coherencia de paleta con las imágenes ya existentes en `public/`.
