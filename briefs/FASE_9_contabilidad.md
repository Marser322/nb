# FASE 9 — Contabilidad: cobros, comisiones, renta de sillón y propinas

> Leer primero `briefs/README.md`. **Requiere Fase 7 aplicada** (btree_gist de 009, que reutiliza el EXCLUDE de liquidaciones). Independiente de la Fase 8.

## Contexto

La caja actual (`/admin/caja`) suma ingresos **infiriendo** desde `appointments` completadas ("asumimos efectivo por defecto", `caja/page.tsx:181`) y `orders`, más movimientos manuales. No existe: registro real del cobro de cada cita (método de pago, monto final, propina), compensación por barbero ni liquidaciones.

**Drift confirmado (bug activo)**: los CHECKs de `cash_movements` son códigos en inglés (`income/expense`, `cash/card/transfer/other`) pero `admin/caja/page.tsx` inserta `'ingreso'/'egreso'` y `'efectivo'/'transferencia'/'tarjeta'` → el registro manual viola el CHECK contra la DB real. **Decisión: canonizar los códigos en inglés** (los de los CHECKs) y mapear labels en español vía `src/lib/constants.ts` (patrón de `APPOINTMENT_STATUS_LABELS`).

**Modelos de compensación** (estándar del rubro, decisión de producto):

| Modelo | Cómo funciona | Barbero cobra |
|---|---|---|
| `commission` | La barbería retiene un % (splits típicos 40/60 a 70/30) | `servicios × commission_pct` |
| `chair_rental` | Renta fija semanal/mensual del sillón; barbero independiente | 100 % de sus servicios; debe la renta |
| `hybrid` | Renta reducida + comisión | comisión + debe la renta |
| `employee` | Sueldo fijo; todo el servicio es de la casa | 0 del servicio (sueldo aparte) |

Las **propinas son siempre 100 % del barbero** (por construcción: nunca entran a la base comisionable).

Flujo de cobro decidido: al marcar una cita como **Completada** (tanto el barbero en `/barbero/mi-agenda` como el admin en `/admin/citas`) se abre un **diálogo de cobro**: monto final (prellenado con el precio del servicio, editable), método de pago y propina opcional. Todo queda en `cash_movements`.

## Tareas

### 1. Migración `supabase/migrations/012_accounting.sql`

Crear (header manual como 005/006) y replicar en `src/lib/supabase_schema.sql` y `999_FULL_SETUP.sql`. **Antes de aplicar**: verificar contra la DB real los CHECKs vigentes de `cash_movements` (`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'cash_movements'::regclass`) y si `cash_register` tiene filas (`SELECT count(*) FROM cash_register`).

