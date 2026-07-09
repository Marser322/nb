# FASE 30 — Polish: Plantillas de mensajes contextuales

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-09).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que cada evento de una cita (cancelación, confirmación, reprogramación, recordatorio, agradecimiento) tenga su plantilla de WhatsApp editable con variables, y que el panel de citas ofrezca avisar al cliente en 1 toque justo después de la acción — sin automatizar nada.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas)

- Librería WhatsApp completa y genérica: `normalizeUyPhone` (`src/lib/whatsapp.ts:6-30`), `fillTemplate` que ya reemplaza **cualquier** `{var}` (`src/lib/whatsapp.ts:36-42`), `buildWaLink` (`src/lib/whatsapp.ts:47-51`).
- `SendWhatsappDialog` (`src/components/admin/send-whatsapp-dialog.tsx`): carga plantillas **solo de `reminders_config`** (`:60-63`), rellena **solo `{nombre}`** (`:89`), abre `wa.me` y registra en `communication_logs` con `metadata { source: "manual", template_id }` (`:113-127`). Props actuales: `clientId/clientName/clientPhone/isOpen/onOpenChange/onLogAdded` (`:27-34`) — no acepta mensaje precargado ni contexto de evento.
- `reminders_config` solo modela reactivación por inactividad: `days_since_last_visit + message_template + is_active + channel` (`src/lib/supabase_schema.sql:337-345`). No hay plantillas por evento de cita.
- `communication_logs` con CHECK `status IN ('sent','failed','delivered')` (`src/lib/supabase_schema.sql:347-355`); `client_id` se agrega en `supabase/migrations/007_crm.sql`. Labels/colores en `src/lib/constants.ts:105-118`.
- Panel de citas (`src/app/admin/citas/page.tsx`):
  - `updateStatus()` → RPC `admin_update_appointment_status`, toast de éxito y update local (`:206-223`). Cancelar/confirmar/completar se disparan desde `AgendaTimeline` (`:799-808`); botón "Cancelar" en la tarjeta (`:1054-1062`).
  - Reprogramación → RPC `admin_reschedule_appointment` con toast "Cita reprogramada" (`:259-289`).
  - **Después de cancelar/reprogramar/confirmar no pasa nada más**: el cliente no se entera salvo que el operador abra WhatsApp a mano y redacte de cero.
  - Ya importa `normalizeUyPhone` (`:49`). Teléfono del cliente registrado: `appointment.client?.phone` (relación cargada en `:120-124`). Walk-ins: el teléfono vive embebido en `notes` con formato `"Walk-in. Cliente: X - Tel: Y"` (`:341`); `getClientName` ya parsea ese string (`:1074-1076`). `getBranchName` resuelve sucursal (`:1078-1081`).
- `/admin/mensajes` (`src/app/admin/mensajes/page.tsx`): tabs "Historial de Envíos" + "Plantillas de Recordatorio" (`:244-254`); el CRUD de plantillas opera solo sobre `reminders_config` (`:85-99`, `:109-162`). Gated por `features.mensajes_crm` (`:41-46`).
- Tipos en `src/types/database.types.ts:240-259` (`CommunicationLog`, `RemindersConfig`). `Appointment` en `:58-75` (tiene `client?/barber?/service?` expandidos).
- Máxima migración actual: `021_service_categories.sql` → la nueva es **022**.

## Análisis (máximo valor / qué NO se hace)

**Valor a extraer**: el momento de mayor fricción real del mostrador es "cancelé/moví la cita, ahora tengo que avisarle al cliente". Hoy la barbería tiene toda la infraestructura (normalización de teléfono, `wa.me`, logging) pero solo la usa para reactivación de inactivos. Con una tabla chica de plantillas por evento + variables resueltas desde la cita (`{nombre} {fecha} {hora} {barbero} {servicio} {sucursal}`), cada acción del panel termina con un botón "Avisar por WhatsApp" que abre el mensaje ya redactado. Cero tipeo, tono consistente de la marca, y todo queda asentado en `communication_logs`.

**Reutilización (no inventar nada)**: `fillTemplate` ya soporta variables arbitrarias; `SendWhatsappDialog` ya tiene el flujo completo abrir-wa.me-y-loguear; el toast de sonner ya usado en citas soporta `action` (botón dentro del toast); los labels van a `constants.ts` como los demás estados.

**Fuera de alcance en este ciclo (anti-monstruo)**:
- NO envíos automáticos ni programados (sigue la decisión de producto: `wa.me` manual, ver `supabase/functions/send-reminders/index.ts` que es read-only a propósito). Nada de cron/edge functions nuevas.
- NO WhatsApp Business API, NO email, NO SMS.
- NO migrar ni tocar `reminders_config` (la reactivación por inactividad queda exactamente como está; convive con la tabla nueva).
- NO plantillas por sucursal/barbero, NO editor visual de variables, NO multi-idioma.
- NO recordatorios masivos ("mandar a todos los de mañana") — anotado en `ROADMAP_CRECIMIENTO.md`.

