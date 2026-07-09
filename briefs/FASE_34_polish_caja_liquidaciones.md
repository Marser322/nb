# FASE 34 — Polish: Caja + liquidaciones (escenarios límite)

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-09).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que la caja aguante el día a día real (cierre de día con arqueo, anulación de errores de tipeo, egresos categorizados, auditoría de autor) y que la liquidación nunca "pierda" plata (citas completadas sin cobrar detectables y cobrables).

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas 2026-07-09)

- Caja = una sola página con dialog inline de ingreso/egreso manual (`src/app/admin/caja/page.tsx:560-662`), insert directo a `cash_movements` (`caja/page.tsx:299-306`). **No existe cierre de día, sesión ni arqueo** (la legacy `cash_register` fue dropeada por la migración 012).
- Los inserts manuales NO setean `created_by` (`caja/page.tsx:299-306`; ídem renta en `liquidaciones/page.tsx:260-268`); los RPCs sí (`created_by = auth.uid()`). Nadie muestra el autor en la UI.
- Egresos manuales forzados a `category='other'` (`caja/page.tsx:301`), aunque el CHECK de la 012 ya admite `supply/salary/rent/adjustment` y los labels existen (`src/lib/constants.ts:202-213`).
- Los buckets por método `cashPayments/transferPayments/cardPayments` se calculan (`caja/page.tsx:235-237`) pero **nunca se renderizan** (código muerto), y los pagos `other` no entran en ningún bucket → la suma por método no cierra contra el total.
- Validación de monto débil en el manual: `parseFloat` sin chequear NaN/≤0 (`caja/page.tsx:299,570-576`); `ChargeDialog` y los RPCs sí validan.
- **Zona horaria inconsistente**: caja filtra `created_at` en UTC crudo (`caja/page.tsx:156-157`) mientras `get_barber_settlement` cuenta por `AT TIME ZONE 'America/Montevideo'` (`supabase/migrations/012_accounting.sql:176`) → un cobro nocturno cae en días distintos entre caja y liquidación.
- Cobro de cita: `ChargeDialog` (`src/components/shared/ChargeDialog.tsx:75-91`) → RPC `complete_appointment_with_payment`. **OJO**: en `src/lib/supabase_schema.sql` hay DOS definiciones; la efectiva es la de `:1510-1565` (la de `:1177` es una copia vieja — cualquier edición va sobre la de `:1510`). Guard actual: solo `('pending','confirmed')` → `ESTADO_INVALIDO` (`:1541-1543`). Anti-doble-cobro sólido: índice único parcial `idx_cash_movements_appointment_service` (`:1173-1174`) + captura `unique_violation → YA_COBRADA` (`:1553`).
- Liquidación: preview `get_barber_settlement` (`supabase_schema.sql:1244-1303`) suma SOLO `cash_movements`; cierre persistido en `barber_settlements` con EXCLUDE anti-solape (`:1326`); `close_barber_settlement` (`:1336-1374`).
- **Gap principal**: una cita `completed` sin cobro (pasa con `features.contabilidad` OFF vía botones "Completar" en `citas/page.tsx:1020-1026` y `mi-agenda/page.tsx:472-476`, o vía `admin_update_appointment_status`, `schema:1570-1603`) es **invisible** para la liquidación, y el guard de estado impide cobrarla después.
- `rental_due` se calcula y muestra (`liquidaciones/page.tsx:500-504`) pero no se compara con la renta efectivamente cobrada (`category='chair_rental'`) — flujos desconectados.
- FASE 32 dejó un patrón reutilizable de banner ámbar + query liviana (`loadOverdueAppointments` en `citas/page.tsx:157-176` y render ~`:790-830`).

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: el dueño cierra el día contando el efectivo y viendo la diferencia; un error de tipeo se anula con rastro (contra-asiento) en dos clics; cada peso tiene autor y categoría; y ninguna cita completada queda sin cobrar sin que nadie se entere.
- **Fuera de alcance en este ciclo (anti-monstruo)**:
  - NO marcar movimientos con `settlement_id` ni conciliación de períodos (un cobro tardío cae naturalmente en el próximo período por `created_at` — es diseño, no bug).
  - NO reconciliación de deuda de renta (`rental_due` acumulado); solo mostrar "renta cobrada" junto al adeudado.
  - NO sesiones de caja, fondo de apertura, cierre por turno ni cierre multi-sucursal (una fila por fecha; se documenta la asunción single-branch).
  - NO edición de movimientos (solo anulación por contra-asiento); NO anular cobros de citas ni pagos de liquidación; NO reabrir liquidaciones cerradas.
  - NO export CSV ni filtros nuevos por barbero/método (→ roadmap).
  - NO categorías ni métodos de pago nuevos (el CHECK de la 012 queda intacto); NO tocar el índice anti-doble-cobro ni el EXCLUDE de `barber_settlements`; NO tocar políticas RLS existentes.

