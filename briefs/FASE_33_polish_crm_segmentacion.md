# FASE 33 — Polish: Clientes/CRM — segmentación y ficha con métricas

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-09).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que la lista de clientes deje de ser plana (ordenar, segmentar, cumpleaños) y que la ficha individual sintetice las métricas que hoy el admin suma de cabeza.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas)

- Lista: `src/app/admin/clientes/page.tsx` usa `fetchClientsOverviewPage` (`src/lib/crm.ts`) → RPC `get_clients_overview_page(p_search, p_inactive_only, p_inactive_days, p_limit, p_offset)` (`src/lib/supabase_schema.sql:1740-1831`), paginada (20/página) con `total_count OVER()`. **ORDER BY fijo** (`:1821-1824`): inactivos ASC o `last_visit DESC` — no se puede ordenar por gasto ni visitas; headers no clicables. Único segmento: `?filtro=inactivos` (`clientes/page.tsx:43`).
- `crm.ts` tiene fallback a la RPC legacy `get_clients_overview` si la paginada no existe (códigos `PGRST202`/`42883`) — al cambiar la firma de la RPC hay que preservar ese comportamiento.
- `profiles` (`supabase_schema.sql:45-53` + `notes` `:632` + `permissions` `:2432`): **no existe fecha de nacimiento** (grep `birth|cumple|nacimiento` en src+supabase: cero campos).
- Mi cuenta: el cliente solo edita `full_name` y `phone` (schema Zod `src/app/(main)/mi-cuenta/page.tsx:81-83`, update `:305-315`).
- Ficha `src/app/admin/clientes/[id]/page.tsx`: carga en paralelo perfil, `appointments`, `haircut_history`, `orders`, `communication_logs` (`:92-168`) pero **no calcula ninguna métrica agregada** — tabs con listados crudos (Citas `:340`, Cortes `:396`, Compras `:445`, Mensajes `:507`). Notas internas vía RPC `update_client_notes` (`:174-193`).
- Ganchos: `SendWhatsappDialog` con `eventType`/`templateVars` (FASE 30), `message_templates` con CHECK de 5 eventos (`supabase/migrations/022_message_templates.sql`), `isInactiveClient`/`INACTIVE_DAYS` (`src/lib/crm.ts`, `constants.ts`), `formatPrice` (`src/lib/utils.ts`), badges/cards de `admin/mensajes` como patrón visual.
- Numeración: migración libre siguiente para esta fase = **024** (la FASE 32 no usa DB).

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: el CRM ya junta todos los datos (citas, gasto, compras, historial) pero no responde las tres preguntas que un dueño se hace de verdad: *¿quiénes son mis mejores clientes?* (ordenar por gasto/visitas), *¿a quién debería escribirle hoy?* (segmentos: nuevos, en riesgo, cumpleaños del mes — cada uno con el WhatsApp a un click que ya existe), y *¿qué vale este cliente?* (métricas en la ficha: total gastado, visitas, ticket promedio, frecuencia, días desde la última). El cumpleaños es la palanca de retención más barata del rubro y hoy ni siquiera existe el campo. Todo se apoya en la RPC y el diálogo que ya están construidos.
- **Reutilización**: la RPC paginada ya calcula `total_spent`/`total_appointments`/`last_visit` — solo le faltan `ORDER BY` dinámico, filtros de segmento y `birth_date`; la ficha ya tiene todos los arrays cargados — las métricas se calculan en memoria sin ninguna query nueva; el envío por segmento es literalmente el `SendWhatsappDialog` existente fila por fila; la plantilla de cumpleaños entra al sistema de eventos de FASE 30 con un seed más.
- **Fuera de alcance en este ciclo (anti-monstruo)**:
  - NO envío masivo en un click a todo un segmento (sigue el patrón manual `wa.me` fila por fila; lo masivo está en roadmap ítem 17).
  - NO analítica avanzada (LTV, cohortes, churn score) — roadmap 3.10.
  - NO export CSV de clientes — se anota en roadmap.
  - NO automatización de saludos de cumpleaños (sin cron; el segmento + plantilla dejan todo a un click).
  - NO tocar `haircut_history` ni el rebook de mi-cuenta (FASE 22).
  - NO eliminar la RPC legacy `get_clients_overview` (el fallback de `crm.ts` la usa; solo se anota como deuda).

