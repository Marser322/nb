-- =============================================================
-- 023 — Chat que aprende: logs de conversaciones + base de
-- conocimiento auto-aprendida con guardrails (FASE 31 polish).
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 013).
-- Idempotente: se puede correr N veces sin duplicar.
-- =============================================================

CREATE TABLE IF NOT EXISTS chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode TEXT NOT NULL CHECK (mode IN ('client','admin')),
    question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    answer TEXT,
    provider TEXT NOT NULL CHECK (provider IN ('gemini','openai','rules')),
    was_fallback BOOLEAN NOT NULL DEFAULT false, -- cayó en la rama genérica "no supe responder"
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs (created_at DESC);

ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- Solo el admin puede leer/borrar logs; no hay policy de INSERT porque
-- el registro entra únicamente vía la RPC SECURITY DEFINER log_chat_message.
DROP POLICY IF EXISTS "Admins view chat logs" ON chat_logs;
CREATE POLICY "Admins view chat logs" ON chat_logs
  FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "Admins delete chat logs" ON chat_logs;
CREATE POLICY "Admins delete chat logs" ON chat_logs
  FOR DELETE USING (is_admin());

CREATE TABLE IF NOT EXISTS chat_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_knowledge_normalized ON chat_knowledge (normalized_question);

ALTER TABLE chat_knowledge ENABLE ROW LEVEL SECURITY;

-- El route del chat corre como anon y necesita leer las entradas activas
-- para inyectarlas en el prompt; el admin gestiona todo desde el panel.
DROP POLICY IF EXISTS "Public read active chat knowledge" ON chat_knowledge;
CREATE POLICY "Public read active chat knowledge" ON chat_knowledge
  FOR SELECT USING (is_active = true OR is_admin());
DROP POLICY IF EXISTS "Admins manage chat knowledge" ON chat_knowledge;
CREATE POLICY "Admins manage chat knowledge" ON chat_knowledge
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- -------------------------------------------------------------
-- log_chat_message: registra cada intercambio del chat. Nunca falla el
-- caller por datos largos (trunca en vez de rechazar). Se llama desde el
-- route de la API con after() (fire-and-forget), fuera del camino crítico.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_chat_message(
  p_mode TEXT,
  p_question TEXT,
  p_answer TEXT,
  p_provider TEXT,
  p_was_fallback BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question TEXT;
  v_answer TEXT;
BEGIN
  IF p_mode NOT IN ('client', 'admin') THEN RETURN; END IF;
  IF p_provider NOT IN ('gemini', 'openai', 'rules') THEN RETURN; END IF;
  IF p_question IS NULL OR length(trim(p_question)) = 0 THEN RETURN; END IF;

  v_question := left(p_question, 500);
  v_answer := CASE WHEN p_answer IS NULL THEN NULL ELSE left(p_answer, 4000) END;

  INSERT INTO chat_logs (mode, question, normalized_question, answer, provider, was_fallback)
  VALUES (
    p_mode,
    v_question,
    lower(translate(v_question,
      'áéíóúÁÉÍÓÚñÑüÜ',
      'aeiouAEIOUnNuU'
    )),
    v_answer,
    p_provider,
    COALESCE(p_was_fallback, false)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION log_chat_message(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_chat_message(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

-- -------------------------------------------------------------
-- learn_chat_knowledge: inserta una entrada auto-aprendida. Dedupe por
-- normalized_question (ON CONFLICT DO NOTHING) y cap duro de 200 filas
-- con source='auto' para que el auto-aprendizaje nunca crezca sin límite.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION learn_chat_knowledge(
  p_question TEXT,
  p_answer TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question TEXT;
  v_answer TEXT;
  v_normalized TEXT;
  v_auto_count INT;
BEGIN
  IF p_question IS NULL OR length(trim(p_question)) = 0 THEN RETURN; END IF;
  IF p_answer IS NULL OR length(trim(p_answer)) = 0 THEN RETURN; END IF;

  v_question := left(p_question, 300);
  v_answer := left(p_answer, 1000);
  v_normalized := lower(translate(v_question,
    'áéíóúÁÉÍÓÚñÑüÜ',
    'aeiouAEIOUnNuU'
  ));

  SELECT count(*) INTO v_auto_count FROM chat_knowledge WHERE source = 'auto';
  IF v_auto_count >= 200 THEN RETURN; END IF;

  INSERT INTO chat_knowledge (question, normalized_question, answer, source)
  VALUES (v_question, v_normalized, v_answer, 'auto')
  ON CONFLICT (normalized_question) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION learn_chat_knowledge(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION learn_chat_knowledge(TEXT, TEXT) TO anon, authenticated;

-- Flag: apaga solo la extracción automática (el logging de preguntas es
-- analytics y queda siempre activo, sin flag propio).
INSERT INTO app_settings (key, value, description) VALUES
  ('feature.chat_aprendizaje', 'true'::jsonb, 'Auto-aprendizaje del asistente IA (base de conocimiento)')
ON CONFLICT (key) DO NOTHING;