```sql
-- =============================================================
-- 012 — Contabilidad: compensación por barbero, cobro de citas,
-- propinas y liquidaciones. Ejecutar a mano en el SQL Editor
-- (requiere 009 por btree_gist).
-- =============================================================

-- 1. Compensación por barbero, con vigencia histórica: la UI siempre
--    INSERTA una fila nueva (nunca UPDATE) — la liquidación de un período
--    usa la fila vigente a esa fecha.
CREATE TYPE compensation_model AS ENUM ('commission', 'chair_rental', 'hybrid', 'employee');

CREATE TABLE IF NOT EXISTS barber_compensation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  model compensation_model NOT NULL DEFAULT 'commission',
  commission_pct NUMERIC(5,2) CHECK (commission_pct BETWEEN 0 AND 100), -- % que gana el BARBERO
  rental_amount NUMERIC(10,2),
  rental_period TEXT CHECK (rental_period IN ('weekly', 'monthly')),
  salary_amount NUMERIC(10,2),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (barber_id, effective_from)
);
ALTER TABLE barber_compensation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage compensation" ON barber_compensation;
CREATE POLICY "Admins manage compensation" ON barber_compensation
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Barbers view own compensation" ON barber_compensation;
CREATE POLICY "Barbers view own compensation" ON barber_compensation
  FOR SELECT USING (barber_id = current_barber_id());

-- 2. Extender cash_movements para atribuir movimientos a barbero/cita
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS barber_id UUID REFERENCES barbers(id);
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_barber ON cash_movements(barber_id, created_at);

-- Normalización defensiva de datos legados en español (si los hubiera)
UPDATE cash_movements SET type = CASE type
  WHEN 'ingreso' THEN 'income' WHEN 'egreso' THEN 'expense' ELSE type END;
UPDATE cash_movements SET payment_method = CASE payment_method
  WHEN 'efectivo' THEN 'cash' WHEN 'tarjeta' THEN 'card'
  WHEN 'transferencia' THEN 'transfer' ELSE payment_method END;

-- Categorías nuevas: chair_rental (renta cobrada al barbero) y
-- settlement (pago de liquidación al barbero)
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_category_check;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_category_check
  CHECK (category IN ('service', 'product', 'tip', 'adjustment', 'supply',
                      'salary', 'rent', 'chair_rental', 'settlement', 'other'));

-- El barbero ve sus propios movimientos (escribe solo vía RPC)
DROP POLICY IF EXISTS "Barbers view own movements" ON cash_movements;
CREATE POLICY "Barbers view own movements" ON cash_movements
  FOR SELECT USING (barber_id = current_barber_id());

-- 3. Migrar la tabla legacy cash_register (sin referencias en src/) y borrarla.
--    Correr primero: SELECT count(*) FROM cash_register; — probablemente 0.
INSERT INTO cash_movements (type, category, amount, payment_method, description,
                            barber_id, created_at)
SELECT 'income', 'service', cr.amount,
  CASE cr.payment_type WHEN 'efectivo' THEN 'cash'
                       WHEN 'transferencia' THEN 'transfer' ELSE 'other' END,
  'Migrado de cash_register', cr.barber_id,
  COALESCE(cr.created_at, cr.register_date::timestamptz)
FROM cash_register cr;
DROP POLICY IF EXISTS "Admins manage cash register" ON cash_register;
DROP TABLE IF EXISTS cash_register;

-- Anti doble cobro: una cita tiene a lo sumo UN movimiento de servicio.
-- (Se crea después de la migración de datos; appointment_id de las filas
-- migradas quedó NULL así que no puede chocar.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_appointment_service
  ON cash_movements(appointment_id) WHERE category = 'service';

-- 4. RPC de cobro al completar cita (barbero dueño o admin)
CREATE OR REPLACE FUNCTION complete_appointment_with_payment(
  p_appointment_id UUID,
  p_final_amount NUMERIC,
  p_payment_method TEXT,
  p_tip_amount NUMERIC DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
BEGIN
  IF p_final_amount IS NULL OR p_final_amount < 0 THEN
    RAISE EXCEPTION 'MONTO_INVALIDO';
  END IF;
  IF p_tip_amount IS NULL OR p_tip_amount < 0 THEN
    RAISE EXCEPTION 'PROPINA_INVALIDA';
  END IF;
  IF p_payment_method NOT IN ('cash', 'card', 'transfer', 'other') THEN
    RAISE EXCEPTION 'METODO_INVALIDO';
  END IF;

  SELECT a.id, a.status, a.barber_id, b.branch_id AS barber_branch_id
  INTO v_apt
  FROM appointments a
  JOIN barbers b ON b.id = a.barber_id
  WHERE a.id = p_appointment_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN RAISE EXCEPTION 'CITA_NO_ENCONTRADA'; END IF;
  IF NOT (is_admin() OR v_apt.barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END IF;

  UPDATE appointments SET status = 'completed' WHERE id = p_appointment_id;

  BEGIN
    INSERT INTO cash_movements (type, category, amount, payment_method,
      description, barber_id, appointment_id, branch_id, created_by)
    VALUES ('income', 'service', p_final_amount, p_payment_method,
      'Cobro de cita', v_apt.barber_id, p_appointment_id,
      v_apt.barber_branch_id, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'YA_COBRADA';
  END;

  IF p_tip_amount > 0 THEN
    INSERT INTO cash_movements (type, category, amount, payment_method,
      description, barber_id, appointment_id, branch_id, created_by)
    VALUES ('income', 'tip', p_tip_amount, p_payment_method,
      'Propina', v_apt.barber_id, p_appointment_id,
      v_apt.barber_branch_id, auth.uid());
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION complete_appointment_with_payment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_appointment_with_payment TO authenticated;

-- 5. Liquidación por barbero y período: cálculo on-the-fly sobre
--    cash_movements (eventos inmutables con el monto realmente cobrado —
--    estable ante cambios de precios en services).
CREATE OR REPLACE FUNCTION get_barber_settlement(
  p_barber_id UUID, p_from DATE, p_to DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp RECORD;
  v_model compensation_model;
  v_services NUMERIC := 0;
  v_tips NUMERIC := 0;
  v_count BIGINT := 0;
  v_barber_total NUMERIC := 0;
  v_house_total NUMERIC := 0;
  v_rental_due NUMERIC := 0;
BEGIN
  IF NOT (is_admin() OR p_barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_comp FROM barber_compensation
  WHERE barber_id = p_barber_id AND effective_from <= p_to
  ORDER BY effective_from DESC LIMIT 1;
  -- Sin configuración: commission 0 % (todo para la casa); la UI avisa.
  v_model := COALESCE(v_comp.model, 'commission'::compensation_model);

  SELECT COALESCE(SUM(amount) FILTER (WHERE category = 'service'), 0),
         COALESCE(SUM(amount) FILTER (WHERE category = 'tip'), 0),
         COUNT(*) FILTER (WHERE category = 'service')
  INTO v_services, v_tips, v_count
  FROM cash_movements
  WHERE barber_id = p_barber_id AND type = 'income'
    AND (created_at AT TIME ZONE 'America/Montevideo')::date BETWEEN p_from AND p_to;

  IF v_model = 'commission' THEN
    v_barber_total := round(v_services * COALESCE(v_comp.commission_pct, 0) / 100, 2);
    v_house_total := v_services - v_barber_total;
  ELSIF v_model = 'chair_rental' THEN
    v_barber_total := v_services;
    v_house_total := 0;
    v_rental_due := COALESCE(v_comp.rental_amount, 0);
  ELSIF v_model = 'hybrid' THEN
    v_barber_total := round(v_services * COALESCE(v_comp.commission_pct, 0) / 100, 2);
    v_house_total := v_services - v_barber_total;
    v_rental_due := COALESCE(v_comp.rental_amount, 0);
  ELSE -- employee
    v_barber_total := 0;
    v_house_total := v_services;
  END IF;

  -- Propinas: siempre 100 % del barbero, fuera de la base comisionable
  v_barber_total := v_barber_total + v_tips;

  RETURN jsonb_build_object(
    'barber_id', p_barber_id, 'from', p_from, 'to', p_to,
    'model', v_model, 'commission_pct', v_comp.commission_pct,
    'rental_amount', v_comp.rental_amount, 'rental_period', v_comp.rental_period,
    'salary_amount', v_comp.salary_amount,
    'services_total', v_services, 'tips_total', v_tips,
    'appointments_count', v_count, 'rental_due', v_rental_due,
    'barber_total', v_barber_total, 'house_total', v_house_total,
    'has_compensation', v_comp.id IS NOT NULL
  );
END; $$;

REVOKE EXECUTE ON FUNCTION get_barber_settlement FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_barber_settlement TO authenticated;

-- 6. Cierre de liquidación: snapshot inmutable + anti doble pago.
--    El EXCLUDE con daterange (btree_gist de 009) hace IMPOSIBLE liquidar
--    dos veces períodos solapados del mismo barbero.
CREATE TABLE IF NOT EXISTS barber_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES barbers(id),
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  model compensation_model NOT NULL,
  services_total NUMERIC(10,2) NOT NULL,
  tips_total NUMERIC(10,2) NOT NULL,
  commission_pct NUMERIC(5,2),
  rental_amount NUMERIC(10,2),
  barber_total NUMERIC(10,2) NOT NULL,
  house_total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'paid')),
  payout_movement_id UUID REFERENCES cash_movements(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (period_to >= period_from),
  EXCLUDE USING gist (barber_id WITH =, daterange(period_from, period_to, '[]') WITH &&)
);
ALTER TABLE barber_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage settlements" ON barber_settlements;
CREATE POLICY "Admins manage settlements" ON barber_settlements
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Barbers view own settlements" ON barber_settlements;
CREATE POLICY "Barbers view own settlements" ON barber_settlements
  FOR SELECT USING (barber_id = current_barber_id());

CREATE OR REPLACE FUNCTION close_barber_settlement(
  p_barber_id UUID, p_from DATE, p_to DATE,
  p_register_payout BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v JSONB;
  v_settlement_id UUID;
  v_movement_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'NO_AUTORIZADO'; END IF;

  v := get_barber_settlement(p_barber_id, p_from, p_to);

  IF p_register_payout AND (v->>'barber_total')::numeric > 0 THEN
    INSERT INTO cash_movements (type, category, amount, payment_method,
      description, barber_id, created_by)
    VALUES ('expense', 'settlement', (v->>'barber_total')::numeric, 'cash',
      'Liquidación ' || p_from || ' a ' || p_to, p_barber_id, auth.uid())
    RETURNING id INTO v_movement_id;
  END IF;

  BEGIN
    INSERT INTO barber_settlements (barber_id, period_from, period_to, model,
      services_total, tips_total, commission_pct, rental_amount,
      barber_total, house_total, status, payout_movement_id, created_by)
    VALUES (p_barber_id, p_from, p_to, (v->>'model')::compensation_model,
      (v->>'services_total')::numeric, (v->>'tips_total')::numeric,
      (v->>'commission_pct')::numeric, (v->>'rental_amount')::numeric,
      (v->>'barber_total')::numeric, (v->>'house_total')::numeric,
      CASE WHEN p_register_payout THEN 'paid' ELSE 'closed' END,
      v_movement_id, auth.uid())
    RETURNING id INTO v_settlement_id;
  EXCEPTION WHEN exclusion_violation THEN
    -- El RAISE revierte también el movimiento de egreso (misma tx)
    RAISE EXCEPTION 'PERIODO_YA_LIQUIDADO';
  END;

  RETURN v_settlement_id;
END; $$;

REVOKE EXECUTE ON FUNCTION close_barber_settlement FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_barber_settlement TO authenticated;
```

