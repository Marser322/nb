-- =============================================================
-- 025 — Caja: cierre de día con arqueo, anulación por contra-asiento
-- y citas completadas sin cobrar (polish FASE 34).
-- Ejecutar a mano en el SQL Editor de Supabase, después de la 012.
-- Idempotente: se puede correr N veces sin duplicar ni romper nada.
-- =============================================================

-- 1) cash_closures: arqueo-snapshot de un día, sin sesiones ni fondo de
-- apertura. Una sola fila por fecha (single-branch, sin cierre por turno).
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
ALTER TABLE cash_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage cash closures" ON cash_closures;
CREATE POLICY "Admins manage cash closures" ON cash_closures
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 2) close_cash_day: calcula totales server-side con el MISMO predicado TZ
-- que get_barber_settlement, para que caja y liquidación cuenten el mismo día.
CREATE OR REPLACE FUNCTION close_cash_day(
  p_date DATE,
  p_counted_cash NUMERIC,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_income NUMERIC := 0;
  v_expense NUMERIC := 0;
  v_count INT := 0;
  v_expected NUMERIC := 0;
  v_row cash_closures;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
    RAISE EXCEPTION 'MONTO_INVALIDO';
  END IF;
  IF p_date IS NULL OR p_date > (now() AT TIME ZONE 'America/Montevideo')::date THEN
    RAISE EXCEPTION 'FECHA_FUTURA';
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0),
    COUNT(*)
  INTO v_income, v_expense, v_count
  FROM cash_movements
  WHERE payment_method = 'cash'
    AND (created_at AT TIME ZONE 'America/Montevideo')::date = p_date;

  v_expected := v_income - v_expense;

  BEGIN
    INSERT INTO cash_closures (closure_date, expected_cash, counted_cash, difference,
      total_income, total_expense, movements_count, notes, created_by)
    VALUES (p_date, v_expected, p_counted_cash, p_counted_cash - v_expected,
      v_income, v_expense, v_count, p_notes, auth.uid())
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DIA_YA_CERRADO';
  END;

  RETURN to_jsonb(v_row);
END; $$;

