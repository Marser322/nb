-- =============================================================
-- 2026-07 — CRM paginado, agenda admin robusta e historial único
-- =============================================================

-- Una cita completada debe generar a lo sumo una fila de historial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_haircut_history_appointment_unique
  ON haircut_history(appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION record_haircut_history_for_appointment(
  p_appointment_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
BEGIN
  SELECT id, client_id, barber_id, service_id
  INTO v_apt
  FROM appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND OR v_apt.client_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO haircut_history (client_id, barber_id, service_id, appointment_id)
  VALUES (v_apt.client_id, v_apt.barber_id, v_apt.service_id, v_apt.id)
  ON CONFLICT (appointment_id) WHERE appointment_id IS NOT NULL DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_haircut_history_for_appointment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_haircut_history_for_appointment(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION appointments_completed_history_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM record_haircut_history_for_appointment(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_completed_history ON appointments;
CREATE TRIGGER trg_appointments_completed_history
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION appointments_completed_history_trigger();

REVOKE EXECUTE ON FUNCTION appointments_completed_history_trigger() FROM PUBLIC, anon;

-- Reemplaza la versión de 014: el trigger registra el historial con idempotencia.
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
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_appointment_with_payment(UUID, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_appointment_with_payment(UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION admin_update_appointment_status(
  p_appointment_id UUID,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
  v_status appointment_status;
BEGIN
  BEGIN
    v_status := p_status::appointment_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END;

  SELECT id, barber_id, status
  INTO v_apt
  FROM appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'CITA_NO_EXISTE'; END IF;
  IF NOT (is_admin() OR v_apt.barber_id = current_barber_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  UPDATE appointments
  SET status = v_status
  WHERE id = p_appointment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_update_appointment_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_update_appointment_status(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION admin_create_appointment(
  p_client_name TEXT,
  p_client_phone TEXT,
  p_service_id UUID,
  p_barber_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_duration INT;
  v_end_time TIME;
  v_appointment_id UUID;
  v_client_name TEXT := NULLIF(BTRIM(p_client_name), '');
  v_client_phone TEXT := NULLIF(BTRIM(p_client_phone), '');
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF v_client_name IS NULL THEN
    RAISE EXCEPTION 'CLIENTE_INVALIDO';
  END IF;

  SELECT duration_minutes INTO v_duration
  FROM services
  WHERE id = p_service_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICIO_INACTIVO'; END IF;

  IF NOT EXISTS (SELECT 1 FROM barbers WHERE id = p_barber_id AND is_active = true) THEN
    RAISE EXCEPTION 'BARBERO_INACTIVO';
  END IF;

  v_end_time := p_start_time + make_interval(mins => v_duration);

  IF (p_date + p_start_time) <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'HORARIO_PASADO';
  END IF;

  IF NOT is_slot_bookable(p_barber_id, p_date, p_start_time, v_end_time) THEN
    RAISE EXCEPTION 'FUERA_DE_HORARIO';
  END IF;

  IF v_client_phone IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM profiles
    WHERE phone = v_client_phone
      AND role = 'cliente'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO profiles (full_name, phone, role)
    VALUES (v_client_name, v_client_phone, 'cliente')
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE profiles
    SET full_name = COALESCE(NULLIF(full_name, ''), v_client_name)
    WHERE id = v_client_id;
  END IF;

  BEGIN
    INSERT INTO appointments (client_id, barber_id, service_id, appointment_date,
      start_time, end_time, status, notes)
    VALUES (v_client_id, p_barber_id, p_service_id, p_date,
      p_start_time, v_end_time, 'confirmed', p_notes)
    RETURNING id INTO v_appointment_id;
  EXCEPTION
    WHEN exclusion_violation OR unique_violation THEN
      RAISE EXCEPTION 'SLOT_OCUPADO';
  END;

  RETURN v_appointment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_create_appointment(TEXT, TEXT, UUID, UUID, DATE, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_create_appointment(TEXT, TEXT, UUID, UUID, DATE, TIME, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION admin_reschedule_appointment(
  p_appointment_id UUID,
  p_date DATE,
  p_start_time TIME
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_apt RECORD;
  v_duration INT;
  v_end_time TIME;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT a.id, a.status, a.barber_id, a.service_id, s.duration_minutes
  INTO v_apt
  FROM appointments a
  JOIN services s ON s.id = a.service_id
  WHERE a.id = p_appointment_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN RAISE EXCEPTION 'CITA_NO_EXISTE'; END IF;
  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END IF;

  v_duration := v_apt.duration_minutes;
  v_end_time := p_start_time + make_interval(mins => v_duration);

  IF (p_date + p_start_time) <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'HORARIO_PASADO';
  END IF;

  IF NOT is_slot_bookable(v_apt.barber_id, p_date, p_start_time, v_end_time) THEN
    RAISE EXCEPTION 'FUERA_DE_HORARIO';
  END IF;

  BEGIN
    UPDATE appointments
    SET appointment_date = p_date,
        start_time = p_start_time,
        end_time = v_end_time
    WHERE id = p_appointment_id;
  EXCEPTION
    WHEN exclusion_violation OR unique_violation THEN
      RAISE EXCEPTION 'SLOT_OCUPADO';
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_reschedule_appointment(UUID, DATE, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_reschedule_appointment(UUID, DATE, TIME) TO authenticated;

CREATE OR REPLACE FUNCTION get_clients_overview_page(
  p_search TEXT DEFAULT NULL,
  p_inactive_only BOOLEAN DEFAULT false,
  p_inactive_days INT DEFAULT 30,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ,
  notes TEXT,
  last_visit DATE,
  total_appointments BIGINT,
  total_spent NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_search TEXT := LOWER(BTRIM(COALESCE(p_search, '')));
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_inactive_days INT := GREATEST(COALESCE(p_inactive_days, 30), 1);
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  RETURN QUERY
  WITH overview AS (
    SELECT
      p.id,
      p.full_name,
      p.phone,
      p.avatar_url,
      p.created_at,
      p.notes,
      MAX(a.appointment_date) FILTER (WHERE a.status = 'completed')::DATE AS last_visit,
      COUNT(a.id) FILTER (WHERE a.status = 'completed')::BIGINT AS total_appointments,
      (
        COALESCE(SUM(s.price) FILTER (WHERE a.status = 'completed'), 0)
        + COALESCE((
          SELECT SUM(o.total)
          FROM orders o
          WHERE o.client_id = p.id
            AND o.status IN ('paid', 'shipped', 'delivered')
        ), 0)
      )::NUMERIC AS total_spent
    FROM profiles p
    LEFT JOIN appointments a ON a.client_id = p.id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE p.role = 'cliente'
    GROUP BY p.id
  ),
  filtered AS (
    SELECT *
    FROM overview o
    WHERE (
        v_search = ''
        OR LOWER(COALESCE(o.full_name, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(o.phone, '')) LIKE '%' || v_search || '%'
      )
      AND (
        NOT p_inactive_only
        OR o.last_visit IS NULL
        OR o.last_visit < (CURRENT_DATE - v_inactive_days)
      )
  )
  SELECT
    f.id,
    f.full_name,
    f.phone,
    f.avatar_url,
    f.created_at,
    f.notes,
    f.last_visit,
    f.total_appointments,
    f.total_spent,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_inactive_only THEN f.last_visit END ASC NULLS LAST,
    CASE WHEN NOT p_inactive_only THEN f.last_visit END DESC NULLS LAST,
    f.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_clients_overview_page(TEXT, BOOLEAN, INT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_clients_overview_page(TEXT, BOOLEAN, INT, INT, INT) TO authenticated;