## Trabajo — Base de datos

1. Nueva migración `supabase/migrations/024_crm_segmentation.sql`, **idempotente**. NO aplicarla a la DB (la corre Mario en el SQL Editor, después de la 022/023). Replicar en `src/lib/supabase_schema.sql` y `supabase/migrations/999_FULL_SETUP.sql`.

Contenido:

- `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;` (nullable, opcional siempre).
- Reemplazar `get_clients_overview_page`: como cambia la firma, hacer `DROP FUNCTION IF EXISTS get_clients_overview_page(TEXT, BOOLEAN, INT, INT, INT);` y recrear con los parámetros nuevos **al final y con DEFAULT** para compatibilidad:
  - `p_sort TEXT DEFAULT 'recent'` → `recent` (last_visit DESC, actual), `spent` (total_spent DESC), `visits` (total_appointments DESC), `name` (full_name ASC). Validar valores en SQL (CASE) — nunca SQL dinámico.
  - `p_segment TEXT DEFAULT NULL` → `NULL` (todos), `'nuevos'` (created_at ≥ hoy − 30 días), `'inactivos'` (mismo criterio que `p_inactive_only`, que se mantiene por compatibilidad), `'cumple_mes'` (birth_date no nulo y `EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)`).
  - Agregar `birth_date DATE` al `RETURNS TABLE`.
  - Mantener `REVOKE ... FROM PUBLIC, anon` / `GRANT ... TO authenticated` con la firma nueva (`:1830-1831` como referencia).
- Plantilla de cumpleaños en el sistema de FASE 30 (guardado con `DO $$ ... IF EXISTS (tabla message_templates)` para no depender del orden en DBs viejas): extender el CHECK de `event_type` agregando `'birthday'` (DROP CONSTRAINT/ADD CONSTRAINT idempotente) + seed `WHERE NOT EXISTS`: `'¡Feliz cumpleaños, {nombre}! 🎉 De regalo, te esperamos en NB Barber para que arranques tu año con el mejor look. Reservá tu turno cuando quieras.'`
- Si la RLS de `profiles` no permite UPDATE de admin sobre otros perfiles (verificarlo en `supabase_schema.sql`), agregar RPC `admin_update_client_birth_date(p_client_id UUID, p_birth_date DATE)` SECURITY DEFINER con chequeo `is_admin()` (espejo del patrón `update_client_notes`).

## Trabajo — App

### Bloque A — Lista de clientes: orden + segmentos (`src/app/admin/clientes/page.tsx`, `src/lib/crm.ts`, `src/types/database.types.ts`)

1. `crm.ts`: extender `fetchClientsOverviewPage` con `sort` y `segment` (tipados con union types exportados); pasarlos a la RPC. El fallback legacy sigue funcionando: si cae en `get_clients_overview`, aplicar orden y segmento en memoria (nuevos por `created_at`; `cumple_mes` no disponible en legacy → lista vacía con aviso).
2. Tipos: `birth_date` en `Profile` y `ClientOverview`/`ClientOverviewPage`.
3. UI: fila de **chips de segmento** arriba de la tabla — Todos / Nuevos (30 días) / Inactivos / 🎂 Cumplen este mes — que setean `segment` y resetean página; el query param `?filtro=inactivos` existente mapea al chip Inactivos (no romper el link del dashboard/mensajes). Select "Ordenar por" (Más recientes / Mayor gasto / Más visitas / Nombre) o headers clicables — elegir UNO, el más simple con la tabla actual.
4. En el segmento de cumpleaños, el botón WhatsApp de cada fila abre `SendWhatsappDialog` con `eventType: "birthday"` (la plantilla seed de la migración); en los demás segmentos, comportamiento actual.
5. Labels de segmentos/orden en `constants.ts` (`CLIENT_SEGMENT_LABELS`, `CLIENT_SORT_LABELS`).

