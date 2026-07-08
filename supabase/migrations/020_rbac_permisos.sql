-- =====================================================
-- MIGRACION 020: RBAC Y PERMISOS GRANULARES (rol `gerente`)
-- Separa ROL (grueso) de CAPACIDADES (finas, `permissions` JSONB por
-- persona + defaults por rol en `role_permissions`).
-- Ejecutar en Supabase > SQL Editor. Idempotente para DBs existentes.
--
-- IMPORTANTE — ejecutar en DOS PASADAS:
--   1) Corré primero, SOLO, el bloque "PARTE 1" (el ALTER TYPE). Postgres no
--      permite usar un valor de enum recién agregado en la misma transacción
--      donde se agrega.
--   2) Una vez confirmado, corré el resto del archivo (PARTE 2 en adelante).
-- Si pegás el archivo completo de una sola vez y falla con un error de tipo
-- "unsafe use of new value of enum type", volvé a correr solo la PARTE 2
-- (todo lo que sigue después del ALTER TYPE) — el ALTER TYPE ya habrá quedado
-- aplicado.
-- =====================================================


-- =====================================================
-- PARTE 1: NUEVO ROL `gerente` EN EL ENUM user_role
-- Correr esta línea sola y esperar a que termine antes de seguir.
-- =====================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gerente';


-- =====================================================
-- PARTE 2: COLUMNA DE OVERRIDES POR PERSONA
-- =====================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN profiles.permissions IS
  'Overrides de permisos por persona. Clave = permiso (ver role_permissions), valor true=concede, false=revoca. Si la clave no está presente, se usa el default de role_permissions para el rol de la persona.';


-- =====================================================
-- PARTE 3: TABLA role_permissions (defaults por rol)
-- =====================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  role       user_role NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read role permissions" ON role_permissions;
CREATE POLICY "Anyone can read role permissions" ON role_permissions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage role permissions" ON role_permissions;
CREATE POLICY "Admins manage role permissions" ON role_permissions
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Seed de defaults. `admin` no necesita filas (is_admin() es siempre true en
-- has_permission), pero las agregamos igual para que la UI de checkboxes de
-- /admin/barberos pueda leer "todo tildado" para el rol admin sin lógica especial.
INSERT INTO role_permissions (role, permission) VALUES
  -- barbero: solo su propia agenda, ve sus clientes, opera su caja.
  -- (Su panel real es /barbero/mi-agenda, gateado por rol — no por panel.access.)
  ('barbero', 'agenda.own'),
  ('barbero', 'clients.view'),
  ('barbero', 'cash.operate'),
  -- gerente: opera el negocio día a día, pero NO ve ganancias del dueño ni
  -- configuración crítica ni gestiona staff/sucursales.
  ('gerente', 'panel.access'),
  ('gerente', 'agenda.all'),
  ('gerente', 'cash.operate'),
  ('gerente', 'products.manage'),
  ('gerente', 'services.manage'),
  ('gerente', 'clients.manage'),
  ('gerente', 'reports.view'),
  -- admin: todas las claves (dueño).
  ('admin', 'panel.access'),
  ('admin', 'agenda.own'),
  ('admin', 'agenda.all'),
  ('admin', 'finances.view'),
  ('admin', 'finances.manage'),
  ('admin', 'cash.operate'),
  ('admin', 'products.manage'),
  ('admin', 'services.manage'),
  ('admin', 'clients.view'),
  ('admin', 'clients.manage'),
  ('admin', 'staff.manage'),
  ('admin', 'branches.manage'),
  ('admin', 'reports.view'),
  ('admin', 'settings.manage')
ON CONFLICT DO NOTHING;


-- =====================================================
-- PARTE 4: FUNCIONES HELPER
-- =====================================================

-- Rol del usuario actual (tolera profiles.id == auth.uid() o auth_user_id,
-- igual que is_admin()/current_barber_id() en 006).
CREATE OR REPLACE FUNCTION current_profile_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles
  WHERE (auth_user_id = auth.uid() OR id = auth.uid())
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_profile_role() TO authenticated;

-- ¿El usuario actual tiene el permiso `perm`?
-- admin => siempre true. Si la persona tiene un override explícito en
-- profiles.permissions, ese valor manda. Si no, se usa el default de
-- role_permissions para su rol.
CREATE OR REPLACE FUNCTION has_permission(perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      user_role;
  v_overrides JSONB;
BEGIN
  SELECT role, permissions INTO v_role, v_overrides
  FROM profiles
  WHERE (auth_user_id = auth.uid() OR id = auth.uid())
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  IF v_overrides IS NOT NULL AND v_overrides ? perm THEN
    RETURN COALESCE((v_overrides ->> perm)::boolean, FALSE);
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role = v_role AND rp.permission = perm
  );
END;
$$;

GRANT EXECUTE ON FUNCTION has_permission(TEXT) TO authenticated;


-- =====================================================
-- PARTE 5: RLS — reemplazar is_admin() por permisos en tablas sensibles
-- y operativas. is_admin() se mantiene siempre como atajo (el dueño
-- nunca queda bloqueado por esta migración).
-- =====================================================

