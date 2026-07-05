-- =============================================================
-- 010 — Generación automática de citas desde turnos fijos.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 009).
-- pg_cron: habilitar primero en Dashboard > Database > Extensions.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotente: se puede correr N veces sin duplicar. Si ya existe una cita
-- para esa ocurrencia (aunque esté cancelada) NO se regenera — cancelar una
-- ocurrencia significa saltearla esa semana. Si el slot lo tomó otro cliente,
-- el EXCLUDE de 009 dispara y se saltea con reason 'SLOT_OCUPADO'.
CREATE OR REPLACE FUNCTION generate_subscription_appointments(p_horizon_days INT DEFAULT 8)
RETURNS TABLE (out_subscription_id UUID, out_date DATE, out_created BOOLEAN, out_reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_date DATE;
  v_end_time TIME;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.client_id, s.barber_id, s.service_id, s.day_of_week,
           s.start_time, srv.duration_minutes
    FROM subscriptions s
    JOIN services srv ON srv.id = s.service_id
    WHERE s.status = 'active'
  LOOP
    v_end_time := v_sub.start_time + make_interval(mins => v_sub.duration_minutes);
    FOR i IN 0..p_horizon_days LOOP
      v_date := (now() AT TIME ZONE 'America/Montevideo')::date + i;
      CONTINUE WHEN EXTRACT(dow FROM v_date)::int != v_sub.day_of_week;
      CONTINUE WHEN i = 0
        AND v_sub.start_time <= (now() AT TIME ZONE 'America/Montevideo')::time;

      IF EXISTS (SELECT 1 FROM appointments a
                 WHERE a.subscription_id = v_sub.id AND a.appointment_date = v_date) THEN
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := false; out_reason := 'YA_EXISTE';
        RETURN NEXT; CONTINUE;
      END IF;

      BEGIN
        INSERT INTO appointments (client_id, barber_id, service_id, appointment_date,
          start_time, end_time, status, subscription_id, notes)
        VALUES (v_sub.client_id, v_sub.barber_id, v_sub.service_id, v_date,
          v_sub.start_time, v_end_time, 'confirmed', v_sub.id,
          'Generada automáticamente por turno fijo');
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := true; out_reason := NULL;
        RETURN NEXT;
      EXCEPTION WHEN exclusion_violation THEN
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := false; out_reason := 'SLOT_OCUPADO';
        RETURN NEXT;
      END;
    END LOOP;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION generate_subscription_appointments FROM PUBLIC, anon;
-- authenticated: para la invocación oportunista desde el panel (ver Tarea 5)
GRANT EXECUTE ON FUNCTION generate_subscription_appointments TO authenticated;

-- Corrida diaria 06:00 UTC = 03:00 Montevideo. Si se re-corre la migración,
-- cron.schedule con el mismo nombre actualiza el job existente.
SELECT cron.schedule(
  'generate-subscription-appointments',
  '0 6 * * *',
  'SELECT public.generate_subscription_appointments()'
);
