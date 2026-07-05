-- =====================================================
-- MIGRACIÓN 006: ENDURECER RLS PARA PRODUCCIÓN
-- Ejecutar en Supabase > SQL Editor
-- =====================================================
-- ANTES DE EJECUTAR: verificá que tu usuario admin tenga role = 'admin':
--   SELECT p.id, p.full_name, p.role FROM profiles p
--   JOIN auth.users u ON u.id IN (p.auth_user_id, p.id)
--   WHERE u.email = 'admin@nbbarber.com';
-- Si role no es 'admin', corregilo antes o el panel quedará sin permisos:
--   UPDATE profiles SET role = 'admin' WHERE id = '<id del resultado>';
-- La migración es re-ejecutable (DROP IF EXISTS antes de cada CREATE).

-- =====================================================
-- 1. FUNCIONES HELPER
-- =====================================================

-- ¿El usuario actual es admin? (tolera profiles.id == auth.uid() o auth_user_id)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND role = 'admin'
  );
$$;

-- Barbero vinculado al usuario actual (NULL si no es barbero)
CREATE OR REPLACE FUNCTION current_barber_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id FROM barbers b
  JOIN profiles p ON b.profile_id = p.id
  WHERE (p.auth_user_id = auth.uid() OR p.id = auth.uid())
    AND b.is_active = true
  LIMIT 1;
$$;

-- =====================================================
-- 2. ELIMINAR POLICIES PERMISIVAS DEL SETUP DE DESARROLLO
-- (cualquier autenticado tenía acceso total a estas tablas)
-- =====================================================

DROP POLICY IF EXISTS "Enable all access for authenticated users on branches" ON branches;
DROP POLICY IF EXISTS "Enable all access for authenticated users on cash_movements" ON cash_movements;
DROP POLICY IF EXISTS "Enable all access for authenticated users on reminders_config" ON reminders_config;
DROP POLICY IF EXISTS "Enable all access for authenticated users on communication_logs" ON communication_logs;

-- =====================================================
-- 3. BRANCHES: lectura pública, escritura solo admin
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view active branches" ON branches;
CREATE POLICY "Anyone can view active branches" ON branches
  FOR SELECT USING (active = true OR is_admin());

DROP POLICY IF EXISTS "Admins manage branches" ON branches;
CREATE POLICY "Admins manage branches" ON branches
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =====================================================
-- 4. CAJA Y COMUNICACIONES: solo admin
-- =====================================================

DROP POLICY IF EXISTS "Admins manage cash movements" ON cash_movements;
CREATE POLICY "Admins manage cash movements" ON cash_movements
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage reminders config" ON reminders_config;
CREATE POLICY "Admins manage reminders config" ON reminders_config
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage communication logs" ON communication_logs;
CREATE POLICY "Admins manage communication logs" ON communication_logs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage cash register" ON cash_register;
CREATE POLICY "Admins manage cash register" ON cash_register
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =====================================================
-- 5. CATÁLOGO (services, products, barbers, lookbook):
--    lectura pública de activos, escritura solo admin
-- =====================================================

DROP POLICY IF EXISTS "Admins manage services" ON services;
CREATE POLICY "Admins manage services" ON services
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage products" ON products;
CREATE POLICY "Admins manage products" ON products
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage barbers" ON barbers;
CREATE POLICY "Admins manage barbers" ON barbers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage lookbook" ON lookbook;
CREATE POLICY "Admins manage lookbook" ON lookbook
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =====================================================
-- 6. APPOINTMENTS: cliente ve/crea las suyas (ya en 001),
--    barbero ve y actualiza las asignadas a él, admin todo
-- =====================================================

DROP POLICY IF EXISTS "Barbers view own appointments" ON appointments;
CREATE POLICY "Barbers view own appointments" ON appointments
  FOR SELECT USING (barber_id = current_barber_id());

DROP POLICY IF EXISTS "Barbers update own appointments" ON appointments;
CREATE POLICY "Barbers update own appointments" ON appointments
  FOR UPDATE USING (barber_id = current_barber_id())
  WITH CHECK (barber_id = current_barber_id());

DROP POLICY IF EXISTS "Admins manage appointments" ON appointments;
CREATE POLICY "Admins manage appointments" ON appointments
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Disponibilidad de agenda sin exponer citas de otros clientes:
-- /reservar necesita saber qué horarios están ocupados para cualquier
-- barbero, pero no debe poder leer las filas completas de appointments.
-- Esta función devuelve solo los rangos horarios.
CREATE OR REPLACE FUNCTION get_booked_slots(p_barber_id UUID, p_date DATE)
RETURNS TABLE (start_time TIME, end_time TIME)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.start_time, a.end_time
  FROM appointments a
  WHERE a.barber_id = p_barber_id
    AND a.appointment_date = p_date
    AND a.status IN ('pending', 'confirmed');
$$;

GRANT EXECUTE ON FUNCTION get_booked_slots(UUID, DATE) TO anon, authenticated;

-- =====================================================
-- 7. ORDERS / ORDER_ITEMS / HISTORIAL: admin gestiona todo
-- (las policies de cliente ya existen en 001/004)
-- =====================================================

DROP POLICY IF EXISTS "Admins manage orders" ON orders;
CREATE POLICY "Admins manage orders" ON orders
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage order items" ON order_items;
CREATE POLICY "Admins manage order items" ON order_items
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage haircut history" ON haircut_history;
CREATE POLICY "Admins manage haircut history" ON haircut_history
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Barbers manage own haircut history" ON haircut_history;
CREATE POLICY "Barbers manage own haircut history" ON haircut_history
  FOR ALL USING (barber_id = current_barber_id())
  WITH CHECK (barber_id = current_barber_id());

-- =====================================================
-- 8. PROFILES: admin y barberos pueden ver perfiles de clientes
-- (el panel admin lista clientes; la agenda del barbero muestra
-- nombre y teléfono del cliente de cada cita)
-- =====================================================

DROP POLICY IF EXISTS "Staff can view profiles" ON profiles;
CREATE POLICY "Staff can view profiles" ON profiles
  FOR SELECT USING (is_admin() OR current_barber_id() IS NOT NULL);

DROP POLICY IF EXISTS "Admins update profiles" ON profiles;
CREATE POLICY "Admins update profiles" ON profiles
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
