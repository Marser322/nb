-- =============================================================
-- 011 — Disponibilidad: normalización de branches, horarios
-- efectivos, bloqueos y RPC único de disponibilidad.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 009).
-- =============================================================

-- 1. Normalizar branches al nombre que ya usa el panel admin
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'branches'
               AND column_name = 'active') THEN
    ALTER TABLE branches RENAME COLUMN active TO is_active;
  END IF;
END $$;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT
  '{"lunes": {"start": "09:00", "end": "20:00"}, "martes": {"start": "09:00", "end": "20:00"}, "miercoles": {"start": "09:00", "end": "20:00"}, "jueves": {"start": "09:00", "end": "20:00"}, "viernes": {"start": "09:00", "end": "20:00"}, "sabado": {"start": "09:00", "end": "18:00"}}'::jsonb;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS image_url TEXT;
UPDATE branches SET working_hours = DEFAULT WHERE working_hours IS NULL;

-- Recrear explícita la policy de 006 sobre el nombre nuevo
DROP POLICY IF EXISTS "Anyone can view active branches" ON branches;
CREATE POLICY "Anyone can view active branches" ON branches
  FOR SELECT USING (is_active = true OR is_admin());

-- 2. Bloqueos: vacaciones de barbero, feriado de sucursal, bloqueo puntual.
--    start_time/end_time NULL (ambos) = día(s) completo(s).
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date),
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NULL OR end_time > start_time),
  CHECK (barber_id IS NOT NULL OR branch_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_barber
  ON schedule_blocks(barber_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_branch
  ON schedule_blocks(branch_id, start_date, end_date);

ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage schedule blocks" ON schedule_blocks;
CREATE POLICY "Admins manage schedule blocks" ON schedule_blocks
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Barbers manage own blocks" ON schedule_blocks;
CREATE POLICY "Barbers manage own blocks" ON schedule_blocks
  FOR ALL USING (barber_id = current_barber_id())
  WITH CHECK (barber_id = current_barber_id() AND branch_id IS NULL);
-- Sin SELECT público: la disponibilidad se lee vía RPC SECURITY DEFINER.

-- 3. RPC único de disponibilidad (público, como get_booked_slots en 006).
--    Devuelve por día: horario efectivo (barbero ?? sucursal), bloqueos y
--    citas ocupadas. El wizard hace UNA llamada para la tira de 14 días.
CREATE OR REPLACE FUNCTION get_availability(
  p_barber_id UUID,
  p_from DATE,
  p_to DATE DEFAULT NULL
) RETURNS TABLE (
  day DATE,
  is_open BOOLEAN,
  open_time TIME,
  close_time TIME,
  break_start TIME,
  break_end TIME,
  slot_minutes INT,
  booked JSONB,
  blocks JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_barber RECORD;
  v_to DATE;
  v_day DATE;
  v_key TEXT;
  v_hours JSONB;
  v_day_blocks JSONB;
  v_full_day_block BOOLEAN;
BEGIN
  v_to := LEAST(COALESCE(p_to, p_from), p_from + 30);  -- cap 31 días

  SELECT b.working_hours AS barber_hours, b.branch_id,
         br.working_hours AS branch_hours
  INTO v_barber
  FROM barbers b
  LEFT JOIN branches br ON br.id = b.branch_id
  WHERE b.id = p_barber_id AND b.is_active = true;
  IF NOT FOUND THEN RETURN; END IF;

  v_day := p_from;
  WHILE v_day <= v_to LOOP
    v_key := (ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])
             [EXTRACT(dow FROM v_day)::int + 1];
    v_hours := COALESCE(v_barber.barber_hours -> v_key, v_barber.branch_hours -> v_key);
    IF v_hours = 'null'::jsonb THEN v_hours := NULL; END IF;

    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'start', COALESCE(sb.start_time::text, '00:00'),
        'end',   COALESCE(sb.end_time::text,   '23:59'),
        'reason', sb.reason) ORDER BY sb.start_time NULLS FIRST), '[]'::jsonb),
      COALESCE(bool_or(sb.start_time IS NULL), false)
    INTO v_day_blocks, v_full_day_block
    FROM schedule_blocks sb
    WHERE v_day BETWEEN sb.start_date AND sb.end_date
      AND (sb.barber_id = p_barber_id
           OR (sb.branch_id IS NOT NULL AND sb.branch_id = v_barber.branch_id));

    day := v_day;
    slot_minutes := 30;
    blocks := v_day_blocks;
    IF v_hours IS NULL OR v_full_day_block THEN
      is_open := false;
      open_time := NULL; close_time := NULL;
      break_start := NULL; break_end := NULL;
      booked := '[]'::jsonb;
    ELSE
      is_open := true;
      open_time := (v_hours->>'start')::time;
      close_time := (v_hours->>'end')::time;
      break_start := (v_hours->>'break_start')::time;
      break_end := (v_hours->>'break_end')::time;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'start', a.start_time::text, 'end', a.end_time::text)
        ORDER BY a.start_time), '[]'::jsonb)
      INTO booked
      FROM appointments a
      WHERE a.barber_id = p_barber_id AND a.appointment_date = v_day
        AND a.status IN ('pending', 'confirmed');
    END IF;
    RETURN NEXT;
    v_day := v_day + 1;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION get_availability(UUID, DATE, DATE) TO anon, authenticated;

-- 4. Validación server-side compartida: dentro del horario efectivo, fuera
--    de break y sin bloqueos. Los solapes con citas NO se chequean acá:
--    los garantiza el EXCLUDE de 009.
CREATE OR REPLACE FUNCTION is_slot_bookable(
  p_barber_id UUID, p_date DATE, p_start TIME, p_end TIME
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT * INTO v FROM get_availability(p_barber_id, p_date) LIMIT 1;
  IF NOT FOUND OR NOT v.is_open THEN RETURN false; END IF;
  IF p_start < v.open_time OR p_end > v.close_time THEN RETURN false; END IF;
  IF v.break_start IS NOT NULL
     AND p_start < v.break_end AND v.break_start < p_end THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v.blocks) blk
    WHERE p_start < (blk->>'end')::time AND (blk->>'start')::time < p_end
  ) THEN RETURN false; END IF;
  RETURN true;
END; $$;

-- 5. book_appointment v2: agregar la validación de horario.
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

  IF NOT is_slot_bookable(p_barber_id, p_date, p_start_time, v_end_time) THEN
    RAISE EXCEPTION 'FUERA_DE_HORARIO';
  END IF;

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
