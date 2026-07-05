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
    active BOOLEAN DEFAULT true,
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
INSERT INTO branches (name, address, active)
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


