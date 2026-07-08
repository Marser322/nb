# FASE 26 — Añadir servicios con facilidad (CRUD completo + categorías)

> Ejecutor: Sonnet. Planificado por Fable (2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que Mario (o el CEO) pueda dar de alta un servicio nuevo 100% desde `/admin/servicios` — con imagen, categoría y duración validada — y que aparezca bien en home, wizard y chat sin tocar código.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase con RLS. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens. Rama de trabajo: `feat/servicios-facil` desde `refinamiento-pre-demo`.

⚠️ **GUARD DE HOOKS (obligatorio)**: cualquier `return` temprano de un componente va DESPUÉS de declarar TODOS los hooks (`useState`/`useEffect`/`useMemo`/...). El build no detecta esta violación; crashea en runtime.

## Estado actual (anclas verificadas 2026-07-08)

- **`src/app/admin/servicios/page.tsx`** ya tiene CRUD básico: crear (insert, líneas 79-88), editar (update, 62-70), soft-delete vía `Switch` de `is_active` (103-114). Campos del formData (34-39): solo `name`, `description`, `price`, `duration_minutes`. **No maneja `image_url`** (la tabla del admin muestra siempre un icono `Sparkles` genérico, 241-242), no tiene búsqueda ni empty state ilustrado. Patrón del repo: `useState` formData + Supabase client directo (NO react-hook-form/zod — no introducirlos).
- **Tabla `services`** (`999_FULL_SETUP.sql:65-76`, espejo en `src/lib/supabase_schema.sql:74-85`): `id, name, description, price DECIMAL, duration_minutes INT DEFAULT 30, image_url TEXT, is_active BOOL, sort_order INT, created_at`. **No tiene columna `category`**. Seeds: Corte Clásico 450/30, Corte + Barba 750/60, Diseño de Barba 350/30 (`999:78-81`).
- **RLS lista**: `"Admins manage services"` FOR ALL con `is_admin()` (`999:542-544`) — el admin puede insertar/actualizar desde el browser. No se necesitan cambios de policies.
- **Storage listo**: bucket público `media` con policies correctas (migración `016_storage_setup.sql`: lectura pública, escritura solo admin autenticado).
- **Componente de upload ya hecho**: `src/components/admin/image-upload.tsx` — sube al bucket `media`, valida <2MB y tipo imagen, devuelve `publicUrl` vía `onChange`. Limitación: prop `folder` tipada como `"avatars" | "products"` (línea 12).
- **Plantilla a clonar**: `src/app/admin/productos/page.tsx` — Dialog + formData + `ImageUpload` (líneas 380-383, con input de URL manual como alternativa en 390) + `Select` de categoría (`PRODUCT_CATEGORIES` de constants) + búsqueda (`searchQuery`) + `IllustratedEmptyState`.
- **Consumidores de `services`**:
  - Home `src/app/page.tsx`: carga 3 servicios activos (líneas 40-54) pero los visuales salen de `SERVICE_VISUALS`, array estático de 3 `{icon, image}` **indexado por posición** (26-29, uso en 279-281). Un 4º servicio hereda icono/imagen de fallback. El fondo sí usa `service.image_url` si existe (281).
  - Wizard `src/app/(main)/reservar/page.tsx`: query `is_active` orden `sort_order` (85-91). `duration_minutes` alimenta el motor de slots: `dayHasFreeSlot` (296), `slotsNeeded = ceil(duration/slotDuration)` (313), `calculateEndTime` (317, 442).
  - Chat IA `src/app/api/chat/route.ts` (305, 355) y fallback `STATIC_SERVICES` en `src/lib/static-data.ts:14-47`.
  - Tipo `Service` en `src/types/database.types.ts:45`.
- **Numeración de migraciones**: la última es `020_rbac_permisos.sql` → la nueva es **`021_service_categories.sql`**.

## Análisis (máximo valor / qué NO se hace)

**Valor**: hoy un servicio creado desde el admin nace sin foto y con icono ajeno en la home; agregar categoría + imagen + validación convierte el catálogo de servicios en algo que el dueño administra solo, y la home/wizard dejan de depender de arrays por índice.

**Fuera de alcance (anti-monstruo)**:
- NO precios dinámicos ni happy hours (roadmap 3.5).
- NO combos/bundles ni servicios encadenados.
- NO reordenar la arquitectura del wizard (los 6 pasos quedan como están).
- NO tocar el RPC `get_availability` ni el motor de slots — solo validar `duration_minutes` en el form.
- NO react-hook-form/zod (el patrón del repo es formData + validación manual).

## Trabajo — Base de datos

### `supabase/migrations/021_service_categories.sql`

```sql
-- Categorías de servicios (códigos EN, labels ES en constants.ts — patrón de la 012)
ALTER TABLE services ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'corte';
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_category_check;
ALTER TABLE services ADD CONSTRAINT services_category_check
  CHECK (category IN ('corte', 'barba', 'combo', 'tratamiento', 'color', 'otro'));

-- Backfill de seeds existentes
UPDATE services SET category = 'combo' WHERE name ILIKE '%+%' OR name ILIKE '%combo%';
UPDATE services SET category = 'barba' WHERE name ILIKE '%barba%' AND category = 'corte';
```

(Nota: los códigos son minúsculas-EN-ish neutrales; `corte` y `barba` ya son código válido. El CHECK con DROP/ADD permite re-correr la migración.)

### Espejos (drift cero, regla del proyecto)

1. `supabase/migrations/999_FULL_SETUP.sql`: agregar `category TEXT NOT NULL DEFAULT 'corte' CHECK (category IN (...))` al `CREATE TABLE services` (línea ~65-76) y la categoría a los 3 seeds del INSERT (78-81: Corte Clásico→`corte`, Corte + Barba→`combo`, Diseño de Barba→`barba`). Añadir comentario de que la 021 está incluida (patrón de las notas existentes del archivo).
2. `src/lib/supabase_schema.sql`: mismo cambio en el CREATE TABLE (74-85).
3. `src/types/database.types.ts`: agregar `category: string` a `interface Service` (línea 45).
4. `src/lib/constants.ts`: nuevo bloque junto a `PRODUCT_CATEGORIES` (178):

```ts
// Categorías de servicios (códigos EN en DB, labels ES en UI)
export const SERVICE_CATEGORIES = ['corte', 'barba', 'combo', 'tratamiento', 'color', 'otro'] as const
export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
    corte: 'Cortes', barba: 'Barba', combo: 'Combos',
    tratamiento: 'Tratamientos', color: 'Color', otro: 'Otros',
}
```

5. `src/lib/static-data.ts`: agregar `category` a los 3 items de `STATIC_SERVICES` (mismos valores que el backfill).

## Trabajo — App

### Bloque A — `src/components/admin/image-upload.tsx`

Ampliar el union type de `folder` (línea 12): `"avatars" | "products" | "services"`. Nada más.

### Bloque B — `/admin/servicios` CRUD completo

En `src/app/admin/servicios/page.tsx`, clonando el patrón de `productos/page.tsx`:

1. **Imagen**: `image_url` en formData + `ImageUpload folder="services"` en el dialog + input de URL manual como alternativa (patrón productos:380-391). En la tabla, mostrar thumbnail (`next/image`, 40×40 rounded) cuando hay `image_url`; icono `Sparkles` solo como fallback.
2. **Categoría**: `Select` con `SERVICE_CATEGORIES` + `SERVICE_CATEGORY_LABELS`; default `corte`. Badge de categoría en la tabla.
3. **Validación manual antes del insert/update** (toast de error en español si falla):
   - `name` no vacío; `price` > 0.
   - `duration_minutes` ≥ 15, ≤ 240 y múltiplo de `BUSINESS_CONFIG.slotDuration` (verificar el nombre exacto del campo en `src/lib/constants.ts`; el wizard calcula `slotsNeeded = ceil(duration/slot)` — una duración no múltiplo desalinea la grilla). Sugerencia UX: `Select` de duraciones (15/30/45/60/90/120 min) en vez de input libre.
4. **Búsqueda** por nombre (input con icono, patrón productos) y filtro por categoría.
5. **Empty state**: `IllustratedEmptyState` como productos.
6. **Orden**: mantener `sort_order` (nuevo = `services.length` como hoy); agregar botones subir/bajar (flechas) en la tabla que intercambian `sort_order` con el vecino y persisten ambos updates. Si complica, dejar `sort_order` como campo numérico editable en el dialog — decisión del ejecutor, pero alguna de las dos.
7. Todo texto nuevo en español; tokens de tema (nada de colores hardcodeados); mantener el gate de features si la página ya lo tiene.

### Bloque C — Home sin acople por índice

En `src/app/page.tsx`:

1. Reemplazar el uso posicional de `SERVICE_VISUALS[index]` (279-281) por un mapa `category → icon` (p.ej. corte→Scissors, barba→beard-ish (usar lucide disponible), combo→Sparkles, tratamiento→Droplets, color→Palette, otro→Star) con fallback `Star`.
2. Imagen de card: `service.image_url` primero; si falta, fallback por categoría a las 3 imágenes locales actuales de `SERVICE_VISUALS` (corte→maquina-clippers, combo→detalle-corte, barba→detalle-barba, resto→cualquiera de las 3). No agregar assets nuevos.
3. Mantener el límite de 3 cards, pero agregar un link discreto "Ver todos los servicios →" a `/reservar` debajo de la grilla, visible solo si la DB devolvió más de 3 servicios (requiere pedir hasta 4 o pedir count). Estética de la sección intacta (whileInView, glass-card, etc.).
4. No tocar hero, tour ids (`hero-cta`, `admin-demo-entry`), ni el bloque demo-admin.

### Bloque D — Wizard agrupado por categoría

En `src/app/(main)/reservar/page.tsx`, paso 1 (selección de servicio):

1. Si los servicios cargados tienen **más de 1 categoría distinta**, agruparlos con un subtítulo por categoría (`SERVICE_CATEGORY_LABELS`, orden de `SERVICE_CATEGORIES`); dentro de cada grupo, orden `sort_order` actual. Con 1 sola categoría: lista plana exactamente como hoy (cero regresión con los seeds actuales… ojo: el backfill deja 3 categorías, así que la agrupación SÍ se va a ver — verificar que no rompa el deep link `?serviceId=` de FASE 21 ni el auto-avance).
2. Sin cambios de lógica de selección, disponibilidad ni navegación de pasos.

### Bloque E — Chat IA

En `src/app/api/chat/route.ts`: incluir `category` (label ES) en el bloque de servicios que se inyecta al contexto del LLM (queries en 305/355), para que el asistente pueda responder "¿qué tratamientos tienen?".

## Parte manual (Mario)

- Correr `supabase/migrations/021_service_categories.sql` en la DB de desarrollo (y anotarla para producción).
- Opcional: subir fotos reales a los servicios existentes desde el admin.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- En `/admin/servicios`: crear un 4º servicio (p.ej. "Ritual de color", categoría `color`, 90 min, con imagen subida) → aparece con thumbnail y badge; editarlo; desactivarlo/reactivarlo; búsqueda y filtro funcionan; validación rechaza precio 0 y duración 50 min.
- Home: el 4º servicio NO rompe la grilla (sigue mostrando 3 + link "Ver todos"); cada card usa su `image_url` e icono por categoría.
- Wizard: paso 1 agrupado por categoría; seleccionar el servicio de 90 min y verificar que el calendario bloquea 3 slots (duración manda `get_availability`); deep link `/reservar?serviceId=<nuevo>` sigue auto-avanzando (FASE 21).
- Chat: preguntar "¿qué servicios de color tienen?" y ver que el contexto los conoce (con GEMINI_API_KEY o fallback local).
- Ambos temas (claro/oscuro) y 375px en admin/servicios, home y wizard.
- Si git falla ("non-monotonic index"): `find .git -name '._*' -delete`. Si el dev server falla ("Failed to open database… invalid digit"): `rm -rf .next` + `find . -name '._*' -not -path './node_modules/*' -delete`.

## Criterios de aceptación

1. Un servicio nuevo se da de alta completo (imagen incluida) sin tocar código y se ve correcto en admin, home, wizard y chat.
2. `category` existe en DB con CHECK, espejada en 999/supabase_schema/types/static-data/constants, con labels ES centralizados en `constants.ts`.
3. `duration_minutes` inválido es imposible de guardar desde el admin.
4. Cero regresiones en el motor de slots, el deep link del wizard y el tour de la home.