La **renta cobrada al barbero** se registra desde la UI como movimiento manual `type='income'`, `category='chair_rental'`, con `barber_id` — así la caja distingue ingresos por servicios vs por renta de sillón, y el detalle del barbero muestra rentas pagadas vs `rental_due`.

### 2. Constantes y tipos

- `src/lib/constants.ts`: labels en español para códigos canónicos — `CASH_MOVEMENT_TYPE_LABELS` (`income` → "Ingreso", `expense` → "Egreso"), `PAYMENT_METHOD_LABELS` (`cash` → "Efectivo", `card` → "Tarjeta", `transfer` → "Transferencia", `other` → "Otro"), `CASH_CATEGORY_LABELS` (incluye `tip` → "Propina", `chair_rental` → "Renta de sillón", `settlement` → "Liquidación"), `COMPENSATION_MODEL_LABELS` (`commission` → "Comisión", `chair_rental` → "Renta de sillón", `hybrid` → "Híbrido", `employee` → "Empleado"). `ROUTES.ADMIN_LIQUIDACIONES = '/admin/liquidaciones'`.
- `src/types/database.types.ts`: tipos `BarberCompensation`, `BarberSettlement`, `SettlementPreview` (retorno del RPC); alinear `CashMovement` con el schema real (códigos EN + `barber_id`/`appointment_id`); **eliminar** la interface muerta `CashRegister`.

