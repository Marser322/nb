# FASE 23 — Polish: estabilización de skins visuales del admin

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08), sobre código base generado con GPT.
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: dejar el sistema de skins del admin (commit `27cd627` en `feat/visual-skins`) listo para producción: sin FOUC, sin fugas al sitio público, CSS mantenible y contraste verificado en los 4 skins × claro/oscuro.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). El sitio PÚBLICO usa el tema híbrido claro/oscuro con branding NB (dorado/negro lujo minimalista) y debe permanecer INMUTABLE; los skins son una feature exclusiva del panel admin.

## Estado actual (anclas verificadas 2026-07-08, sobre `feat/visual-skins`)

- Sistema: 4 skins (`nb-luxe` default dorado, `quantix-noir`, `neon-focus`, `flow-amber`) definidos en `src/lib/visual-skins.ts` (tipos, `VISUAL_SKIN_STORAGE_KEY = "nb-admin-visual-skin"`, helpers `isVisualSkin`/`getVisualSkin`).
- Aplicación: `VisualSkinProvider` setea `document.documentElement.dataset.visualSkin` y persiste en localStorage (`src/components/admin/VisualSkinProvider.tsx`). Selector con paleta en el topbar admin (`src/app/admin/layout.tsx`, junto a `ThemeToggle`).
- CSS: ~950 líneas nuevas en `src/app/globals.css` (214→1165). Dos familias de tokens: `--admin-*` (reasignan los tokens shadcn, bien scopeados a `.admin-shell`) y `--assistive-*` (FAB de chat/ayuda, definidos a nivel `html[data-visual-skin]` GLOBAL: bloques en `globals.css:256-354` y `:585-669`).
- Lo que está bien (no romper): skin y tema claro/oscuro son ejes ortogonales (cada skin define variante `html[...]` y `html.dark[...]`; compatible con next-themes `attribute="class"`); hooks correctos; `prefers-reduced-motion` contemplado (`globals.css:952`); build compila.

## Problemas a resolver (diagnóstico de auditoría)

1. **FOUC**: el skin se aplica en `useLayoutEffect` post-hidratación (`VisualSkinProvider.tsx:25`). Con un skin no-default guardado, cada carga muestra un flash dorado. next-themes lo resuelve con script inline bloqueante; los skins no tienen equivalente.
2. **Fuga al sitio público**: `VisualSkinProvider` está montado en el ROOT layout (`src/app/layout.tsx:101`) y las variables `--assistive-*` son globales → el FAB del chat y el HelpFab que ve el cliente en `/`, `/reservar`, etc. cambian de color según el skin elegido en el admin. Decisión de producto tomada: **el público siempre ve branding NB**.
3. **CSS frágil**: el bloque nuevo cae dentro de `@layer utilities` (abierto en `globals.css:181`) y necesita `!important` para pisar las utilidades del Button (`.nb-assistive-fab`, `globals.css:171-177`). Además `--kpi-tone: #38bdf8` hardcodeado (`globals.css:890`) no reacciona al skin.
4. **Sin QA visual**: nadie verificó contraste de los 4 skins en modo claro (riesgo principal: `neon-focus` y `flow-amber` claros, texto muted sobre fondos glass).

## Análisis (máximo valor / qué NO se hace)

**Valor**: los skins le dan al dueño una herramienta de identidad sobre SU panel sin tocar la marca pública. Estabilizados, son un diferenciador de demo potente. El techo del ciclo es: cero flash, cero fuga, CSS que un humano pueda mantener.

**Fuera de alcance (anti-monstruo)**: NO agregar skins nuevos ni editor de skins custom; NO persistir la elección en DB/perfil (localStorage alcanza; idea anotada si se pide multi-dispositivo); NO tocar el sitio público más allá de restaurarle sus valores base; NO rediseñar componentes del admin (eso es el ciclo Dashboard).

## Trabajo — Base de datos

Ninguna migración.

## Trabajo — App

### Bloque A — Skins solo en el admin (resolver la fuga ANTES que el FOUC, simplifica el bloque B)

