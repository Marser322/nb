-- =============================================================
-- 013 — Configuración de la aplicación y feature flags.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 006).
-- =============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- La web pública (anon) solo puede leer flags de features;
-- cualquier otro setting queda admin-only por defecto.
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