### 3. Diálogo de cobro — `src/components/shared/ChargeDialog.tsx` (nuevo)

Props: `{ appointment, onSuccess }`. Contenido: monto final (Input numérico prellenado con `service.price`), método de pago (Select con `PAYMENT_METHOD_LABELS`), propina (Input numérico, default 0, con hint "100 % para el barbero"). Al confirmar → `supabase.rpc('complete_appointment_with_payment', {...})`; errores `YA_COBRADA`/`ESTADO_INVALIDO`/`NO_AUTORIZADO` a toasts en español. Estética Dialog shadcn + tokens del tema.

Integración (reemplaza el update directo a `status='completed'`):
- `src/app/barbero/mi-agenda/page.tsx`: el botón "Completar" abre el ChargeDialog.
- `src/app/admin/citas/page.tsx`: ídem en la acción de completar.

### 4. Caja — `src/app/admin/caja/page.tsx`

- Los ingresos por **servicios** salen de `cash_movements` (`category='service'`) en lugar de inferirse de `appointments` completadas — desaparece el "asumimos efectivo". Las órdenes de tienda se mantienen como hoy.
- Reemplazar todos los literales `'ingreso'/'egreso'/'efectivo'/...` por los códigos canónicos EN + labels de `constants.ts` (esto arregla el insert manual roto contra el CHECK).
- Agregar al resumen: total de **propinas** del período y desglose de ingresos **por barbero** (tabla simple: barbero / servicios / propinas / total).
- En el diálogo de movimiento manual: incluir las categorías nuevas (`chair_rental` con Select de barbero obligatorio).

