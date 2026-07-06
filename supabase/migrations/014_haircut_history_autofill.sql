-- =============================================================
-- 014_haircut_history_autofill.sql
-- Poblar haircut_history automáticamente al cobrar una cita.
--
-- Contexto: la tabla haircut_history y su RLS existen desde la 001, pero
-- nada la poblaba. La fidelización ("lo mismo de la vez pasada"), el
-- historial en /admin/clientes/[id] y el portal del cliente dependían de
-- datos que nunca se escribían.
--
-- Solución: extender complete_appointment_with_payment (definido en 012)
-- para insertar una fila en haircut_history al completar el cobro. Solo se
-- registra cuando la cita tiene client_id (cliente con perfil); los walk-in
-- sin perfil no generan historial.
--
-- El INSERT va DESPUÉS del movimiento de caja 'service': si la cita ya fue
-- cobrada, ese INSERT dispara unique_violation ('YA_COBRADA') y aborta la
-- transacción antes de llegar acá, evitando duplicados en haircut_history.
-- =============================================================

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

  SELECT a.id, a.status, a.barber_id, a.client_id, a.service_id,
         b.branch_id AS barber_branch_id
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

  -- Registrar en el historial de cortes (fidelización). Solo clientes con perfil.
  IF v_apt.client_id IS NOT NULL THEN
    INSERT INTO haircut_history (client_id, barber_id, service_id, appointment_id)
    VALUES (v_apt.client_id, v_apt.barber_id, v_apt.service_id, p_appointment_id);
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION complete_appointment_with_payment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_appointment_with_payment TO authenticated;