## Trabajo — Base de datos

1. Nueva migración `supabase/migrations/022_message_templates.sql`, **idempotente** (`CREATE TABLE IF NOT EXISTS`, seeds con `WHERE NOT EXISTS`, `DROP POLICY IF EXISTS` antes de cada policy). NO aplicarla a la DB (la corre Mario en el SQL Editor). Replicar el contenido en `src/lib/supabase_schema.sql` y `supabase/migrations/999_FULL_SETUP.sql`.

```sql
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (event_type IN ('cancelled','confirmed','rescheduled','reminder','thanks')),
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
-- Policy admin-only, espejo exacto de "Admins manage reminders config" (src/lib/supabase_schema.sql:540-542)
```

2. Seeds (uno por evento, voseo uruguayo, `WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE event_type = '...')`). Textos de referencia (ajustar tono si hace falta, siempre con variables):
   - `cancelled`: `Hola {nombre}, lamentamos avisarte que tuvimos que cancelar tu cita de {servicio} del {fecha} a las {hora}. Escribinos y te buscamos un nuevo horario que te quede bien. ¡Disculpá las molestias!`
   - `confirmed`: `¡Hola {nombre}! Te confirmamos tu cita de {servicio} el {fecha} a las {hora} con {barbero} en {sucursal}. ¡Te esperamos!`
   - `rescheduled`: `Hola {nombre}, tu cita de {servicio} quedó reprogramada para el {fecha} a las {hora} con {barbero} en {sucursal}. Si no te sirve el horario, avisanos y lo ajustamos.`
   - `reminder`: `¡Hola {nombre}! Te recordamos tu cita de {servicio} mañana {fecha} a las {hora} con {barbero} en {sucursal}. Si no llegás, avisanos con 2 horas de anticipación. ¡Nos vemos!`
   - `thanks`: `¡Gracias por tu visita, {nombre}! Esperamos que disfrutes tu {servicio}. Cuando quieras repetir, reservá en un toque desde la web. 💈`

## Trabajo — App

### Bloque A — Tipos, constants y extensión del diálogo

1. `src/types/database.types.ts`: agregar `MessageTemplate` (espejo de la tabla) junto a `RemindersConfig` (`:251`).
2. `src/lib/constants.ts`: agregar `MESSAGE_EVENT_TYPES` y `MESSAGE_EVENT_LABELS: Record<string, string>` (`cancelled: "Cancelación"`, `confirmed: "Confirmación"`, `rescheduled: "Reprogramación"`, `reminder: "Recordatorio de cita"`, `thanks: "Agradecimiento"`) siguiendo el patrón de `COMMUNICATION_STATUS_LABELS` (`:105`). No duplicar strings en las páginas.
3. `src/components/admin/send-whatsapp-dialog.tsx`: extender con props **opcionales** `eventType?: string` y `templateVars?: Record<string, string>` (retro-compatible: sin `eventType` se comporta exactamente igual que hoy).
   - Con `eventType`: cargar plantillas de `message_templates` filtradas por `event_type` y activas; preseleccionar la primera y precargar el textarea con `fillTemplate(body, templateVars)` (el operador puede editar antes de abrir WhatsApp). `fillTemplate` ya reemplaza cualquier variable (`src/lib/whatsapp.ts:36-42`) — solo hay que pasarle el diccionario completo.
   - En el log a `communication_logs` (`:113-127`), incluir en `metadata`: `source: "appointment_event"`, `event_type`, `appointment_id` (nuevo prop opcional `appointmentId?: string`), además del `template_id` existente.

### Bloque B — Integración en /admin/citas

1. En `src/app/admin/citas/page.tsx`, crear helper `getClientPhone(appointment)` junto a `getClientName` (`:1074-1076`): devuelve `appointment.client?.phone` o, para walk-ins, parsea `notes` buscando `"Tel: "` (formato generado en `:341`). Devolver `null` si no hay.
2. Helper `buildTemplateVars(appointment)` que arma el diccionario: `nombre` (via `getClientName`), `fecha` (`format(new Date(\`${apt.appointment_date}T12:00:00\`), "EEEE d 'de' MMMM", { locale: es })`, patrón ya usado en `:412`), `hora` (`start_time.slice(0,5)`), `barbero` (`apt.barber?.name`), `servicio` (`apt.service?.name`), `sucursal` (via `getBranchName`, `:1078-1081`).
3. Estado `notifyApt: { appointment, eventType } | null` + render de `SendWhatsappDialog` con `eventType`, `templateVars`, `appointmentId` y el teléfono resuelto.
4. Ofrecer el aviso justo después de cada acción exitosa (solo si `getClientPhone` devuelve algo y `features.mensajes_crm` está activo — usar el `features` ya presente en `:78`):
   - En `updateStatus` (`:206-223`): tras el `toast.success`, si `newStatus` es `"cancelled"` o `"confirmed"`, usar `toast.success(..., { action: { label: "Avisar por WhatsApp", onClick: () => setNotifyApt({ appointment, eventType: newStatus }) } })`. Requiere pasar la cita completa (cambiar la firma a `updateStatus(cita, newStatus)`; los call sites `:799-808` ya tienen la cita).
   - En `handleReschedule` (`:259-289`): igual, con `eventType: "rescheduled"` — armar las vars con la **nueva** fecha/hora (`rescheduleDate`/`rescheduleTime`), no las viejas.
