-- =============================================================
-- 024 — CRM: segmentación de clientes + cumpleaños (FASE 33 polish).
-- Ejecutar a mano en el SQL Editor de Supabase, después de la 022 y la 023.
-- Idempotente: se puede correr N veces sin duplicar ni romper nada.
-- =============================================================

-- 1) Fecha de nacimiento en profiles (opcional, nunca obligatoria).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

-- 2) get_clients_overview_page: agrega orden dinámico (p_sort) y
-- segmentos (p_segment). Cambia la firma (agrega birth_date al RETURNS
-- TABLE y dos parámetros nuevos), así que hay que dropear la función
-- vieja explícitamente antes de recrearla (si no, Postgres deja las dos
-- versiones y PostgREST se confunde con la sobrecarga).
DROP FUNCTION IF EXISTS get_clients_overview_page(TEXT, BOOLEAN, INT, INT, INT);

CREATE OR REPLACE FUNCTION get_clients_overview_page(
  p_search TEXT DEFAULT NULL,
  p_inactive_only BOOLEAN DEFAULT false,
  p_inactive_days INT DEFAULT 30,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_sort TEXT DEFAULT 'recent',
  p_segment TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  birth_date DATE,
  created_at TIMESTAMPTZ,
  notes TEXT,
  last_visit DATE,
  total_appointments BIGINT,
  total_spent NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_search TEXT := LOWER(BTRIM(COALESCE(p_search, '')));
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_inactive_days INT := GREATEST(COALESCE(p_inactive_days, 30), 1);
  -- p_sort validado en SQL (nunca SQL dinámico): valor desconocido cae en 'recent'.
  v_sort TEXT := CASE WHEN p_sort IN ('recent', 'spent', 'visits', 'name') THEN p_sort ELSE 'recent' END;
  -- 'inactivos' como segmento es el mismo criterio que p_inactive_only (se mantiene por compatibilidad
  -- con llamadas legacy que solo pasan p_inactive_only).
  v_inactive_effective BOOLEAN := COALESCE(p_inactive_only, false) OR p_segment = 'inactivos';
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  RETURN QUERY
  WITH overview AS (
    SELECT
      p.id,
      p.full_name,
      p.phone,
      p.avatar_url,
      p.birth_date,
      p.created_at,
      p.notes,
      MAX(a.appointment_date) FILTER (WHERE a.status = 'completed')::DATE AS last_visit,
      COUNT(a.id) FILTER (WHERE a.status = 'completed')::BIGINT AS total_appointments,
      (
        COALESCE(SUM(s.price) FILTER (WHERE a.status = 'completed'), 0)
        + COALESCE((
          SELECT SUM(o.total)
          FROM orders o
          WHERE o.client_id = p.id
            AND o.status IN ('paid', 'shipped', 'delivered')
        ), 0)
      )::NUMERIC AS total_spent
    FROM profiles p
    LEFT JOIN appointments a ON a.client_id = p.id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE p.role = 'cliente'
    GROUP BY p.id
  ),
  filtered AS (
    SELECT *
    FROM overview o
    WHERE (
        v_search = ''
        OR LOWER(COALESCE(o.full_name, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(o.phone, '')) LIKE '%' || v_search || '%'
      )
      AND (
        NOT v_inactive_effective
        OR o.last_visit IS NULL
        OR o.last_visit < (CURRENT_DATE - v_inactive_days)
      )
      AND (
        p_segment IS DISTINCT FROM 'nuevos'
        OR o.created_at >= (NOW() - INTERVAL '30 days')
      )
      AND (
        p_segment IS DISTINCT FROM 'cumple_mes'
        OR (o.birth_date IS NOT NULL AND EXTRACT(MONTH FROM o.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE))
      )
  )
  SELECT
    f.id,
    f.full_name,
    f.phone,
    f.avatar_url,
    f.birth_date,
    f.created_at,
    f.notes,
    f.last_visit,
    f.total_appointments,
    f.total_spent,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN v_sort = 'spent' THEN f.total_spent END DESC NULLS LAST,
    CASE WHEN v_sort = 'visits' THEN f.total_appointments END DESC NULLS LAST,
    CASE WHEN v_sort = 'name' THEN f.full_name END ASC NULLS LAST,
    CASE WHEN v_sort = 'recent' AND v_inactive_effective THEN f.last_visit END ASC NULLS LAST,
    CASE WHEN v_sort = 'recent' AND NOT v_inactive_effective THEN f.last_visit END DESC NULLS LAST,
    f.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_clients_overview_page(TEXT, BOOLEAN, INT, INT, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_clients_overview_page(TEXT, BOOLEAN, INT, INT, INT, TEXT, TEXT) TO authenticated;

-- 3) Evento 'birthday' en message_templates (sistema de FASE 30), con guard
-- de existencia por si esta migración corre en una DB donde aún no se
-- aplicó la 022.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'message_templates'
  ) THEN
    EXECUTE 'ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_event_type_check';
    EXECUTE $ct$
      ALTER TABLE message_templates ADD CONSTRAINT message_templates_event_type_check
        CHECK (event_type IN ('cancelled', 'confirmed', 'rescheduled', 'reminder', 'thanks', 'birthday'))
    $ct$;

    EXECUTE $ins$
      INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
      SELECT 'birthday', 'Cumpleaños estándar',
        '¡Feliz cumpleaños, {nombre}! 🎉 De regalo, te esperamos en NB Barber para que arranques tu año con el mejor look. Reservá tu turno cuando quieras.',
        true, 0
      WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'birthday')
    $ins$;
  END IF;
END $$;

-- Nota: no hace falta una RPC admin_update_client_birth_date — la policy
-- "Admins update profiles" (FOR UPDATE USING (is_admin())) ya permite que
-- el admin actualice birth_date de cualquier perfil directamente vía
-- supabase.from('profiles').update(...), igual que hace hoy con notes.