## Trabajo — Base de datos

1. Nueva migración `supabase/migrations/025_caja_cierre_escenarios.sql`, **idempotente** (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS). NO aplicarla a la DB (la corre Mario en el SQL Editor). Replicar en `src/lib/supabase_schema.sql` y `supabase/migrations/999_FULL_SETUP.sql`. Contenido:

   **(a) Tabla `cash_closures`** (arqueo-snapshot, sin sesiones):
   ```sql
   CREATE TABLE IF NOT EXISTS cash_closures (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     closure_date DATE NOT NULL UNIQUE,
     expected_cash NUMERIC(10,2) NOT NULL,   -- ingresos cash - egresos cash del día (TZ Montevideo)
     counted_cash NUMERIC(10,2) NOT NULL,
     difference NUMERIC(10,2) NOT NULL,      -- counted - expected
     total_income NUMERIC(10,2) NOT NULL DEFAULT 0,
     total_expense NUMERIC(10,2) NOT NULL DEFAULT 0,
     movements_count INT NOT NULL DEFAULT 0,
     notes TEXT,
     created_by UUID REFERENCES auth.users(id),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
   RLS habilitada + política admin-only (patrón `is_admin()` de `012_accounting.sql:26-28`). Sin política para barberos.

   **(b) RPC `close_cash_day(p_date DATE, p_counted_cash NUMERIC, p_notes TEXT DEFAULT NULL) RETURNS JSONB`** — SECURITY DEFINER, `SET search_path = public`. Guards con códigos EN (estilo del repo): `NO_AUTORIZADO` (si no `is_admin()`), `MONTO_INVALIDO` (NULL o < 0), `FECHA_FUTURA` (`p_date > (now() AT TIME ZONE 'America/Montevideo')::date`), `DIA_YA_CERRADO` (capturar `unique_violation` del UNIQUE de `closure_date`). Calcula totales server-side con el MISMO predicado TZ que la liquidación: `(created_at AT TIME ZONE 'America/Montevideo')::date = p_date`. `expected_cash` = ingresos − egresos con `payment_method='cash'`. Devuelve la fila como jsonb. `REVOKE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated` (patrón `012:140-141`).

   **(c) RPC `void_cash_movement(p_movement_id UUID, p_reason TEXT) RETURNS UUID`** — anulación por contra-asiento, solo movimientos manuales. Guards: `NO_AUTORIZADO`; `MOVIMIENTO_NO_EXISTE`; `MOVIMIENTO_DE_CITA` si `appointment_id IS NOT NULL`; `MOVIMIENTO_DE_LIQUIDACION` si `category = 'settlement'` O existe `barber_settlements.payout_movement_id = p_movement_id`; `YA_ANULADO` si ya existe contra-asiento. Inserta el inverso: `type` invertido, `category = 'adjustment'`, mismo `amount`/`payment_method`/`barber_id`/`branch_id`, `reference_id = p_movement_id`, `description = 'Anulación: ' || COALESCE(p_reason, descripción original)`, `created_by = auth.uid()`. **Nunca DELETE.** Race-safe con índice único parcial (capturar `unique_violation` → `YA_ANULADO`):
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_void_once
     ON cash_movements(reference_id) WHERE category = 'adjustment' AND reference_id IS NOT NULL;
   ```

   **(d) Cobro retroactivo**: `CREATE OR REPLACE FUNCTION complete_appointment_with_payment(...)` copiando la definición **efectiva** (`src/lib/supabase_schema.sql:1510-1565` — NO la copia vieja de `:1177`) con UN solo cambio: el guard pasa a `IF v_apt.status NOT IN ('pending','confirmed','completed') THEN RAISE EXCEPTION 'ESTADO_INVALIDO';` (`cancelled`/`no_show` siguen bloqueadas). Comentario SQL obligatorio: el doble cobro sigue imposible por `idx_cash_movements_appointment_service`; el UPDATE a `completed` es no-op idempotente y el trigger de `haircut_history` ya es idempotente (`schema:1489-1507`). En el espejo `supabase_schema.sql`, editar la definición de `:1510` (dejar la duplicada vieja de `:1177` como está o eliminarla con nota — pero NO editarla creyendo que es la efectiva).

   **(e) RPC `get_uncharged_completed_appointments(p_barber_id UUID, p_from DATE, p_to DATE) RETURNS TABLE(...)`** — STABLE, SECURITY DEFINER, guard `is_admin() OR p_barber_id = current_barber_id()`. Anti-join:
   ```sql
   WHERE a.status = 'completed' AND a.barber_id = p_barber_id
     AND a.appointment_date BETWEEN p_from AND p_to
     AND NOT EXISTS (SELECT 1 FROM cash_movements cm
                     WHERE cm.appointment_id = a.id AND cm.category = 'service')
   ```
   Devuelve: id, fecha, hora, nombre de cliente (perfil o guest), nombre del servicio y precio de lista.

   **(f) `get_barber_settlement`**: `CREATE OR REPLACE` agregando UN solo campo nuevo al jsonb de salida: `rental_paid` = `COALESCE(SUM(amount) FILTER (WHERE category = 'chair_rental'), 0)` en el mismo SELECT existente (`012:170-176`). Ningún cálculo existente cambia; los snapshots de `barber_settlements` son inmutables y no se recalculan.