### Bloque B — Ficha del cliente con métricas (`src/app/admin/clientes/[id]/page.tsx`)

1. Card de **métricas** arriba de las tabs, calculadas en memoria de los arrays ya cargados (`:92-168`), estilo de las stat-cards del admin (`admin-agenda-stat` como referencia visual):
   - Total gastado (citas `completed` con precio del servicio + `orders` en `paid/shipped/delivered` — mismo criterio que la RPC `:1780-1788`).
   - Visitas completadas y ticket promedio (gastado / visitas, guard división por cero).
   - Frecuencia media (promedio de días entre citas completadas consecutivas; "—" con < 2 visitas).
   - Días desde la última visita, con el badge de inactivo (`isInactiveClient`).
2. **Cumpleaños en la ficha**: mostrar `birth_date` (formato `d 'de' MMMM` con locale es) en la tarjeta de contacto, editable por el admin con un input date + guardar (update directo si la RLS lo permite; si no, la RPC de la migración). Si cumple este mes, badge 🎂 y el botón WhatsApp de la ficha ofrece la plantilla `birthday`.
3. No tocar las tabs existentes ni el flujo de notas.

### Bloque C — El cliente carga su cumpleaños (`src/app/(main)/mi-cuenta/page.tsx`)

1. Campo opcional "Fecha de nacimiento" en el form de perfil: extender el schema Zod (`:81-83`) con `birth_date` opcional (validar fecha pasada razonable), defaultValues y el `.update()` (`:305-315`). Copy corto tipo "para sorprenderte en tu mes 🎁". El campo nunca es obligatorio y no bloquea nada si queda vacío.

## Parte manual (Mario)

- Correr `supabase/migrations/024_crm_segmentation.sql` en el SQL Editor **después** de la 022 y la 023 (pendientes de FASE 30/31).
- Cargar a mano el cumpleaños de 2-3 clientes reales (o desde la ficha) para ver el segmento vivo.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Prueba manual en navegador, ambos temas, y a 375px:
  1. Ordenar por "Mayor gasto" → el top gastador queda primero; paginación conserva el orden.
  2. Chip "Nuevos" → solo registrados en los últimos 30 días; chip "Inactivos" ≡ al viejo `?filtro=inactivos` (probar el link desde `/admin/mensajes`).
  3. Con un cliente con `birth_date` de este mes: chip "Cumplen este mes" lo lista y su WhatsApp abre la plantilla de cumpleaños con `{nombre}` resuelto; queda logueado en `communication_logs`.
  4. Ficha: métricas correctas contra los datos de las tabs (sumar a mano un caso); cliente sin visitas muestra guiones, no NaN.
  5. Editar cumpleaños desde la ficha y desde `/mi-cuenta` → persiste y se refleja en el segmento.
  6. Sin la migración aplicada (DB vieja): la lista sigue funcionando por el fallback legacy sin crashear (segmento cumpleaños muestra aviso, no error).

## Criterios de aceptación

- Lista ordenable por gasto/visitas/recencia/nombre y segmentable por Nuevos/Inactivos/Cumpleaños del mes, todo server-side vía la RPC extendida (fallback legacy operativo).
- `birth_date` existe en `profiles`, lo cargan el cliente (mi-cuenta) o el admin (ficha), y alimenta el segmento + plantilla `birthday` integrada al sistema de FASE 30.
- La ficha muestra total gastado, visitas, ticket promedio, frecuencia y días desde última visita sin queries nuevas.
- Labels en `constants.ts`; `?filtro=inactivos` sigue funcionando; migración espejada en `supabase_schema.sql` y `999_FULL_SETUP.sql`.

## Restricciones

- Rama `feat/polish-crm-segmentacion`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard (`if (!features.X) return`, `if (loading) return`) va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels viven en `src/lib/constants.ts` — no duplicar strings.
- La migración 024 debe ser idempotente, con `DROP FUNCTION` explícito por el cambio de firma, y NO aplicarse desde código.
- No tocar `src/app/admin/citas/page.tsx` ni páginas de barberos/sucursales (los está modificando la FASE 32 en paralelo).
