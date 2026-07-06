-- =============================================================
-- 015 — Nuevos feature flags para lookbook, reservas_online y portal_barbero.
-- =============================================================

INSERT INTO app_settings (key, value, description) VALUES
  ('feature.lookbook', 'true'::jsonb, 'Galería de estilos (lookbook)'),
  ('feature.reservas_online', 'true'::jsonb, 'Reservas online (wizard web)'),
  ('feature.portal_barbero', 'true'::jsonb, 'Portal de agenda para barberos')
ON CONFLICT (key) DO NOTHING;
