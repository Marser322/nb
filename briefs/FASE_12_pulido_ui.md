# FASE 12 — Pulido UI, lote 1 · brief para Gemini

CONTEXTO: NB Barber (Next.js 16 + Supabase + shadcn/ui). Base funcional completa. Este lote junta pulidos de alto impacto/bajo riesgo. Estética lujo minimalista (negro + dorado `#D4AF37`), español. **Regla de oro:** cualquier guard `if (!isLoaded || !features.X) return <loader/>` va DESPUÉS de todos los hooks. Verificar en navegador, no solo `npm run build`.

## TAREAS (hacer en este orden; cada una es independiente)

### 1. Subida de imágenes a Supabase Storage (habilita el resto de lo visual)
Hoy `avatar_url` (barberos) e `image_url` (productos) son inputs de texto (URL). Reemplazar por subida real:
- Crear bucket público `media` en Supabase (o `avatars` + `products`). Documentar la policy: lectura pública, escritura solo `authenticated` admin.
- Componente reutilizable `src/components/admin/image-upload.tsx`: input file → sube a Storage vía `supabase.storage.from(...).upload(...)` → devuelve la URL pública → setea el campo. Preview del archivo, validación de tipo/tamaño (< 2 MB), estado de carga.
- Integrarlo en `src/app/admin/barberos/page.tsx` (avatar) y `src/app/admin/productos/page.tsx` (imagen). Mantener compatibilidad: si ya hay URL, mostrarla.

### 2. Paginación + búsqueda server-side en listas admin
Las listas cargan todo en memoria. Para que escale:
- `/admin/clientes`: la búsqueda ya filtra en memoria sobre `get_clients_overview`; agregar **paginación** (page size 20) en cliente por ahora (o `range()` si se pasa a query directa).
- `/admin/citas`: agregar **búsqueda por nombre/teléfono de cliente** además de los filtros existentes.
- `/admin/productos` y `/admin/barberos`: agregar buscador por nombre.
Reusar el patrón de `Input` + filtro que ya existe en `/admin/clientes`.

### 3. Consistencia de estados de carga y vacío
- Unificar skeletons (usar el mismo patrón de `animate-pulse` que ya hay) en todas las páginas admin que hoy muestran spinner o nada.
- Empty states con ícono + texto + CTA en todas las listas (citas vacías ya lo tiene; replicar en clientes, productos, mensajes, liquidaciones).

### 4. Micro-interacciones y QA mobile
- Revisar que todos los diálogos (crear/editar) cierren y refresquen datos tras guardar (ya en la mayoría; verificar productos/servicios/barberos).
- QA responsive en 375px: tablas admin con scroll horizontal (`overflow-x-auto`), diálogos que no desborden, el toggle de tema y los FAB (Ayuda + AI) sin superponerse.
- `alt` descriptivo en todas las `next/image` de tarjetas.

## CRITERIOS DE ACEPTACIÓN
- Se puede subir una imagen de producto/barbero desde el admin y se ve en la tienda/reserva sin pegar URL.
- Las listas admin tienen búsqueda; ninguna carga más de ~20 filas de golpe sin paginar.
- Skeletons y empty states consistentes; sin layout roto en mobile (375px).
- `npm run build` verde + verificación en navegador (preview). Reportar archivos tocados y la config del bucket de Storage.