## Trabajo — App

### Bloque A — Migración 025 + correctitud de caja (primero, obligatorio)

1. Escribir la migración 025 completa (a-f) + espejos en `999_FULL_SETUP.sql` y `src/lib/supabase_schema.sql`.
2. `src/app/admin/caja/page.tsx`:
   - **TZ**: reemplazar el filtro de fechas (`:156-157`) por rangos con offset fijo: `` `${startDate}T00:00:00-03:00` `` / `` `${endDate}T23:59:59.999-03:00` ``, con comentario: "Uruguay sin DST desde 2015; debe coincidir con America/Montevideo de get_barber_settlement". Prohibido date-fns-tz o `toISOString()` UTC para esto.
   - **Movimiento manual**: agregar `created_by` (de `supabase.auth.getUser()`) al insert (`:299-306`); para egresos, quitar el hardcode `'other'` (`:301`) y ofrecer Select de categoría (`supply/salary/rent/adjustment/other`) usando `CASH_CATEGORY_LABELS` de `constants.ts`; validar monto con patrón de `liquidaciones/page.tsx:244-246` (`isNaN || <= 0` → toast) y `min="0.01"` en el Input (`:570`).
   - **Desglose por método**: renderizar los buckets ya calculados (`:235-237`) como strip compacto Efectivo / Transferencia / Tarjeta / Otro (agregar bucket `other`) para que la suma cierre contra los ingresos. Usar `PAYMENT_METHOD_LABELS`.
   - **Autor visible**: la FK de `created_by` apunta a `auth.users` → PostgREST NO puede embeber `profiles`; hacer segunda query `profiles.select('id, full_name').in('id', creatorIds)` y mapear en memoria. Columna "Por" en la tabla de movimientos ("—" si NULL, los históricos no tienen autor).
   - **Anulación**: exponer `appointment_id`/`reference_id`/`category` en la interfaz `Transaction` (`:71-79`); botón de anular por fila SOLO si es movimiento manual (sin `appointment_id`, categoría ≠ `settlement`, no es ya un contra-asiento); confirm dialog con motivo → `rpc('void_cash_movement')`; mapear códigos de error a toasts en voseo; Badge distintivo para fila anulada y su contra-asiento.
3. `src/app/admin/liquidaciones/page.tsx`: agregar `created_by` al insert de renta (`:260-268`).
4. Tipos nuevos en `src/types/database.types.ts`: `CashClosure`, `UnchargedAppointment`; agregar `rental_paid: number` a `SettlementPreview` (`:205+`, backward-compatible: solo campo nuevo, ninguno renombrado).

### Bloque B — Cierre de día en caja (requiere A)

