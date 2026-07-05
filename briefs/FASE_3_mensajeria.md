# FASE 3 — Mensajería WhatsApp (wa.me + log + plantillas)

> Leer primero `briefs/README.md`. **Requiere Fases 1 y 2** (usa `communication_logs.client_id` de la migración 007).

## Contexto

El dueño quiere contactar clientes desde el panel (recordatorios, reactivación). Decisión tomada: **sin API paga de WhatsApp** — deep-links `wa.me` con mensaje prellenado desde plantillas, y registro manual en `communication_logs`. Las tablas `reminders_config` (plantillas: `days_since_last_visit`, `message_template`, `is_active`, `channel`) y `communication_logs` (`client_id`, `client_name`, `client_phone`, `message_sent`, `status`, `sent_at`, `metadata`) ya existen.

⚠️ `communication_logs.status` tiene CHECK que solo admite `'sent' | 'failed' | 'delivered'` — no inventar otros estados.

## Tareas

### 1. `src/lib/whatsapp.ts`

- `normalizeUyPhone(phone: string): string | null` — quita espacios, guiones y paréntesis; `09XXXXXXX` → `5989XXXXXXX`; si ya empieza con `598` (o `+598`) lo normaliza sin duplicar; devuelve `null` si no parece un teléfono válido. **Los teléfonos en `profiles.phone` hoy están en formato libre** ("099 123 456") — esta función es la única puerta de normalización (la reusa la Fase 4).
- `fillTemplate(template: string, vars: Record<string, string>): string` — reemplaza placeholders `{nombre}` (extensible a otros).
- `buildWaLink(phone: string, message: string): string` — `https://wa.me/${normalizado}?text=${encodeURIComponent(message)}`.
- Tests mentales en comentario del archivo: `"099 123 456"` → `59899123456`.

### 2. `src/components/admin/send-whatsapp-dialog.tsx` (componente compartido)

Props: `{ clientId?: string; clientName: string; clientPhone: string | null }` + control de apertura. Contenido:

- Select de plantilla: filas de `reminders_config` (todas, marcando inactivas); al elegir, prellenar Textarea con `fillTemplate(message_template, { nombre: clientName })`.
- Textarea editable (el admin puede ajustar el mensaje).
- Botón **"Abrir WhatsApp"**: `window.open(buildWaLink(...), '_blank')` **e** insertar en `communication_logs`: `{ client_id, client_name, client_phone, message_sent, status: 'sent', metadata: { source: 'manual', template_id } }`. Toast de confirmación.
- Si `clientPhone` es null o no normaliza → botón deshabilitado con hint "El cliente no tiene teléfono válido".

Lo reusan: lista de clientes, detalle de cliente y el dashboard (Fase 5).

### 3. `src/app/admin/mensajes/page.tsx`

Tabs shadcn:

- **"Historial"**: Table de `communication_logs` descendente por `sent_at`, búsqueda en memoria por nombre/teléfono, Badge por `status`, columna con extracto del mensaje (truncado con tooltip o expandible).
- **"Plantillas"**: CRUD de `reminders_config` con el patrón Dialog+Table+Switch de `src/app/admin/servicios/page.tsx`: campos "Días de inactividad" (number), "Plantilla del mensaje" (Textarea con hint «usá `{nombre}` para personalizar»), Switch `is_active`. `channel` queda fijo en `'whatsapp'` (no exponer en el form).

### 4. Integración

- Botón/acción "Enviar mensaje" (icono `MessageCircle`) en la lista de clientes (columna de acciones) y en el detalle (`/admin/clientes/[id]`, junto al teléfono). También listar los mensajes del cliente en su tab "Mensajes" (ya creada en Fase 2 — verificar que muestre los nuevos logs).
- `src/app/admin/layout.tsx`: link "Mensajes" en sidebar (icono `MessageCircle`).
- `src/lib/constants.ts`: `ROUTES.ADMIN_MENSAJES = '/admin/mensajes'`.

### Enchufe futuro (documentar en comentario, NO construir ahora)

La Edge Function de recordatorios automáticos solo tendrá que: leer `reminders_config` activas → cruzar con `get_clients_overview()` (clientes con `last_visit` mayor a `days_since_last_visit`) → abrir logs con `metadata.source='auto'`, dedupeando por `client_id` + `sent_at` reciente. Todo el schema queda listo con esta fase.

## Criterios de aceptación

- [ ] Desde lista y detalle de cliente: elegir plantilla → se abre WhatsApp con el mensaje personalizado y el teléfono correcto (probar con un número real en formato "099 xxx xxx").
- [ ] El envío queda registrado en `communication_logs` con `client_id` y aparece en el historial y en la tab del cliente.
- [ ] CRUD de plantillas completo (crear, editar, activar/desactivar).
- [ ] Cliente sin teléfono → botón deshabilitado, sin crash.
- [ ] `npm run build` y `npm run lint` pasan.
