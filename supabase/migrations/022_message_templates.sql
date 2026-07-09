-- FASE 30: Plantillas de mensajes contextuales por evento de cita
-- Correr a mano en el SQL Editor de Supabase (convención del proyecto).
-- Idempotente: seguro de re-ejecutar. NO toca reminders_config (reactivación por inactividad, queda intacta).

CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (event_type IN ('cancelled', 'confirmed', 'rescheduled', 'reminder', 'thanks')),
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Policy admin-only, espejo exacto de "Admins manage reminders config" (src/lib/supabase_schema.sql)
DROP POLICY IF EXISTS "Admins manage message templates" ON message_templates;
CREATE POLICY "Admins manage message templates" ON message_templates
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Seeds: una plantilla activa por evento, voseo uruguayo, con variables
-- {nombre} {fecha} {hora} {barbero} {servicio} {sucursal}
INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'cancelled', 'Cancelación estándar',
  'Hola {nombre}, lamentamos avisarte que tuvimos que cancelar tu cita de {servicio} del {fecha} a las {hora}. Escribinos y te buscamos un nuevo horario que te quede bien. ¡Disculpá las molestias!',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'cancelled');

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'confirmed', 'Confirmación estándar',
  '¡Hola {nombre}! Te confirmamos tu cita de {servicio} el {fecha} a las {hora} con {barbero} en {sucursal}. ¡Te esperamos!',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'confirmed');

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'rescheduled', 'Reprogramación estándar',
  'Hola {nombre}, tu cita de {servicio} quedó reprogramada para el {fecha} a las {hora} con {barbero} en {sucursal}. Si no te sirve el horario, avisanos y lo ajustamos.',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'rescheduled');

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'reminder', 'Recordatorio estándar',
  '¡Hola {nombre}! Te recordamos tu cita de {servicio} mañana {fecha} a las {hora} con {barbero} en {sucursal}. Si no llegás, avisanos con 2 horas de anticipación. ¡Nos vemos!',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'reminder');

INSERT INTO message_templates (event_type, name, body, is_active, sort_order)
SELECT 'thanks', 'Agradecimiento estándar',
  '¡Gracias por tu visita, {nombre}! Esperamos que disfrutes tu {servicio}. Cuando quieras repetir, reservá en un toque desde la web. 💈',
  true, 0
WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = 'thanks');
