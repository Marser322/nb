# FASE 25 — Polish: Home + Lookbook

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que la home y el lookbook dejen de mostrar datos congelados (servicios y estilos hardcodeados) y conviertan al máximo hacia la reserva con los deep links que el wizard ya sabe aprovechar (FASE 21).

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens — el hero de la home es intencionalmente oscuro sobre foto (los `text-zinc-*`/overlays negros del hero NO se tocan).

## Estado actual (anclas verificadas 2026-07-08)

**Lookbook** (`src/app/(main)/lookbook/page.tsx`):
- **Nunca lee la DB**: `const styles: Lookbook[] = STATIC_STYLES` con `const isLoading = false` hardcodeado (`page.tsx:30-32`). El admin puede cargar estilos en la tabla `lookbook` y jamás aparecen. El skeleton de carga existe pero es código muerto (`page.tsx:137-142`). El wizard ya lee la DB con fallback estático (FASE 21, `src/app/(main)/reservar/page.tsx`) — el lookbook quedó atrás.
- El deep link usa `getServiceIdForStyle(style.id)` de `src/lib/static-data.ts` (`page.tsx:206-208`) — mapping estático que no funciona para estilos de DB (esas filas traen su propio `serviceId`).
- Colores hardcodeados fuera del hero: badge "Destacado" `bg-amber-500 text-black` (`page.tsx:186`), link Instagram `text-amber-400` (`page.tsx:220`), título con gradiente `from-amber-400 to-amber-600` (`page.tsx:97`) — deberían usar `primary` (el hero sobre foto negra puede conservar su gradiente).

**Home** (`src/app/page.tsx`):
- **Servicios hardcodeados con precios congelados**: array `services` local con 450/750/350 y el comentario "luego vendrán de la BD" (`page.tsx:19-48`). Si el admin cambia un precio en `/admin/servicios`, la home miente. Además el precio se renderiza a mano (`$` + número, `page.tsx:302-307`) en vez de `formatPrice`.
- **Las cards de servicio no navegan**: no hay link a `/reservar?serviceId=X` (`page.tsx:248-311`); la conversión depende solo de los CTAs genéricos. El wizard ya aterriza con el servicio preseleccionado (FASE 21).
- La home no muestra ningún estilo del lookbook — el patrón lookbook→wizard (razón de ser del ítem) no tiene presencia en la página de mayor tráfico.
- Lo que está bien (no romper): hero con CTA condicionado a `features.reservas_online` y fallback WhatsApp (`page.tsx:98-119`), bloque demo-admin (`page.tsx:121-160`, ids `hero-cta`/`admin-demo-entry` usados por el tour), before/after, WhyChooseUs, WelcomeModal.

## Análisis (máximo valor / qué NO se hace)

**Valor**: la home es la página de mayor tráfico y el lookbook es el gancho emocional; hoy ambos muestran una foto congelada del negocio de hace meses. Conectarlos a la DB (patrón fallback ya probado 3 veces) y hacer cada card un deep link al wizard convierte tráfico en reservas con datos siempre verdaderos.

**Fuera de alcance (anti-monstruo)**:
- NO reviews/testimonios reales ni rating dinámico (los "5+/1000+/4.9" del hero son branding copy y quedan).
- NO feed de Instagram vía API.
- NO CMS/editor de la home; NO tocar assets/imágenes.
- NO subida de imágenes del lookbook desde admin (ya listado en `REFINAMIENTO_roadmap.md` sección D).

## Trabajo — Base de datos

Ninguna migración (la tabla `lookbook` ya existe y el wizard ya la consume).

## Trabajo — App

### Bloque A — Lookbook desde la DB

En `src/app/(main)/lookbook/page.tsx`:

1. Cargar los estilos de Supabase (`lookbook`, orden `created_at` desc) con fallback a `STATIC_STYLES` si viene vacío o falla — copiar el patrón exacto del wizard (FASE 21) para que ambos vean el MISMO universo de estilos y los deep links coincidan.
2. Usar el estado `isLoading` real: el skeleton existente (`page.tsx:137-142`) deja de ser código muerto.
3. Deep link por estilo: usar el `serviceId` de la fila cuando exista; fallback a `getServiceIdForStyle(style.id)` para los estáticos. Si no hay ninguno, el botón "Reservar Estilo" cae a `/reservar?styleId=X` sin serviceId (el wizard lo tolera).
4. Los tags del filtro se derivan de los estilos cargados (ya es así, `page.tsx:43`) — verificar que funcione con tags null de DB.

### Bloque B — Servicios reales y clickeables en la home

En `src/app/page.tsx`:

1. Cargar servicios activos de Supabase (`services`, `is_active`, orden `sort_order`, primeros 3) con fallback al array estático actual (conservar los iconos/imágenes locales: mapear por índice/sort_order, con un icono default si hay más servicios que assets).
2. Precio con `formatPrice` (`src/lib/utils.ts`) — UYU consistente con el resto de la app.
3. Cada card de servicio se envuelve en `Link` a `/reservar?serviceId=<id>` cuando `features.reservas_online` (el hover ya invita: `whileHover={{ y: -10 }}`); sin reservas online, la card queda no-clickeable como hoy.
4. Skeleton simple mientras carga (3 cards pulse, patrón del wizard) — la home no debe saltar de layout.

### Bloque C — Estilos destacados en la home

1. Nueva sección compacta "Estilos que piden hora" (nombre final a criterio, en voseo) entre Servicios y Antes/Después, visible solo si `features.lookbook`: hasta 4 estilos `is_featured` (o los 4 más recientes si no hay destacados) de la misma carga de DB/fallback.
2. Cada card: imagen + título + botón "Reservar estilo" → `/reservar?styleId=X&serviceId=Y` (mismo resolver del Bloque A) y un CTA final "Ver todo el lookbook" → `ROUTES.LOOKBOOK`.
3. Estética consistente: tokens, `whileInView` como las secciones vecinas, sin librerías nuevas. Si no hay estilos, la sección no se renderiza (nada de estados vacíos en la home).

### Bloque D — Higiene de tokens en lookbook

1. Badge "Destacado", link Instagram y acentos fuera del hero pasan a tokens (`bg-primary text-primary-foreground`, `text-primary`) — `page.tsx:186`, `:220`. El gradiente del título del hero (sobre foto negra) puede quedar.

## Parte manual (Mario)

- Nada. (Cuando cargues estilos reales en la tabla `lookbook`, home, lookbook y wizard los van a mostrar solos.)

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Con la tabla `lookbook` vacía: lookbook y home muestran los estilos estáticos como hoy; con filas en la DB: ambas muestran los de la DB y sus deep links aterrizan en el wizard con estilo+servicio preseleccionados (FASE 21).
- Cambiar el precio de un servicio en `/admin/servicios` y verificar que la home lo refleje.
- Cards de servicio navegan a `/reservar?serviceId=X`; tour de la home intacto (`hero-cta`, `admin-demo-entry`).
- Ambos temas y 375px (nueva sección de estilos, cards clickeables).
- Si el dev server falla con "Failed to open database… invalid digit found in string": `rm -rf .next` + `find . -name '._*' -not -path './node_modules/*' -delete`.

## Criterios de aceptación

- Ni un precio ni un estilo hardcodeado de cara al usuario: todo sale de la DB con fallback estático.
- Toda card de servicio o estilo lleva al wizard con la selección precargada.
- El lookbook muestra lo que el admin carga; el skeleton funciona.
- Cero `amber-*` hardcodeados fuera del hero del lookbook.
- Hero, demo-admin, before/after, WhyChooseUs y tour siguen intactos.

## Restricciones

- Rama `feat/polish-home-lookbook`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks (ojo: `lookbook/page.tsx:34-40` ya tiene un early return — cualquier hook nuevo va ANTES de él). El build no lo detecta; crashea en runtime.
- No agregar dependencias. No tocar `globals.css` ni el wizard.
