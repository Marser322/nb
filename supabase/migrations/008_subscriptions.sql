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
