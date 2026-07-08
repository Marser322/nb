# FASE 24 — Polish: Dashboard admin

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que el dashboard responda las preguntas reales del dueño — ¿cómo viene el mes (vs el anterior)?, ¿quién viene hoy?, ¿qué se cae? — con datos honestos (sin gráficos decorativos que parecen datos) y KPIs que llevan a la acción.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + Supabase. UI en español (voseo uruguayo). El dashboard ya tiene la piel nueva de skins (FASE 23): clases `admin-kpi-card`, `admin-chip`, `admin-sparkline-*` etc. — NO tocar el sistema visual, solo el contenido/datos.

## Estado actual (anclas verificadas 2026-07-08)

Todo en `src/app/admin/dashboard/page.tsx` salvo indicación:

- **Sparklines decorativas que parecen datos**: `SPARKLINE_PATHS` son 5 paths SVG hardcodeados (`page.tsx:61-67`) que se pintan en cada KPI (`MiniSparkline`, `page.tsx:420-429`). Un dueño que "lee" la curva de Ingresos está viendo un dibujo fijo. Es el problema de honestidad #1 de la página.
- **KPIs sin contexto temporal**: "Citas este Mes: N" sin comparación contra el mes anterior; el `meta` de cada card es texto fijo ("Flujo de agenda", "Caja mensual", `page.tsx:196-243`).
- **`citasMes` cuenta TODO**: la query (`page.tsx:122`) no filtra por status — incluye canceladas y no-shows, inflando la métrica. En cambio ingresos sí usa `status=completed` (`page.tsx:124`).
- **Nada responde "¿qué se cae?"**: `cancelled` y `no_show` existen (`src/lib/constants.ts:44-50`) pero no hay ninguna métrica de caídas.
- **La agenda de hoy no dice QUIÉN viene**: el join trae service y barber pero no el cliente (`page.tsx:119`); la fila muestra servicio+barbero+hora (`page.tsx:377-410`). Para el dueño, el nombre del cliente es el dato central de "hoy".
- **KPIs no navegan**: las stat cards son estáticas; el patrón de link accionable ya existe en las CRM cards ("Ver todos" → `/admin/clientes?filtro=inactivos`, `src/components/admin/crm-cards.tsx:58-60`).
- Lo que ya está bien (no romper): rankings top servicios/barberos 90 días con agregación en memoria (`page.tsx:441-484`), reactivación de inactivos con WhatsApp (`crm-cards.tsx`), filtros sucursal/barbero de la agenda de hoy (`page.tsx:326-361`), gating de Ingresos por `finances.view` (`page.tsx:205-218`), invocación oportunista de `generate_subscription_appointments` (`page.tsx:93-99`), id `#admin-stats` usado por el tour (`page.tsx:282`).

## Análisis (máximo valor / qué NO se hace)

**Valor**: el dashboard ya tiene la forma correcta (KPIs + CRM + agenda); su techo es pasar de "números sueltos con decoración" a "lectura del negocio en 10 segundos": cada número comparado con el mes pasado, cada curva siendo un dato real, cada card llevando a donde se actúa, y la agenda diciendo quién viene.