### 5. Compensación por barbero — `src/app/admin/barberos/page.tsx`

Sección "Compensación" en el Dialog de editar barbero (o Dialog aparte por fila): muestra la configuración vigente (`barber_compensation` con mayor `effective_from`) y form para registrar una nueva (Select modelo, campos condicionales: `commission_pct` para commission/hybrid, `rental_amount` + `rental_period` para chair_rental/hybrid, `salary_amount` para employee, `effective_from` default hoy). **Siempre INSERT**, nunca UPDATE — mantener historial visible (lista de vigencias anteriores).

### 6. Liquidaciones — `src/app/admin/liquidaciones/page.tsx` (nueva)

- Filtros: Select de barbero + rango de fechas (reusar el DateRangePicker de caja; presets "Esta semana" / "Este mes" según `rental_period`).
- Preview con `rpc('get_barber_settlement')`: Cards con servicios, propinas, % o renta, **total barbero** y **total casa**; warning ámbar si `has_compensation === false` ("Este barbero no tiene compensación configurada — se calcula 0 %").
- Botón **"Cerrar liquidación"** (con checkbox "Registrar pago en caja") → `rpc('close_barber_settlement')`; manejar `PERIODO_YA_LIQUIDADO`.
- Tabla de liquidaciones históricas (`barber_settlements` desc) con Badge `closed`/`paid`.
- Botón secundario "Registrar renta cobrada" (para chair_rental/hybrid): inserta el movimiento `income`/`chair_rental` del barbero.
- Link "Liquidaciones" en el sidebar de `src/app/admin/layout.tsx` (icono `Wallet` de lucide).

### 7. Portal barbero (mínimo)

En `/barbero/mi-agenda`: la card "Ingresos del Día" pasa a calcularse desde `cash_movements` propios (`service` + `tip` del día) en vez del precio del servicio — el barbero ve lo realmente cobrado incluyendo propinas.

## Criterios de aceptación

- [ ] Migración 012 aplica limpia (CHECKs verificados contra la DB real primero); espejos actualizados; `cash_register` eliminada y su interface TS borrada.
- [ ] Completar una cita como barbero abre el diálogo de cobro; el movimiento queda en caja con método y barbero correctos; propina genera segundo movimiento `tip`. Completar dos veces → `YA_COBRADA`.
- [ ] El insert manual de movimientos en `/admin/caja` funciona contra la DB real (códigos EN) y los labels se ven en español.
- [ ] Liquidación de prueba: barbero `commission` 50 % con 2 cobros de $500 y propina $100 → barbero $600, casa $500. Cambiar a `chair_rental` con vigencia futura no altera la liquidación del período anterior.
- [ ] Cerrar dos veces el mismo período (o períodos solapados) → `PERIODO_YA_LIQUIDADO`.
- [ ] Un barbero puede ver sus propios movimientos y liquidaciones pero no los de otros (probar con sesión de barbero).
- [ ] `npm run build` y `npm run lint` pasan.
