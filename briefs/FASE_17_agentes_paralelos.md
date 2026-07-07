# FASE 17 — Orquestación paralela: restaurar modo claro + higiene + cierre mobile · brief para GPT

INSTRUCCIÓN MAESTRA: lanzá **4 agentes EN PARALELO** (A, B, C, D — sus archivos son disjuntos, no se pisan) y cuando los cuatro terminen, corré el **agente E secuencial** como integrador/QA. Cada agente recibe su bloque completo de abajo + las REGLAS TRANSVERSALES. Si no podés paralelizar de verdad, ejecutá A→B→C→D→E en ese orden (A es el más urgente: es una regresión visible).

CONTEXTO: NB Barber (Next.js 16 App Router + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase), repo en `/Volumes/1TB CACHE/Barberia`, branch `fix/crm-flujos-funcionales`. El commit `daf08ff` (auditoría mobile + robustecimiento CRM) dejó bien el 90% pero introdujo UNA REGRESIÓN GRAVE (eliminó el tema claro, agente A) y dejó deuda de higiene (agentes B y C) y barridos incompletos de la FASE 16 (agente D).

## REGLAS TRANSVERSALES (van en el prompt de CADA agente)

- Toda la UI en español con voseo uruguayo ("tenés", "reservá", "entrá").
- Tokens de tema SIEMPRE (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `primary`, `border-border`). Nada de colores hardcodeados. Todo cambio visual se prueba en tema claro Y oscuro.
- **En componentes React, cualquier guard/early-return va SIEMPRE DESPUÉS de todos los hooks** (useState/useEffect/useRef/custom hooks como useFeatures). El build NO lo detecta; crashea en runtime. Revisá cada componente que toques.
- Mobile-first: clase base = mobile; `sm:`/`md:`/`lg:` agregan desktop. Ningún campo enfocable (`input`/`textarea`/`select`) puede computar <16px por debajo de 768px (patrón: `text-base md:text-sm`).
- NO tocar archivos fuera del scope de tu bloque (otros agentes trabajan en paralelo sobre el mismo working tree).
- Commit atómico AL FINAL de tu bloque, mensaje en español estilo del historial (`fix:`, `feat:`, `chore:`, `docs:`). Antes de commitear: `npm run build` y `npm run lint` limpios (hay ~44 warnings preexistentes, no agregar nuevos).
- Si git falla con "non-monotonic index": `find .git -name '._*' -delete` (repo en disco externo, error conocido).
- Las migraciones SQL se corren a mano en el SQL Editor de Supabase (convención del proyecto): crear/editar el archivo alcanza, NO intentar aplicarla a la DB.

---

## AGENTE A — Restaurar el modo claro (REGRESIÓN, prioridad máxima)

El sitio tiene por diseño un **tema híbrido claro/oscuro**: oscuro branded gold/black por defecto + tema claro premium boutique (marfil/crema/dorado). Es parte del CLAUDE.md y del valor de la demo. El commit `daf08ff` lo eliminó por completo sin que nadie lo pidiera. Restaurarlo:

1. `src/app/layout.tsx`:
   - Quitar `className="dark"` del tag `<html>` (debe quedar `<html lang="es" suppressHydrationWarning>`).
   - Quitar `forcedTheme="dark"` del `<ThemeProvider>` (mantener `defaultTheme="dark"`, `attribute="class"`, `enableSystem={false}`, `disableTransitionOnChange`).
2. `src/app/globals.css`: el bloque nuevo `html { color-scheme: dark; background: var(--background); }` fuerza oscuro a nivel navegador (scrollbars, form controls). Hacerlo reactivo al tema: `html { color-scheme: light; }` + `html.dark { color-scheme: dark; }` (o `color-scheme: light dark` si funciona con next-themes por clase — verificar en navegador que los controles nativos cambien al togglear). Mantener `background: var(--background)`.
3. `src/components/layout/Header.tsx`: reconectar `<ThemeToggle />` (el componente `src/components/theme-toggle.tsx` EXISTE, solo lo desimportaron):
   - Import: `import { ThemeToggle } from "@/components/theme-toggle";`
   - En la zona de acciones del header desktop (donde estaba, junto al lock de Acceso Admin).
   - En el header del menú mobile (Sheet), donde también estaba.
4. Verificación en navegador (obligatoria): togglear tema y revisar en AMBOS temas: home completa, `/reservar` paso 2, chat IA abierto (panel + input), tour (spotlight + card), un dialog de admin, `/admin-login` con la tarjeta "Modo demo" (`NEXT_PUBLIC_DEMO_MODE=true` ya está en `.env.local`), y que no haya flash raro al recargar (el `suppressHydrationWarning` + script de next-themes lo maneja).
5. Si algún componente tocado por commits recientes se ve roto en tema claro (contraste ilegible, fondo hardcodeado), arreglarlo con tokens en el mismo commit.

