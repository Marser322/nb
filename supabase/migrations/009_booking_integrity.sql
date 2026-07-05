-- =============================================================
-- 009 — Integridad de reservas: anti-solapes a nivel DB,
-- RPC transaccional de reserva y cancelación con ventana de 2 h.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 006 y 008).
--
-- ⚠️ ANTES DE APLICAR: correr este diagnóstico. Si devuelve filas,
-- hay citas solapadas en producción y el EXCLUDE va a fallar:
-- resolverlas a mano (cancelar una de cada par) y recién entonces migrar.
--
--   SELECT a1.id, a2.id, a1.barber_id, a1.appointment_date,
--          a1.start_time, a1.end_time, a2.start_time, a2.end_time
--   FROM appointments a1
--   JOIN appointments a2 ON a1.barber_id = a2.barber_id
--     AND a1.appointment_date = a2.appointment_date AND a1.id < a2.id
--     AND a1.start_time < a2.end_time AND a2.start_time < a1.end_time
--   WHERE a1.status NOT IN ('cancelled','no_show')
--     AND a2.status NOT IN ('cancelled','no_show');
-- =============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Anti-solapes declarativo: protege wizard, admin/citas y el cron de
-- suscripciones por igual. tsrange es [) por defecto, así que una cita
-- que termina 10:30 no choca con otra que empieza 10:30.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    barber_id WITH =,
    tsrange(appointment_date + start_time, appointment_date + end_time) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

-- El índice único viejo queda redundante y genera un código de error
-- distinto (23505 vs 23P01), complicando el manejo en UI.
DROP INDEX IF EXISTS idx_unique_barber_slot;

-- El cliente ya no actualiza citas directo: pasa por cancel_appointment.
-- (La policy de 001 permitía cambiar fecha/hora/estado sin restricción.)
DROP POLICY IF EXISTS "Clients can update own appointments" ON appointments;

-- -------------------------------------------------------------
-- RPC de reserva: end_time server-side, suscripción + cita en UNA
-- transacción, y errores legibles para la UI.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION book_appointment(
  p_barber_id UUID,
  p_service_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_recurring BOOLEAN DEFAULT false,
  p_style_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_duration INT;
  v_end_time TIME;
  v_subscription_id UUID;
  v_appointment_id UUID;
BEGIN
  -- Perfil del usuario autenticado (patrón OR de 005: tolera ambos esquemas)
  SELECT id INTO v_client_id FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  SELECT duration_minutes INTO v_duration FROM services
  WHERE id = p_service_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICIO_NO_DISPONIBLE';
  END IF;

  -- No se confía en el end_time del cliente
  v_end_time := p_start_time + make_interval(mins => v_duration);

  -- appointment_date/start_time son hora local UY sin tz: comparar contra
  -- el reloj de Montevideo, no contra el del servidor (UTC).
  IF (p_date + p_start_time) <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'HORARIO_PASADO';
  END IF;

  -- (La Fase 8 inserta acá la validación de horario/bloqueos:
  --  IF NOT is_slot_bookable(...) THEN RAISE EXCEPTION 'FUERA_DE_HORARIO')

  IF p_recurring THEN
    INSERT INTO subscriptions (client_id, barber_id, service_id, day_of_week, start_time, status)
    VALUES (v_client_id, p_barber_id, p_service_id, EXTRACT(dow FROM p_date)::int, p_start_time, 'active')
    RETURNING id INTO v_subscription_id;
  END IF;

  BEGIN
    INSERT INTO appointments (client_id, barber_id, service_id, appointment_date,
      start_time, end_time, status, style_reference, notes, subscription_id)
    VALUES (v_client_id, p_barber_id, p_service_id, p_date,
      p_start_time, v_end_time, 'pending', p_style_reference, p_notes, v_subscription_id)
    RETURNING id INTO v_appointment_id;
  EXCEPTION WHEN exclusion_violation THEN
    -- Si falla la cita, el RAISE revierte también la suscripción (misma tx)
    RAISE EXCEPTION 'SLOT_OCUPADO';
  END;

  RETURN jsonb_build_object(
    'appointment_id', v_appointment_id,
    'subscription_id', v_subscription_id
  );
END; $$;

REVOKE EXECUTE ON FUNCTION book_appointment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION book_appointment TO authenticated;

-- -------------------------------------------------------------
-- Cancelación por el cliente con ventana de 2 h garantizada server-side.
-- NO toca la suscripción: cancelar una ocurrencia ≠ cancelar el turno fijo.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_appointment(p_appointment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_apt RECORD;
BEGIN
  SELECT id INTO v_client_id FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  SELECT * INTO v_apt FROM appointments
  WHERE id = p_appointment_id AND client_id = v_client_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CITA_NO_ENCONTRADA';
  END IF;

  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'NO_CANCELABLE';
  END IF;

  IF (v_apt.appointment_date + v_apt.start_time) - interval '2 hours'
     <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'FUERA_DE_VENTANA';
  END IF;

  UPDATE appointments SET status = 'cancelled' WHERE id = p_appointment_id;
END; $$;

REVOKE EXECUTE ON FUNCTION cancel_appointment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_appointment TO authenticated;
