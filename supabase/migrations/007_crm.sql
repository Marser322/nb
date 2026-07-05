-- =============================================================
-- 007 — CRM: notas de cliente, logs vinculados, multi-sucursal,
-- perfiles walk-in y overview agregado de clientes.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 006).
-- =============================================================

-- Notas internas del cliente (visibles solo para staff vía RLS de 006)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notes TEXT;

-- Vincular logs de mensajes al perfil (historial por cliente, dedupe futuro)
ALTER TABLE communication_logs
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Multi-sucursal: un barbero pertenece a una sucursal (la sucursal de una
-- cita se deriva del barbero — usado por la Fase 4)
ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- El admin necesita crear perfiles walk-in (sin auth_user_id) desde el panel
DROP POLICY IF EXISTS "Admins insert profiles" ON profiles;
CREATE POLICY "Admins insert profiles" ON profiles
  FOR INSERT WITH CHECK (is_admin());

-- Overview agregado de clientes: 1 RPC en vez de N queries.
-- SECURITY DEFINER con guard is_admin() (patrón 005/006) — evita el
-- pitfall de vistas que bypasean RLS.
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
