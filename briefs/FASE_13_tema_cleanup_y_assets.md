# FASE 13 — Cierre de modo claro + assets + Storage · brief para Gemini

CONTEXTO: NB Barber (Next.js 16 + Supabase + Tailwind 4 + next-themes). La FASE 11 dejó el toggle claro/oscuro FUNCIONANDO (ThemeProvider, `theme-toggle.tsx`, paleta `:root` crema/dorada branded, default dark). La FASE 12 dejó `ImageUpload` con Supabase Storage y paginación/búsqueda en admin. Quedaron cabos sueltos que impiden que el modo claro se vea 100% y que los uploads funcionen. Estética lujo minimalista (dorado `#D4AF37`), español. Verificar SIEMPRE en el navegador en AMBOS temas, no solo `npm run build`.

## TAREAS

### 1. Terminar la limpieza de colores hardcodeados (bloquea el modo claro)
Quedan ~17 archivos con clases dark fijas que NO responden al tema → parches negros en modo claro. Detectar con:
`grep -rlE "bg-zinc-950|bg-black|bg-zinc-900|text-white\b|border-white/" src/app src/components --include="*.tsx"`
Reemplazar por tokens de tema:
- `bg-zinc-950`/`bg-black` → `bg-background` · `bg-zinc-900` → `bg-card` · `text-white` → `text-foreground` · `text-zinc-300/400` → `text-muted-foreground` · `border-white/10` → `border-border`.
Archivos prioritarios (páginas de contenido): `src/app/page.tsx`, `src/app/(main)/{lookbook,reservar,tienda,contacto/ContactoContent,mi-cuenta}/…`, `src/app/(auth)/layout.tsx`, `src/app/admin/{barberos,liquidaciones,clientes/[id]}/page.tsx`, `src/components/shop/feature-carousel.tsx`, `src/components/tour/TourOverlay.tsx`.
EXCEPCIÓN: dejar hardcodeado solo lo intencional en ambos temas (FAB dorado, texto sobre foto oscura de hero/producto). En los primitivos shadcn (`ui/button,badge,dialog,sheet`) revisar caso a caso: si usan `text-white` donde debería ser `text-primary-foreground`, corregir; si es un overlay negro semitransparente intencional, dejar.
OBJETIVO: `grep` final de páginas de contenido = 0 hardcodes no intencionales. Recorrer en el navegador en modo CLARO: home (secciones bajo el hero), /tienda, /lookbook, /reservar, /mi-cuenta, /contacto y el admin — que no haya bloques negros fuera de lugar.

### 2. Optimizar las imágenes generadas (performance)
Los 8 productos pesan 512 KB c/u (~4 MB total) y varias fotos 256 KB. Objetivo < 400 KB (idealmente < 250 KB) por archivo, manteniendo ruta y nombre. Comprimir (o convertir a WebP y actualizar las referencias si se cambia extensión). Verificar que la tienda/lookbook/reserva sigan mostrando bien las imágenes tras comprimir.

### 3. Aplicar y verificar el bucket de Storage `media` (bloquea los uploads)
Ya existe la migración `supabase/migrations/016_storage_setup.sql` que crea el bucket público `media` + policies (lectura pública; insert/update/delete solo admin vía `is_admin()`). Falta:
- **Aplicarla a la DB** (como 014/015). Si el SQL Editor rechaza crear policies sobre `storage.objects` por permisos, crear el bucket `media` (público) desde el dashboard de Storage y agregar las policies desde ahí (mismas reglas).
- Documentar el paso en `DEPLOY.md` (sección Storage) para replicar en producción.
- Probar end-to-end: subir una imagen de producto desde `/admin/productos` y verificar que se ve en `/tienda`.

## CRITERIOS DE ACEPTACIÓN
- Modo claro sin parches negros en las páginas de contenido ni en el admin (verificado en navegador).
- Imágenes < 400 KB; la tienda/lookbook cargan rápido.
- Subir una imagen desde el admin funciona end-to-end y queda visible en la web.
- `npm run build` verde. Reportar archivos tocados, tamaños antes/después de imágenes y la config del bucket.
