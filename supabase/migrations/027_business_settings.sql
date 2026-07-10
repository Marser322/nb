-- =============================================================
-- 027 — Configuración de negocio editable (polish FASE 37).
-- Amplía la lectura pública de app_settings a claves `business.%` (además
-- de `feature.%`), siembra los valores actuales de BUSINESS_CONFIG /
-- BANK_TRANSFER_INFO como defaults editables desde /admin/configuracion,
-- y hace que cancel_appointment lea la ventana de cancelación desde
-- app_settings en vez de tenerla hardcodeada en `interval '2 hours'`.
-- Idempotente: correr las veces que haga falta. NO se aplica en esta fase.
-- =============================================================

-- 1. Ampliar la policy de lectura pública para incluir business.%
DROP POLICY IF EXISTS "Public read feature flags" ON app_settings;
CREATE POLICY "Public read feature flags" ON app_settings
  FOR SELECT USING (key LIKE 'feature.%' OR key LIKE 'business.%' OR is_admin());

-- 2. Seeds de configuración del negocio (valores actuales de constants.ts).
--    ON CONFLICT DO NOTHING: si Mario ya cargó algo desde /admin/configuracion,
--    esta migración no lo pisa.
INSERT INTO app_settings (key, value, description) VALUES
  ('business.phone', '"+598 99 123 456"'::jsonb, 'Teléfono de contacto (WhatsApp/llamadas) que se muestra en el sitio'),
  ('business.email', '"contacto@nbbarber.com"'::jsonb, 'Email de contacto que se muestra en el sitio'),
  ('business.instagram', '"@newbrothers.uy"'::jsonb, 'Usuario de Instagram que se muestra en el sitio'),
  ('business.working_hours', '{"start": 9, "end": 20}'::jsonb, 'Horario de atención (copy del sitio). La disponibilidad real se gestiona por barbero y sucursal'),
  ('business.working_days', '[1,2,3,4,5,6]'::jsonb, 'Días de atención (copy del sitio). 0=Domingo .. 6=Sábado'),
  ('business.cancellation_window_minutes', '120'::jsonb, 'Minutos de anticipación mínima para que un cliente pueda cancelar su turno. Se aplica también en el servidor (cancel_appointment)'),
  ('business.late_tolerance_minutes', '10'::jsonb, 'Minutos de tolerancia de llegada tarde antes de tener que reprogramar el turno'),
  ('business.bank_transfer', '{"bank": "", "account": "", "holder": ""}'::jsonb, 'Datos bancarios para transferencias. Si están vacíos, el checkout ofrece coordinar por WhatsApp')
ON CONFLICT (key) DO NOTHING;

-- 3. cancel_appointment: la ventana de cancelación ahora se lee de
--    app_settings (COALESCE 120 si la clave no existe todavía). Firma,
--    permisos y el resto del cuerpo quedan idénticos.
CREATE OR REPLACE FUNCTION cancel_appointment(p_appointment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_apt RECORD;
  v_window_minutes INT;
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

  v_window_minutes := COALESCE(
    (SELECT (value #>> '{}')::int FROM app_settings WHERE key = 'business.cancellation_window_minutes'),
    120
  );

  IF (v_apt.appointment_date + v_apt.start_time) - make_interval(mins => v_window_minutes)
     <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'FUERA_DE_VENTANA';
  END IF;

  UPDATE appointments SET status = 'cancelled' WHERE id = p_appointment_id;
END; $$;

REVOKE EXECUTE ON FUNCTION cancel_appointment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_appointment TO authenticated;
