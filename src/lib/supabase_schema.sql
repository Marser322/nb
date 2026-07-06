-- NB BARBER - DATABASE SCHEMA
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA DE SUCURSALES (Branches)
CREATE TABLE IF NOT EXISTS branches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    working_hours JSONB DEFAULT '{"lunes": {"start": "09:00", "end": "20:00"}, "martes": {"start": "09:00", "end": "20:00"}, "miercoles": {"start": "09:00", "end": "20:00"}, "jueves": {"start": "09:00", "end": "20:00"}, "viernes": {"start": "09:00", "end": "20:00"}, "sabado": {"start": "09:00", "end": "18:00"}}'::jsonb,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE MOVIMIENTOS DE CAJA (Cash Movements)
CREATE TABLE IF NOT EXISTS cash_movements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL CHECK (category IN ('service', 'product', 'tip', 'adjustment', 'supply', 'salary', 'rent', 'other')),
    amount DECIMAL(10, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
    description TEXT,
    reference_id UUID, -- ID de la cita o venta si corresponde
    branch_id UUID REFERENCES branches(id), -- Opcional: si manejas múltiples cajas
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CONFIGURACIÓN DE RECORDATORIOS (Reminders Config)
CREATE TABLE IF NOT EXISTS reminders_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    days_since_last_visit INTEGER NOT NULL DEFAULT 30,
    message_template TEXT NOT NULL DEFAULT 'Hola {nombre}, hace tiempo no te vemos por NB Barber. ¡Reserva hoy y renueva tu estilo!',
    is_active BOOLEAN DEFAULT false,
    channel TEXT DEFAULT 'whatsapp',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. LOG DE COMUNICACIONES (Communication Logs)
CREATE TABLE IF NOT EXISTS communication_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_name TEXT, -- Guardamos nombre por si el usuario no está registrado
    client_phone TEXT,
    message_sent TEXT,
    status TEXT CHECK (status IN ('sent', 'failed', 'delivered')),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- 6. POLÍTICAS DE SEGURIDAD (RLS)
-- Habilitar RLS en todas las tablas nuevas
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;

-- Políticas 'Abiertas' para desarrolladores (Ajustar en producción para solo admins)
-- Permitir todo acceso a usuarios autenticados (o anon si es necesario para el demo)

-- Policies for branches
CREATE POLICY "Enable all access for authenticated users on branches"
ON branches FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable read access for anon on branches"
ON branches FOR SELECT TO anon USING (true); -- Clientes necesitan ver sucursales

-- Policies for cash_movements
CREATE POLICY "Enable all access for authenticated users on cash_movements"
ON cash_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies for reminders_config
CREATE POLICY "Enable all access for authenticated users on reminders_config"
ON reminders_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies for communication_logs
CREATE POLICY "Enable all access for authenticated users on communication_logs"
ON communication_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INSERTAR DATOS INICIALES (Seed Data)
-- Crear una sucursal por defecto si no existe
INSERT INTO branches (name, address, is_active)
SELECT 'Casa Central', 'Av. Principal 1234', true
WHERE NOT EXISTS (SELECT 1 FROM branches);

-- Configuración de recordatorio por defecto
INSERT INTO reminders_config (days_since_last_visit, message_template, is_active)
SELECT 25, '¡Hola! Hace 25 días de tu último corte en NB Barber. ¿Listo para volver? Reserva aquí: https://nbbarber.com', true
WHERE NOT EXISTS (SELECT 1 FROM reminders_config);

-- =============================================================
-- 007 — CRM: notas de cliente, logs vinculados, multi-sucursal,
-- perfiles walk-in y overview agregado de clientes.
-- =============================================================

-- Notas internas del cliente
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notes TEXT;

-- Vincular logs de mensajes al perfil
ALTER TABLE communication_logs
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Multi-sucursal: un barbero pertenece a una sucursal
ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- El admin necesita crear perfiles walk-in (sin auth_user_id) desde el panel
DROP POLICY IF EXISTS "Admins insert profiles" ON profiles;
CREATE POLICY "Admins insert profiles" ON profiles
  FOR INSERT WITH CHECK (is_admin());

-- Overview agregado de clientes: RPC
CREATE OR REPLACE FUNCTION get_clients_overview()
RETURNS TABLE (
  id UUID, full_name TEXT, phone TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ, notes TEXT,
  last_visit DATE, total_appointments BIGINT, total_spent NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.avatar_url, p.created_at, p.notes,
    MAX(a.appointment_date) FILTER (WHERE a.status = 'completed'),
    COUNT(a.id) FILTER (WHERE a.status = 'completed'),
    COALESCE(SUM(s.price) FILTER (WHERE a.status = 'completed'), 0)
      + COALESCE((SELECT SUM(o.total) FROM orders o
                  WHERE o.client_id = p.id
                    AND o.status IN ('paid','shipped','delivered')), 0)
  FROM profiles p
  LEFT JOIN appointments a ON a.client_id = p.id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE p.role = 'cliente'
  GROUP BY p.id;
END; $$;

GRANT EXECUTE ON FUNCTION get_clients_overview() TO authenticated;


-- =====================================================
-- MIGRACIÓN 008: TABLA DE SUSCRIPCIONES (TURNOS FIJOS RECURRENTES)
-- =====================================================

-- 1. Crear tabla de suscripciones
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE NOT NULL,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Domingo, 1 = Lunes, etc.
    start_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agregar columna en appointments para vincular cita a una suscripción
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

-- 3. Habilitar Row Level Security (RLS) en la tabla
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Definir políticas de acceso para subscriptions
DROP POLICY IF EXISTS "Clients view their own subscriptions" ON subscriptions;
CREATE POLICY "Clients view their own subscriptions" ON subscriptions
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM profiles 
      WHERE auth_user_id = auth.uid() OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients insert their own subscriptions" ON subscriptions;
CREATE POLICY "Clients insert their own subscriptions" ON subscriptions
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT id FROM profiles 
      WHERE auth_user_id = auth.uid() OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients update/cancel their own subscriptions" ON subscriptions;
CREATE POLICY "Clients update/cancel their own subscriptions" ON subscriptions
  FOR UPDATE USING (
    client_id IN (
      SELECT id FROM profiles 
      WHERE auth_user_id = auth.uid() OR id = auth.uid()
    )
  );

-- Políticas para barberos y admins
DROP POLICY IF EXISTS "Admins manage all subscriptions" ON subscriptions;
CREATE POLICY "Admins manage all subscriptions" ON subscriptions
  FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Barbers view subscriptions assigned to them" ON subscriptions;
CREATE POLICY "Barbers view subscriptions assigned to them" ON subscriptions
  FOR SELECT USING (
    barber_id = current_barber_id()
  );


-- =============================================================
-- 009 — Integridad de reservas: anti-solapes a nivel DB,
-- RPC transaccional de reserva y cancelación con ventana de 2 h.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 006 y 008).
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
-- 011 — Disponibilidad: bloqueos y RPC de disponibilidad
-- -------------------------------------------------------------

-- Bloqueos: vacaciones de barbero, feriado de sucursal, bloqueo puntual.
-- start_time/end_time NULL (ambos) = día(s) completo(s).
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

-- RPC único de disponibilidad
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

-- Validación server-side de slot
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

GRANT EXECUTE ON FUNCTION is_slot_bookable(UUID, DATE, TIME, TIME) TO anon, authenticated;

-- RPC de reserva: end_time server-side, suscripción + cita en UNA
-- transacción, y errores legibles para la UI.
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

  -- Validación de disponibilidad y bloqueos
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
GRANT EXECUTE ON FUNCTION generate_subscription_appointments TO authenticated;

-- Corrida diaria 06:00 UTC = 03:00 Montevideo. Si se re-corre la migración,
-- cron.schedule con el mismo nombre actualiza el job existente.
SELECT cron.schedule(
  'generate-subscription-appointments',
  '0 6 * * *',
  'SELECT public.generate_subscription_appointments()'
);


);


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