Scope de archivos: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/layout/Header.tsx`, `src/components/theme-toggle.tsx` y SOLO los fixes puntuales de contraste que surjan del punto 5.
Commit sugerido: `fix(tema): restaura el modo claro (toggle, color-scheme reactivo, sin forcedTheme)`.

---

## AGENTE B — Higiene de migraciones y sincronización del 999

1. **Renombrar** `supabase/migrations/20260706235807_crm_booking_hardening.sql` → `supabase/migrations/018_crm_booking_hardening.sql` (la convención del proyecto es `NNN_nombre.sql` correlativo; el timestamp rompe el orden visual y el runbook). Solo `git mv`, sin tocar el contenido.
2. **Sincronizar `supabase/migrations/999_FULL_SETUP.sql`** (script consolidado para DB fresca). Hoy le falta (verificado):
   - `015_more_feature_flags.sql`: los INSERT de `feature.lookbook`, `feature.reservas_online`, `feature.portal_barbero` en `app_settings`.
   - `016_storage_setup.sql`: buckets/policies de storage — incorporar completo.
   - `018_crm_booking_hardening.sql` (la renombrada): funciones, índices y policies — incorporar completo.
   - `017` NO hace falta (los seeds del 999 ya insertan `.jpg` directamente; 017 solo corrige DBs existentes).
   Mantener la idempotencia del archivo (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` antes de cada CREATE POLICY) y el orden de dependencias (tablas antes que funciones que las usan).
3. **Actualizar el header del 999**: hoy dice "Equivale a correr 001 → 010" — debe decir el rango real (001→018, sin 017) y la fecha.
4. **Actualizar la documentación**: en `CLAUDE.md`, sección "Roadmap y deuda conocida", reemplazar la línea "**Drift conocido**: `999_FULL_SETUP.sql` NO incluye 015 ni 016..." por el estado nuevo (999 sincronizado hasta 018; en DB existente correr 011→018 en orden). En `briefs/README.md` NO tocar nada (es histórico).
5. Verificación: revisar el 999 resultante buscando objetos duplicados o referencias a tablas aún no creadas en el orden del archivo. No hay forma de correrlo acá — la validación es por lectura cuidadosa; anotar en el reporte cualquier duda.

Scope de archivos: `supabase/migrations/*`, `CLAUDE.md` (solo esa sección).
Commit sugerido: `chore(db): renombra 018 y sincroniza 999_FULL_SETUP hasta la 018`.

---

## AGENTE C — Limpieza de seguridad pre-deploy

1. **Borrar `src/app/setup-admin/` completo.** Es una página legacy que crea el usuario `admin@nbbarber.com` con password hardcodeada `admin123` vía signUp público — inaceptable en un deploy público. El flujo de acceso admin vigente es `/admin-login` (+ modo demo por env vars). Nada la referencia (verificado por grep, salvo robots).
2. `src/app/robots.ts`: quitar `"/setup-admin"` del array `disallow`.
3. **Barrido de seguridad ligero** (solo detección + fix de lo obvio):
   - `grep -rn "admin123\|nbbarber.com\|password.*=.*['\"]" src/ --include='*.ts*'` — no debe quedar ninguna credencial hardcodeada (las `NEXT_PUBLIC_DEMO_*` por env están BIEN, son intencionales).
   - Verificar que ninguna otra ruta pública permita signUp con rol elevado o toque `profiles.role` desde el cliente.
   - Verificar que `.env.local` esté en `.gitignore` y no trackeado (`git ls-files | grep env`).
4. En `CLAUDE.md`, quitar la frase "**Borrar `src/app/setup-admin/` antes de cualquier deploy público**..." de la sección Pendiente (ya no aplica tras este commit).
5. Verificación: `npm run build` (la ruta `/setup-admin` debe desaparecer del listado de rutas del build).

Scope de archivos: `src/app/setup-admin/` (borrar), `src/app/robots.ts`, `CLAUDE.md` (solo esa frase), y solo lo que surja del punto 3.
Commit sugerido: `fix(seguridad): elimina /setup-admin legacy con credenciales hardcodeadas`.

---

## AGENTE D — Cierre de la FASE 16: barridos mobile pendientes

El grueso de `briefs/FASE_16_mobile_first.md` ya se aplicó (zoom iOS, dvh, safe-area, dialogs, sheets — NO retrabajar eso). Falta el barrido sistemático por ruta (secciones 5, 6 y 8 del brief). Leé ese brief primero; este bloque es el remanente:

1. **Overflow horizontal, ruta por ruta**, en 375px y 320px. Con el dev server corriendo, por cada ruta de la checklist correr en consola:
   ```js
   document.scrollingElement.scrollWidth > window.innerWidth
   ```
   y si da true, encontrar al culpable con
   ```js
   [...document.querySelectorAll('*')].filter(el => el.scrollWidth > document.documentElement.clientWidth).map(el => ({ el, cls: el.className }))
   ```
   Rutas: `/`, `/reservar` (los 6 pasos completos — atención al stepper de 6 pasos y al grid de horarios del paso 5), `/tienda` + CartDrawer abierto, `/checkout`, `/lookbook`, `/contacto`, `/login`, `/register`, `/mi-cuenta`, `/admin-login`, `/admin/dashboard`, `/admin/citas`, `/admin/clientes`, `/admin/barberos` (+ dialog de horarios abierto), `/admin/caja`, `/admin/liquidaciones`, `/admin/configuracion`, `/barbero/mi-agenda`. Para el panel admin: si el login demo no funciona aún (el usuario demo puede no existir en Supabase), reportarlo y auditar esas rutas solo por lectura de código (anchos fijos, grids sin colapso).
   Fix preferido: elementos fluidos (`w-full max-w-[N]`, `flex-wrap`, `grid-cols-1 sm:grid-cols-N`) — NO `overflow-x-hidden` global.
2. **Stepper del wizard `/reservar`** en 375px: si los 6 pasos quedan ilegibles o desbordan, versión mobile compacta (solo círculos numerados + check, o indicador textual "Paso N de 6"), manteniendo el diseño actual en `md:+`.
3. **Campos enfocables**: verificación programática final en cada ruta con forms (login, register, reservar, checkout, contacto, admin dialogs):
   ```js
   [...document.querySelectorAll('input,textarea,select')].every(el => parseFloat(getComputedStyle(el).fontSize) >= 16)
   ```
   Corregir los que fallen con `text-base md:text-sm`.
4. **Touch targets**: mínimo ~44px efectivos en mobile para acciones de fila en tablas admin (botones icon `h-8 w-8` → área táctil con `p-2 -m-2` o `h-10 w-10 md:h-8 md:w-8`), links del footer, y el slider before/after de la home (probar drag táctil con device emulation).
5. Screenshots finales: wizard paso 2 y paso 5 en 375px, checkout en 375px, una tabla admin scrolleando horizontal en 375px.

Scope de archivos: páginas (`src/app/**/page.tsx`, `ContactoContent.tsx`) y componentes NO base (`src/components/{home,shop,layout,admin}/`). NO tocar `src/components/ui/*` ni `layout.tsx`/`globals.css`/`Header.tsx` (son de otros agentes); si un fix requiere tocar un componente base, anotarlo en el reporte para el agente E.
Commit sugerido: `fix(mobile): cierra barridos FASE 16 (overflow, stepper, touch targets)`.

---

## AGENTE E — Integrador / QA final (SECUENCIAL, corre cuando A-D terminaron)

1. `find .git -name '._*' -delete` y verificar que A-D commitearon (working tree limpio, `git log --oneline -6`).
2. **Auditoría del robustecimiento CRM del commit `daf08ff`** (la parte que nadie revisó): leer con ojo crítico `src/lib/crm.ts`, `src/lib/booking-errors.ts`, los diffs de `src/app/(main)/reservar/page.tsx`, `/admin/citas`, `/admin/clientes` y `/admin/mensajes` de ese commit, y la migración `018_crm_booking_hardening.sql`. Buscar específicamente: (a) guards/early-returns ANTES de hooks (crashea en runtime); (b) estados de citas/labels duplicados en vez de importados de `src/lib/constants.ts`; (c) textos al usuario en inglés o sin voseo; (d) llamadas a RPCs que la migración 018 define — anotar que la 018 debe correrse en la DB antes de probar esos flujos.
3. **Regresión cruzada**: `npm run build` y `npm run lint` sobre el resultado integrado de A+B+C+D.
4. **Smoke test en navegador, en tema claro Y oscuro** (el toggle ya debe existir de nuevo): home, wizard completo hasta el paso 5, chat IA (abrir, mandar un mensaje, verificar que el foco del input no rompe el layout), tour de la home, `/tienda` + carrito, `/admin-login` con tarjeta demo. En 375px y desktop.
5. Arreglar lo que encuentres (commits atómicos con prefijo `fix:`). Si algo es grande o dudoso, NO lo arregles: documentalo en el reporte final con archivo:línea y propuesta.
6. **Reporte final consolidado**: por agente, qué se hizo, commits resultantes, hallazgos de la auditoría del punto 2, y pendientes operativos para Mario (correr 017 y 018 en el SQL Editor; crear usuario demo si falta; vars `NEXT_PUBLIC_DEMO_*` en Vercel).

---

## RECORDATORIOS OPERATIVOS PARA MARIO (no son tareas de los agentes)

- Correr en el SQL Editor de Supabase, en orden: `017_fix_service_images.sql` y `018_crm_booking_hardening.sql` (si aún no corrieron).
- Crear `demo@nbbarber.uy` y promoverlo a admin (bloque B de `briefs/FASE_15_demo_polish.md`).
- Setear `NEXT_PUBLIC_DEMO_MODE` / `NEXT_PUBLIC_DEMO_ADMIN_EMAIL` / `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD` en Vercel.