En `src/app/admin/caja/page.tsx`:
1. Botón "Cerrar caja del día", habilitado solo cuando el rango seleccionado es de un único día.
2. Dialog de cierre: efectivo esperado (client-side, con los datos ya cargados — solo `payment_method='cash'`), input de efectivo contado, diferencia calculada en vivo y coloreada (verde 0 / ámbar sobrante / rojo faltante — con tokens de tema, p. ej. `text-emerald-500`/`text-amber-500`/`text-destructive` según convención del archivo), notas opcionales → `rpc('close_cash_day')`.
3. Si el día ya tiene cierre (query a `cash_closures` por `closure_date`): card resumen (esperado / contado / diferencia / quién cerró / notas) en lugar del botón, con badge ámbar "Hubo movimientos después del cierre" si el `expected_cash` persistido ≠ el recomputado actual.
4. Mapear errores del RPC (`DIA_YA_CERRADO`, `FECHA_FUTURA`, `MONTO_INVALIDO`, `NO_AUTORIZADO`) a toasts en voseo.

### Bloque C — Liquidaciones: citas sin cobrar + cobro retroactivo (requiere A; independiente de B)

En `src/app/admin/liquidaciones/page.tsx`:
1. Al cargar el preview (`loadPreview`, `:138`), llamar también a `get_uncharged_completed_appointments` con el mismo barbero/período.
2. Si N > 0: banner ámbar (patrón visual exacto de FASE 32 en `citas/page.tsx:790-830`): "Hay N citas completadas sin cobrar en este período — NO están incluidas en esta liquidación", con lista (fecha, cliente, servicio, precio de lista) y botón "Cobrar ahora" por cita.
3. "Cobrar ahora" abre `ChargeDialog` **reutilizado tal cual** (sus mensajes de error `:83-91` ya cubren `YA_COBRADA`/`ESTADO_INVALIDO`/`NO_AUTORIZADO`); `onSuccess` → `loadPreview()` + recargar la lista de sin-cobrar. Copy obligatorio en el banner/dialog: "El cobro se registra en la caja de hoy" (por `created_at`, un cobro retroactivo entra al período actual — es diseño, no bug).
4. `handleCloseSettlement` (`:202`): si hay citas sin cobrar, confirm previo: "¿Cerrar igual? Esas citas quedarán para el próximo período".
5. Mostrar "Renta cobrada en el período" junto al `rental_due` existente (`:500-504`) usando el nuevo `rental_paid` del preview.

## Parte manual (Mario)

- Correr `supabase/migrations/025_caja_cierre_escenarios.sql` en el SQL Editor de Supabase (dev y, cuando toque, prod).

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Prueba manual en navegador, ambos temas y a 375px:
  1. Registrar egreso con categoría "Insumos" → aparece con label correcto y autor.
  2. Anular un movimiento manual → aparece contra-asiento `adjustment` con referencia; anularlo de nuevo → toast `YA_ANULADO`; un movimiento de cita NO ofrece anular.
  3. Cerrar caja del día con efectivo contado ≠ esperado → card con diferencia coloreada; reintentar cierre → `DIA_YA_CERRADO`.
  4. Completar una cita con `contabilidad` OFF, encender el flag, ir a liquidaciones → banner de citas sin cobrar → "Cobrar ahora" cobra y el preview se actualiza; cobrarla dos veces → `YA_COBRADA`.
  5. Desglose por método suma igual al total de ingresos (incluye "Otro").

## Criterios de aceptación

- Cierre de día persistido con esperado/contado/diferencia y autor; un solo cierre por fecha.
- Todo movimiento manual nuevo tiene `created_by` y categoría real; el autor se ve en la tabla.
- Anulación solo por contra-asiento, solo para manuales, idempotente.
- Citas completadas sin cobrar visibles en liquidaciones y cobrables retroactivamente sin posibilidad de doble cobro.
- Caja y liquidación cuentan el mismo "día" (Montevideo).
- `rental_paid` visible junto a `rental_due` sin cambiar ningún cálculo existente.

## Restricciones

- Rama `feat/polish-caja-liquidaciones` desde `refinamiento-pre-demo`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard (`if (!features.X) return`, `if (loading) return`) va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels de citas, órdenes y caja viven en `src/lib/constants.ts` — no duplicar strings.
- NO aplicar migraciones a la DB ni correr `supabase db push`.
- NO tocar: índice `idx_cash_movements_appointment_service`, EXCLUDE de `barber_settlements`, `close_barber_settlement`, políticas RLS existentes, CHECKs de categorías/métodos.