-- 5. Liquidación por barbero y período
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

-- 6. Cierre de liquidación
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
END; $$; -- NOTA: Completamos el cuerpo en el RPC final de abajo.

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
    RAISE EXCEPTION 'PERIODO_YA_LIQUIDADO';
  END;

  RETURN v_settlement_id;
END; $$;

REVOKE EXECUTE ON FUNCTION close_barber_settlement FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_barber_settlement TO authenticated;

-- =============================================================
-- 013 — Configuración de la aplicación y feature flags.
-- =============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read feature flags" ON app_settings;
CREATE POLICY "Public read feature flags" ON app_settings
  FOR SELECT USING (key LIKE 'feature.%' OR is_admin());
DROP POLICY IF EXISTS "Admins manage settings" ON app_settings;
CREATE POLICY "Admins manage settings" ON app_settings
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO app_settings (key, value, description) VALUES
  ('feature.tienda',        'true'::jsonb, 'Tienda online: /tienda, /checkout, carrito y link en navbar'),
  ('feature.suscripciones', 'true'::jsonb, 'Turnos fijos semanales (wizard paso 6, mi-cuenta, generación automática)'),
  ('feature.contabilidad',  'true'::jsonb, 'Cobro al completar cita, caja avanzada y liquidaciones'),
  ('feature.propinas',      'true'::jsonb, 'Campo propina en el diálogo de cobro'),
  ('feature.mensajes_crm',  'true'::jsonb, 'Mensajes y recordatorios por WhatsApp')
ON CONFLICT (key) DO NOTHING;