**Fuera de alcance (anti-monstruo)**:
- NO librerías de charts (el SVG propio alcanza; ya existe `MiniSparkline`).
- NO filtros de rango de fechas custom ni cohortes/retención/ocupación de sillón (eso es "Analítica para el dueño", iniciativa #10 del `ROADMAP_CRECIMIENTO.md`).
- NO export CSV/PDF (ya listado en `REFINAMIENTO_roadmap.md`).
- NO tocar el sistema de skins ni las clases `admin-*` (recién estabilizadas en FASE 23).

## Trabajo — Base de datos

Ninguna migración (todo se calcula con queries sobre tablas existentes).

## Trabajo — App

### Bloque A — KPIs honestos y comparados

En `src/app/admin/dashboard/page.tsx`:

1. `citasMes`: filtrar `.not("status", "in", '("cancelled","no_show")')` (o `.in("status", [pending, confirmed, completed])`) para que mida agenda real.
2. Agregar al `Promise.all` las queries del **mes anterior** (mismo shape: count de citas válidas + ingresos completed entre `startOfMonth(subMonths(now,1))` y `endOfMonth(subMonths(now,1))`).
3. Nuevo KPI **"Caídas del mes"** (count de `cancelled` + `no_show` del mes): tone `red` si > 0. Reemplaza en la grilla al menos valioso actual o pasa la grilla a 6 columnas en 2xl (decidir por legibilidad en `xl:grid-cols-5`, `page.tsx:282`; aceptable `sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6`).
4. El `meta` de cada card pasa a ser el **delta vs mes anterior** cuando aplica: "+12% vs junio" / "−3 citas vs junio" (helper puro `formatDelta(actual, anterior)`; si el mes anterior fue 0, mostrar "— sin datos previos"). Color del chip acorde (positivo/negativo) usando los tonos ya existentes del sistema.
5. Ingresos: renombrar título a "Ingresos por servicios" (es lo que mide; no suma productos ni propinas — honestidad del label, no ampliar la métrica).

### Bloque B — Sparklines con datos reales

1. Nueva query liviana: citas de los últimos 14 días (`appointment_date >= hoy-13`, campos `appointment_date`, `status`, `service:services(price)`); con eso derivar DOS series diarias: citas válidas/día y revenue completed/día.
2. Helper puro `buildSparklinePath(values: number[], width=140, height=54): string` que normaliza la serie al viewBox y genera el path (líneas rectas o curva simple; sin dependencia nueva). Serie constante o vacía → línea plana baja.
3. `MiniSparkline` pasa a recibir `values: number[]` en vez de `variant`; eliminar `SPARKLINE_PATHS`. Mapear: Citas→serie de citas; Ingresos→serie de revenue; para KPIs sin serie temporal natural (nuevos, inactivos, stock, caídas) NO inventar: no renderizar sparkline (dejar la card más compacta) o mostrar la misma altura con un separador sutil — decisión: **sin sparkline** (un dibujo sin dato es el problema que estamos borrando).
4. Mantener las clases CSS `admin-sparkline-fill`/`admin-sparkline-line` (las tematizan los skins).

### Bloque C — Dashboard accionable + agenda con clientes

1. Cada stat card se envuelve en `Link` (`ROUTES` de `src/lib/constants.ts:236-239`): Citas→`ADMIN_CITAS`, Ingresos→`/admin/caja` (solo si `features.contabilidad`; si no, sin link), Nuevos→`ADMIN_CLIENTES`, Inactivos→`/admin/clientes?filtro=inactivos`, Stock→`ADMIN_PRODUCTOS`, Caídas→`ADMIN_CITAS`. Hover ya existente de `admin-kpi-card` + `cursor-pointer`; accesible (el link envuelve el card entero con aria-label).
2. Agenda de hoy: agregar `client:profiles(full_name)` al select (`page.tsx:119`) y mostrar el nombre del cliente como dato principal de la fila (servicio pasa a secundario junto al barbero). Citas walk-in sin perfil: "Walk-in / sin registro".
3. CTA "Gestionar agenda" (botón outline chico, patrón "Ver todos" de `crm-cards.tsx:58`) en el header de Agenda de Hoy → `ADMIN_CITAS`.

## Parte manual (Mario)

- Nada.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Con datos de demo: los deltas muestran comparación coherente con el mes anterior; el KPI Caídas cuenta canceladas+no-shows; las sparklines de Citas/Ingresos cambian si cambian los datos (verificar contra una cita completada nueva).
- Cada KPI navega a su sección; la agenda de hoy muestra nombres de clientes; el CTA lleva a Citas.
- Ambos temas, los 4 skins (las sparklines usan las clases tematizadas), 375px, y el tour (`#admin-stats` intacto).
- Si el dev server falla con "Failed to open database… invalid digit found in string": `rm -rf .next` + `find . -name '._*' -not -path './node_modules/*' -delete`.

## Criterios de aceptación

- Ninguna curva del dashboard es decorativa: o representa datos reales o no existe.
- "Citas este Mes" excluye canceladas/no-shows; existe métrica de caídas.
- Cada KPI compara contra el mes anterior (o dice que no hay datos previos).
- La agenda de hoy responde "¿quién viene?" con nombre de cliente.
- Todo KPI clickeable lleva a la sección donde se actúa.
- Rankings, reactivación, filtros, gating por permisos y tour siguen intactos.

## Restricciones

- Rama `feat/polish-dashboard`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks. El build no lo detecta; crashea en runtime.
- No agregar dependencias. No tocar `globals.css` ni el sistema de skins.