5. Botón discreto de WhatsApp en `AppointmentCard` (junto a Reprogramar, `:1050-1053`) visible para citas `pending/confirmed` con teléfono válido: abre el diálogo con `eventType: "reminder"` (cubre "recordarle la cita de mañana" sin automatización). Para citas `completed`, mismo botón con `eventType: "thanks"` (reemplaza el "Sin acciones pendientes" de `:1065-1067` solo cuando hay teléfono).

### Bloque C — CRUD en /admin/mensajes

1. En `src/app/admin/mensajes/page.tsx`, dentro del tab "Plantillas" (`:352+`), dividir en dos secciones: **"Reactivación por inactividad"** (la tabla actual de `reminders_config`, sin cambios funcionales) y **"Plantillas por evento de cita"** (nueva): tabla de `message_templates` agrupada/etiquetada con `MESSAGE_EVENT_LABELS`, con crear/editar/eliminar/toggle activo reusando el mismo patrón de diálogo y switches ya presente (`:358-507`).
2. En el formulario de plantilla por evento: select de `event_type` (labels de constants), nombre, textarea del cuerpo, y tip actualizado listando las variables disponibles: `{nombre} {fecha} {hora} {barbero} {servicio} {sucursal}` (hoy el tip solo menciona `{nombre}`, `:393-395`).
3. En el tab "Historial", si `metadata.event_type` existe, mostrar un badge chico con el label del evento (los logs ya traen `metadata`, `:333`).

## Parte manual (Mario)

- Correr `supabase/migrations/022_message_templates.sql` en el SQL Editor de la DB existente (la 999 ya la incluye para DBs frescas).
- Revisar/ajustar el texto de las 5 plantillas seed desde `/admin/mensajes` con el tono de la casa.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Prueba manual en navegador, ambos temas, y a 375px:
  1. Cancelar una cita con cliente registrado → toast con "Avisar por WhatsApp" → diálogo con mensaje de cancelación ya relleno (fecha/hora/servicio correctos) → "Abrir WhatsApp" abre `wa.me` con el texto y queda el log en `/admin/mensajes` → Historial con badge "Cancelación".
  2. Reprogramar → el mensaje precargado muestra la **nueva** fecha/hora.
  3. Cita walk-in con teléfono en notes → el diálogo resuelve el teléfono; walk-in sin teléfono → no se ofrece el aviso (sin toast action ni botón).
  4. Botón WhatsApp de una cita confirmada → plantilla de recordatorio; de una completada → agradecimiento.
  5. CRUD de plantillas por evento en `/admin/mensajes` (crear, editar, desactivar → desaparece del diálogo).
  6. `SendWhatsappDialog` desde `/admin/clientes` (sin `eventType`) sigue funcionando igual que antes (plantillas de reactivación).
  7. Con `features.mensajes_crm` apagado en `/admin/configuracion`, no aparecen ofertas de aviso en citas.

## Criterios de aceptación

- 5 tipos de evento con plantilla seed activa, editables desde `/admin/mensajes`, con variables `{nombre} {fecha} {hora} {barbero} {servicio} {sucursal}` resueltas desde la cita real.
- Cancelar/confirmar/reprogramar ofrece el aviso en 1 toque; recordatorio y agradecimiento disponibles por cita desde la tarjeta.
- Todo envío queda en `communication_logs` con `metadata.event_type` y `appointment_id`; nada se envía automáticamente.
- `reminders_config` y sus flujos quedan intactos; labels nuevos solo en `constants.ts`; migración espejada en `supabase_schema.sql` y `999_FULL_SETUP.sql`.

## Restricciones

- Rama `feat/polish-plantillas-mensajes`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard (`if (!features.X) return`, `if (loading) return`) va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels de citas, órdenes y eventos de mensaje viven en `src/lib/constants.ts` — no duplicar strings.
- La migración 022 debe ser idempotente y NO aplicarse desde código.
