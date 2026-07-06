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
--    Usamos un bloque condicional por seguridad si ya no existiese al recrear DB.
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cash_register') THEN
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
  END IF;
END $$;

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