-- 5.1 Finanzas del dueño: compensación de barberos y liquidaciones.
--     Lectura con finances.view, escritura con finances.manage.
DROP POLICY IF EXISTS "Admins manage compensation" ON barber_compensation;
CREATE POLICY "Admins manage compensation" ON barber_compensation
  FOR ALL USING (is_admin() OR has_permission('finances.manage'))
  WITH CHECK (is_admin() OR has_permission('finances.manage'));

DROP POLICY IF EXISTS "Staff view compensation with finances permission" ON barber_compensation;
CREATE POLICY "Staff view compensation with finances permission" ON barber_compensation
  FOR SELECT USING (has_permission('finances.view'));

DROP POLICY IF EXISTS "Admins manage settlements" ON barber_settlements;
CREATE POLICY "Admins manage settlements" ON barber_settlements
  FOR ALL USING (is_admin() OR has_permission('finances.manage'))
  WITH CHECK (is_admin() OR has_permission('finances.manage'));

DROP POLICY IF EXISTS "Staff view settlements with finances permission" ON barber_settlements;
CREATE POLICY "Staff view settlements with finances permission" ON barber_settlements
  FOR SELECT USING (has_permission('finances.view'));

-- 5.2 Caja operativa (movimientos de caja del día a día): cash.operate.
--     Nota de diseño: se trata como operación diaria (gerente y barbero la
--     necesitan para cobrar), no como "ganancias del dueño" — eso vive en
--     barber_compensation/barber_settlements (finances.*) arriba.
DROP POLICY IF EXISTS "Admins manage cash movements" ON cash_movements;
CREATE POLICY "Admins manage cash movements" ON cash_movements
  FOR ALL USING (is_admin() OR has_permission('cash.operate'))
  WITH CHECK (is_admin() OR has_permission('cash.operate'));

-- 5.3 Catálogo operativo.
DROP POLICY IF EXISTS "Admins manage services" ON services;
CREATE POLICY "Admins manage services" ON services
  FOR ALL USING (is_admin() OR has_permission('services.manage'))
  WITH CHECK (is_admin() OR has_permission('services.manage'));

DROP POLICY IF EXISTS "Admins manage products" ON products;
CREATE POLICY "Admins manage products" ON products
  FOR ALL USING (is_admin() OR has_permission('products.manage'))
  WITH CHECK (is_admin() OR has_permission('products.manage'));

-- 5.4 Sucursales: solo admin/branches.manage (nadie tiene branches.manage
--     por defecto salvo el dueño; queda listo para delegarlo a futuro).
DROP POLICY IF EXISTS "Admins manage branches" ON branches;
CREATE POLICY "Admins manage branches" ON branches
  FOR ALL USING (is_admin() OR has_permission('branches.manage'))
  WITH CHECK (is_admin() OR has_permission('branches.manage'));

-- 5.5 Agenda: agenda.all para operar todas las citas desde el panel.
--     (El barbero sigue viendo/actualizando solo las suyas via las policies
--     "Barbers view/update own appointments" ya existentes, sin cambios.)
DROP POLICY IF EXISTS "Admins manage appointments" ON appointments;
CREATE POLICY "Admins manage appointments" ON appointments
  FOR ALL USING (is_admin() OR has_permission('agenda.all'))
  WITH CHECK (is_admin() OR has_permission('agenda.all'));

-- 5.6 Perfiles de clientes/staff.
--     Lectura ampliada a clients.view/clients.manage/staff.manage además de
--     admin y barbero (current_barber_id, sin cambios, para ver el cliente
--     de su cita). Escritura (incluye promover roles y editar `permissions`)
--     acotada a staff.manage: es gestión de personal, no de CRM.
DROP POLICY IF EXISTS "Staff can view profiles" ON profiles;
CREATE POLICY "Staff can view profiles" ON profiles
  FOR SELECT USING (
    is_admin()
    OR current_barber_id() IS NOT NULL
    OR has_permission('clients.view')
    OR has_permission('clients.manage')
    OR has_permission('staff.manage')
  );

DROP POLICY IF EXISTS "Admins update profiles" ON profiles;
CREATE POLICY "Admins update profiles" ON profiles
  FOR UPDATE USING (is_admin() OR has_permission('staff.manage'))
  WITH CHECK (is_admin() OR has_permission('staff.manage'));

-- Nota de diseño: la edición de `role`/`permissions` de cualquier perfil
-- (staff.manage) es más sensible que "gestionar clientes" (clients.manage) —
-- si se permitiera un UPDATE amplio de `profiles` con clients.manage, un
-- gerente podría auto-promoverse a admin editando su propia fila. Por eso
-- las notas de CRM del cliente se editan vía una función SECURITY DEFINER
-- acotada a la columna `notes`, no vía UPDATE directo de la tabla.
CREATE OR REPLACE FUNCTION update_client_notes(p_client_id UUID, p_notes TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_admin() OR has_permission('clients.manage')) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  UPDATE profiles SET notes = p_notes WHERE id = p_client_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_client_notes(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_client_notes(UUID, TEXT) TO authenticated;


-- =====================================================
-- FIN MIGRACION 020
-- =====================================================