REVOKE EXECUTE ON FUNCTION close_cash_day(DATE, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_cash_day(DATE, NUMERIC, TEXT) TO authenticated;

-- 3) void_cash_movement: anulación por contra-asiento (NUNCA DELETE), solo
-- para movimientos manuales. Race-safe: el índice único de abajo hace que
-- una segunda anulación concurrente choque como unique_violation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_void_once
  ON cash_movements(reference_id) WHERE category = 'adjustment' AND reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION void_cash_movement(
  p_movement_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mov RECORD;
  v_new_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_mov FROM cash_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOVIMIENTO_NO_EXISTE';
  END IF;

  IF v_mov.appointment_id IS NOT NULL THEN
    RAISE EXCEPTION 'MOVIMIENTO_DE_CITA';
  END IF;

  IF v_mov.category = 'settlement' OR EXISTS (
    SELECT 1 FROM barber_settlements WHERE payout_movement_id = p_movement_id
  ) THEN
    RAISE EXCEPTION 'MOVIMIENTO_DE_LIQUIDACION';
  END IF;

  -- Ya es en sí mismo un contra-asiento de otro movimiento: no se puede re-anular.
  IF v_mov.category = 'adjustment' AND v_mov.reference_id IS NOT NULL THEN
    RAISE EXCEPTION 'YA_ANULADO';
  END IF;

  -- Ya tiene un contra-asiento propio (chequeo explícito; el índice único de
  -- abajo es el que hace esto race-safe ante dos anulaciones concurrentes).
  IF EXISTS (
    SELECT 1 FROM cash_movements WHERE reference_id = p_movement_id AND category = 'adjustment'
  ) THEN
    RAISE EXCEPTION 'YA_ANULADO';
  END IF;

  BEGIN
    INSERT INTO cash_movements (type, category, amount, payment_method, description,
      barber_id, branch_id, reference_id, created_by)
    VALUES (
      CASE v_mov.type WHEN 'income' THEN 'expense' ELSE 'income' END,
      'adjustment', v_mov.amount, v_mov.payment_method,
      'Anulación: ' || COALESCE(NULLIF(BTRIM(p_reason), ''), v_mov.description, 'sin descripción'),
      v_mov.barber_id, v_mov.branch_id, p_movement_id, auth.uid()
    )
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'YA_ANULADO';
  END;

  RETURN v_new_id;
END; $$;

REVOKE EXECUTE ON FUNCTION void_cash_movement(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_cash_movement(UUID, TEXT) TO authenticated;

-- 4) Cobro retroactivo: complete_appointment_with_payment ahora también
-- acepta citas ya 'completed' (además de 'pending'/'confirmed'). El doble
-- cobro sigue siendo imposible por idx_cash_movements_appointment_service
-- (índice único parcial creado en la 012); el UPDATE a 'completed' es un
-- no-op idempotente cuando la cita ya estaba completada, y el trigger
-- trg_appointments_completed_history (018) que alimenta haircut_history ya
-- es idempotente (ON CONFLICT DO NOTHING sobre appointment_id) y además
-- solo dispara en la transición OLD.status IS DISTINCT FROM NEW.status, por
-- lo que una cita ya completada no genera una segunda fila de historial.
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
  IF v_apt.status NOT IN ('pending', 'confirmed', 'completed') THEN
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
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_appointment_with_payment(UUID, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_appointment_with_payment(UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;

-- 5) get_uncharged_completed_appointments: citas 'completed' de un barbero
-- y período sin movimiento de servicio asociado (anti-join). Son las que
-- quedaron "invisibles" para la liquidación (p.ej. cobradas con el flag
-- de contabilidad apagado, o completadas por admin_update_appointment_status).
CREATE OR REPLACE FUNCTION get_uncharged_completed_appointments(
  p_barber_id UUID, p_from DATE, p_to DATE
) RETURNS TABLE (
  id UUID,
  appointment_date DATE,
  start_time TIME,
  client_name TEXT,
  service_name TEXT,
  service_price NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin() OR p_barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.appointment_date,
    a.start_time,
    COALESCE(p.full_name, 'Cliente sin nombre') AS client_name,
    COALESCE(s.name, 'Servicio') AS service_name,
    COALESCE(s.price, 0) AS service_price
  FROM appointments a
  LEFT JOIN profiles p ON p.id = a.client_id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE a.status = 'completed'
    AND a.barber_id = p_barber_id
    AND a.appointment_date BETWEEN p_from AND p_to
    AND NOT EXISTS (
      SELECT 1 FROM cash_movements cm
      WHERE cm.appointment_id = a.id AND cm.category = 'service'
    )
  ORDER BY a.appointment_date, a.start_time;
END; $$;

REVOKE EXECUTE ON FUNCTION get_uncharged_completed_appointments(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_uncharged_completed_appointments(UUID, DATE, DATE) TO authenticated;

-- 6) get_barber_settlement: agrega rental_paid (renta efectivamente
-- cobrada en el período, category='chair_rental') junto al rental_due
-- existente. Ningún cálculo existente cambia; los snapshots de
-- barber_settlements son inmutables y no se recalculan.
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
  v_rental_paid NUMERIC := 0;
BEGIN
  IF NOT (is_admin() OR p_barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_comp FROM barber_compensation
  WHERE barber_id = p_barber_id AND effective_from <= p_to
  ORDER BY effective_from DESC LIMIT 1;
  v_model := COALESCE(v_comp.model, 'commission'::compensation_model);

  SELECT COALESCE(SUM(amount) FILTER (WHERE category = 'service'), 0),
         COALESCE(SUM(amount) FILTER (WHERE category = 'tip'), 0),
         COUNT(*) FILTER (WHERE category = 'service'),
         COALESCE(SUM(amount) FILTER (WHERE category = 'chair_rental'), 0)
  INTO v_services, v_tips, v_count, v_rental_paid
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

  v_barber_total := v_barber_total + v_tips;

  RETURN jsonb_build_object(
    'barber_id', p_barber_id, 'from', p_from, 'to', p_to,
    'model', v_model, 'commission_pct', v_comp.commission_pct,
    'rental_amount', v_comp.rental_amount, 'rental_period', v_comp.rental_period,
    'salary_amount', v_comp.salary_amount,
    'services_total', v_services, 'tips_total', v_tips,
    'appointments_count', v_count, 'rental_due', v_rental_due,
    'rental_paid', v_rental_paid,
    'barber_total', v_barber_total, 'house_total', v_house_total,
    'has_compensation', v_comp.id IS NOT NULL
  );
END; $$;

REVOKE EXECUTE ON FUNCTION get_barber_settlement FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_barber_settlement TO authenticated;