1. Mover `VisualSkinProvider` del root layout (`src/app/layout.tsx:101`) al layout admin (`src/app/admin/layout.tsx`), envolviendo el shell. El público deja de recibir `data-visual-skin`.
2. Al desmontar/salir del admin el atributo debe limpiarse o quedar inocuo: dado que navegaciones admin→público son client-side, agregar cleanup en el provider (`useEffect` return que borra `dataset.visualSkin`) para que el atributo no sobreviva fuera del admin.
3. Los tokens `--assistive-*` por skin (bloques `globals.css:256-354` y `:585-669`) pasan a estar condicionados también a `.admin-shell` (ej. `html[data-visual-skin="X"] .admin-shell { ... }` o selector equivalente que funcione con dónde estén los FABs dentro del árbol admin — verificar dónde se renderizan HelpFab/AiAssistant respecto de `.admin-shell`; si quedan fuera (root layout), usar `html[data-visual-skin]` está bien PORQUE el atributo ya solo existirá en rutas admin tras el punto 1-2 — en ese caso documentarlo con un comentario y no duplicar selectores).
4. Los valores base (default NB) de `--assistive-*` quedan como están para el público.

### Bloque B — Anti-FOUC

1. Script inline en el `<head>` del layout admin (o root si técnicamente es necesario, pero solo activándose en rutas `/admin`): leer `localStorage["nb-admin-visual-skin"]`, validar contra la lista de ids y setear `document.documentElement.dataset.visualSkin` antes del primer paint. Ids serializados en el script (son 4 strings; mantener sincronía con `visual-skins.ts` vía comentario cruzado o generándolo desde el array importado en un Server Component con `dangerouslySetInnerHTML`).
2. `VisualSkinProvider` pasa a leer el atributo ya seteado como estado inicial (evitar doble aplicación/parpadeo).
3. Probar: con `neon-focus` guardado, recargar `/admin/dashboard` en frío — sin flash dorado.

### Bloque C — Higiene CSS

1. Mover todo el bloque de skins/admin-shell/assistive a un `@layer components` propio (cerrar correctamente el `@layer utilities` existente); quitar los `!important` que dejen de ser necesarios (verificar el FAB: si `@layer components` pierde contra las utilities del Button, alternativa aceptada: mantener especificidad por selector compuesto, no por `!important`).
2. `--kpi-tone` (`globals.css:890`): derivarlo del acento del skin activo (definirlo dentro de cada bloque de skin) en vez del hex fijo.
3. Añadir un comentario índice al inicio del bloque de skins en `globals.css` (mapa de secciones: tokens por skin → admin-shell → assistive → componentes) para navegabilidad de las ~950 líneas.

### Bloque D — QA visual y ajustes de contraste

1. Recorrer con el navegador: `/admin/dashboard`, `/admin/citas` y `/admin/clientes` en los 4 skins × claro/oscuro (8 combinaciones por página como mínimo en dashboard).
2. Ajustar los pares con contraste insuficiente (objetivo WCAG AA para texto normal: 4.5:1; foco en texto `muted` sobre fondos glass en `neon-focus`/`flow-amber` claros).
3. Verificar 375px (sidebar mobile con Sheet, selector de skin accesible) y que el tour del admin siga funcionando.
4. Verificar el aislamiento público: con `flow-amber` activo, abrir `/` y `/reservar` — FAB de chat y HelpFab dorados NB, cero rastro del skin.

## Parte manual (Mario)

- Nada de DB. Recordatorio no bloqueante: la migración `020_rbac_permisos.sql` sigue pendiente en Supabase; sin ella el sidebar admin muestra solo Dashboard (no es culpa de los skins).

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Anti-FOUC verificado (recarga en frío con skin no-default, sin flash).
- Aislamiento público verificado (punto D4).
- Si el dev server falla con "Failed to open database… invalid digit found in string": `rm -rf .next` + `find . -name '._*' -not -path './node_modules/*' -delete` (caché Turbopack corrupta por AppleDouble, disco externo).

## Criterios de aceptación

- Un usuario con `quantix-noir` guardado recarga el admin y NUNCA ve el dorado default.
- El sitio público es idéntico pixel a pixel con cualquier skin elegido en el admin.
- Cero `!important` nuevos (o los mínimos justificados con comentario).
- Los 4 skins legibles en claro y oscuro en dashboard/citas/clientes; 375px OK; tour OK.
- El selector de skins y la persistencia siguen funcionando igual que en `27cd627`.

## Restricciones

- Trabajar SOBRE la rama `feat/visual-skins` (el código base ya está commiteado ahí en `27cd627`); no tocar `main` ni `refinamiento-pre-demo`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks. El build no lo detecta; crashea en runtime.
- No agregar dependencias. No tocar el RBAC ni las páginas públicas (salvo revertir la fuga de estilos).
