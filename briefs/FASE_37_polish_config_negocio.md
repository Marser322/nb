# FASE 37 — Polish: Configuración — negocio editable

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-09).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que el dueño edite desde `/admin/configuracion` los datos y políticas del negocio (contacto, horarios de copy, ventana de cancelación, tolerancia, datos bancarios) sin tocar código, con la ventana de cancelación aplicada de verdad en el servidor.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas 2026-07-09)

- `BUSINESS_CONFIG` es una constante en código: name, location, phone, email, instagram, workingHours {start:9,end:20} y workingDays [1-6] (marcados "solo branding/copy"), cancellationWindow 120, timeSlotMinutes 30 (`src/lib/constants.ts:4-25`). `BANK_TRANSFER_INFO` vacío al lado (`src/lib/constants.ts:29-33`).
- Consumidores directos (todos leen la constante):
  - Footer: phone, instagram, location y horarios — con "Lunes a Viernes" y "Sábados" hardcodeados mostrando **las mismas horas** (`src/components/layout/Footer.tsx:106-135`).
  - Contacto: copy de horas y email (`src/app/(main)/contacto/ContactoContent.tsx:64,424`).
  - Home y lookbook: `buildWaLink(BUSINESS_CONFIG.phone, …)` (`src/app/page.tsx:43,131`, `src/app/(main)/lookbook/page.tsx:26`).
  - Checkout success: phone para WhatsApp (`src/app/(main)/checkout/success/page.tsx:64`); checkout y success leen `BANK_TRANSFER_INFO` (`src/app/(main)/checkout/page.tsx:19-26`).
  - Mi cuenta: label de la ventana de cancelación (`src/app/(main)/mi-cuenta/page.tsx:77-79`).
  - Admin citas: `workingHours` para la grilla de reprogramación y `timeSlotMinutes` (`src/app/admin/citas/page.tsx:396-499`).
  - Layout: JSON-LD con name/phone/hours/days (server component, `src/app/layout.tsx:58-74`).
  - Chat: `businessHoursCopy` calculado **a nivel módulo** (una vez al importar — nunca se actualizaría, `src/app/api/chat/route.ts:117-119`), ventana de cancelación en 3 lugares (`:578,789,893`) y tolerancia de 10 min hardcodeada en el copy (`:893`). Helper `formatWorkingDaysLabel` vive en el route (`:101-111`).
- Ventana de cancelación duplicada y hardcodeada en ambos lados: cliente `canCancelAppointment` con -120 fijo (`src/lib/utils.ts:71-77`) y RPC `cancel_appointment` con `interval '2 hours'` fijo (`src/lib/supabase_schema.sql:1018-1021`).
- Mecanismo listo para extender: `app_settings` (key/value JSONB, `src/lib/supabase_schema.sql:1388-1402`) con RLS **que solo permite lectura pública de `feature.%`** (`:1397-1399`) — las claves nuevas `business.%` necesitan ampliar esa policy. `src/lib/features.ts` implementa el patrón completo: fetch con cache 5 min + fail-open a DEFAULTS + `useFeatures()` + `invalidateFeatures()` con listeners (`src/lib/features.ts:25-125`).
- `/admin/configuracion` es un grid de cards con switches de `feature.%` con update directo a `app_settings` + `invalidateFeatures()` (`src/app/admin/configuracion/page.tsx:97-178`).
- El chat ya consulta `app_settings` server-side para los flags (`src/app/api/chat/route.ts:324-333`) — el patrón de lectura server existe.

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: hoy cambiar un teléfono, el horario del footer o la política de cancelación requiere un deploy. Todo el mecanismo para hacerlo editable ya existe (`app_settings` + patrón features.ts + página de configuración); es replicar el patrón con claves `business.%`. Profundidad real: la ventana de cancelación pasa a estar **enforced en el RPC** leyendo el setting (hoy si mañana quieren 3 horas, hay que editar SQL), y los datos bancarios se cargan por UI (pendiente manual de Mario que muere acá). El chat deja de mentir: su copy de horarios/políticas se arma por request con los valores vigentes.
- **Fuera de alcance en este ciclo** (anti-monstruo):
  - `timeSlotMinutes` NO editable: es estructural (el RPC `get_availability` hardcodea `slot_minutes := 30`); cambiarlo requiere tocar disponibilidad en vivo.
  - Los horarios de disponibilidad real NO se tocan: `working_hours` de barbers/branches ya tienen su editor. Esto es solo copy/políticas.
  - `name` y `location` NO editables (branding fijo; JSON-LD y logo dependen de eso).
  - Sin historial/auditoría de cambios de settings, sin multi-idioma, sin páginas legales editables.

## Trabajo — Base de datos

1. Nueva migración `supabase/migrations/027_business_settings.sql`, idempotente. **NO aplicarla a la DB** (la corre Mario o Fable después). Contenido:
   - Ampliar la policy de lectura pública: `DROP POLICY ... "Public read feature flags"` y recrearla como `USING (key LIKE 'feature.%' OR key LIKE 'business.%' OR is_admin())` (ancla actual: `src/lib/supabase_schema.sql:1397-1399`).
   - Seed con `ON CONFLICT (key) DO NOTHING` (valores actuales de `constants.ts` como default):
     - `business.phone` → `"+598 99 123 456"`, `business.email` → `"contacto@nbbarber.com"`, `business.instagram` → `"@newbrothers.uy"`
     - `business.working_hours` → `{"start": 9, "end": 20}`, `business.working_days` → `[1,2,3,4,5,6]`
     - `business.cancellation_window_minutes` → `120`, `business.late_tolerance_minutes` → `10`
     - `business.bank_transfer` → `{"bank": "", "account": "", "holder": ""}`
     - Cada una con `description` clara en español (aparece como hint en la UI).
   - `CREATE OR REPLACE` de `cancel_appointment` cambiando SOLO la línea de la ventana: leer `COALESCE((SELECT (value #>> '{}')::int FROM app_settings WHERE key = 'business.cancellation_window_minutes'), 120)` y usar `make_interval(mins => …)` en lugar de `interval '2 hours'` (`src/lib/supabase_schema.sql:1018-1021`). Mantener firma, permisos y el resto del cuerpo idénticos.
2. Replicar en `src/lib/supabase_schema.sql` **y** `supabase/migrations/999_FULL_SETUP.sql`: son copias idénticas (regla del repo: `diff` vacío entre ambos). En el 999/espejo, editar la policy y el RPC en su definición original y agregar el seed al final como sección "MIGRACION 027".

## Trabajo — App

### Bloque A — `src/lib/business-config.ts` nuevo + ventana parametrizada

1. Crear `src/lib/business-config.ts` calcado del patrón de `src/lib/features.ts` (cache 5 min, in-flight promise, fail-open, listeners):
   - `type BusinessConfig = { phone; email; instagram; workingHours: {start; end}; workingDays: number[]; cancellationWindowMinutes; lateToleranceMinutes; bankTransfer: {bank; account; holder} }`.
   - `DEFAULTS` importados de `BUSINESS_CONFIG`/`BANK_TRANSFER_INFO` de `constants.ts` (las constantes quedan como fallback y NO se borran; actualizar su comentario: "defaults de fallback; los valores vivos se editan en /admin/configuracion").
   - `fetchBusinessConfig()` (browser, lee `app_settings` con `like("key", "business.%")`), `useBusinessConfig()` → `{ config, isLoaded }`, `invalidateBusinessConfig()`.
   - Mover acá `formatWorkingDaysLabel` + `DAY_NAMES` desde `src/app/api/chat/route.ts:98-111` (el route la importa) y exportar un helper `businessHoursLabel(config)` → `"Lunes a Sábado: 09:00 - 20:00"` para footer/contacto/chat.
   - Helper server `getBusinessConfigServer(supabase)` que hace la misma query con un cliente pasado por parámetro (para el chat route y layout) y devuelve DEFAULTS ante error.
2. `canCancelAppointment(appointmentDate, startTime, windowMinutes = 120)` en `src/lib/utils.ts:71-77`: parámetro opcional, sin romper llamadas existentes; los callers que tengan el config a mano se lo pasan.

### Bloque B — Sección "Datos del negocio" en `/admin/configuracion`

1. En `src/app/admin/configuracion/page.tsx`, arriba del grid de módulos, nueva `Card` "Datos del negocio" (mismo estilo glass/tokens) con formulario:
   - Teléfono (con hint "se usa para los botones de WhatsApp"), email, Instagram.
   - Horario de atención (copy): dos inputs numéricos/`type=time` para apertura y cierre + 7 chips/checkboxes de días (Dom-Sáb) para `working_days`. Hint: "Es el horario que se muestra en el sitio; la disponibilidad real se gestiona por barbero y sucursal".
   - Ventana de cancelación en minutos (input numérico, hint "el cliente puede cancelar hasta X minutos antes; se aplica también en el servidor") y tolerancia de llegada en minutos.
   - Datos bancarios (banco, cuenta, titular) con hint "si están vacíos, el checkout ofrece coordinar por WhatsApp".
2. Botón "Guardar cambios" único para la sección: upsert de todas las claves `business.%` (mismo shape de update que `handleToggle`, `src/app/admin/configuracion/page.tsx:132-178`: value + updated_at + updated_by) + `invalidateBusinessConfig()` + toast. Deshabilitado sin cambios; loader mientras guarda.
3. Validaciones mínimas client-side: cierre > apertura, ventana ≥ 0, email con formato válido; mostrar error inline, no toast críptico.

### Bloque C — Migrar consumidores

1. **Footer** (`src/components/layout/Footer.tsx:106-135`): `useBusinessConfig()`; phone/instagram/location y UNA línea de horarios derivada de `businessHoursLabel(config)` (elimina el bloque "Lunes a Viernes"/"Sábados" duplicado que hoy muestra las mismas horas dos veces).
2. **Contacto** (`ContactoContent.tsx:64,424`), **home** (`page.tsx:43,131`), **lookbook** (`lookbook/page.tsx:26`), **checkout success** (`success/page.tsx:64`): phone/email/horas desde el hook. Los `waLink` se calculan dentro del componente con el phone del config (ojo: hoy algunos se calculan fuera del render o a nivel módulo — moverlos adentro respetando la regla de hooks).
3. **Checkout + success** (`checkout/page.tsx:19-26`, `success/page.tsx:12-24`): `BANK_TRANSFER_INFO` → `config.bankTransfer` del hook; la condición "hay datos bancarios" y el fallback WhatsApp quedan igual.
4. **Mi cuenta** (`mi-cuenta/page.tsx:77-79`): el label de la ventana se calcula desde `config.cancellationWindowMinutes` (la constante `cancellationWindowLabel` hoy está a nivel módulo — moverla adentro) y pasar `windowMinutes` a `canCancelAppointment`.
5. **Admin citas** (`admin/citas/page.tsx:476`): la grilla de horas de reprogramación usa `config.workingHours` del hook; `timeSlotMinutes` sigue saliendo de `BUSINESS_CONFIG` (no editable).
6. **Chat** (`api/chat/route.ts`): borrar el `businessHoursCopy` a nivel módulo (`:117-119`); dentro del handler, tras el fetch de `app_settings` que ya existe (`:324-333`), ampliar la query para traer también `business.%` (un solo round-trip) y derivar horas/ventana/tolerancia por request. Reemplazar los 3 usos de `BUSINESS_CONFIG.cancellationWindow` (`:578,789,893`) y el "10 minutos" hardcodeado (`:893`) por los valores vivos. Importar `formatWorkingDaysLabel` desde `business-config.ts`.
7. **Layout JSON-LD** (`layout.tsx:58-74`): usar `getBusinessConfigServer` con el cliente Supabase server; si el proyecto no tiene ya un cliente server a mano en layout, envolver en `try/catch` con fallback a los DEFAULTS (el JSON-LD nunca debe romper el render).

## Parte manual (Mario / Fable post-merge)

- Correr la migración `027_business_settings.sql` en el SQL Editor (o Fable vía `DATABASE_URL` como en la 021-026).
- Cargar los datos reales desde `/admin/configuracion`: teléfono real, Instagram, y los datos bancarios (mata el pendiente de `BANK_TRANSFER_INFO`).

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Sin la migración corrida (DB sin claves `business.%`): todo el sitio se ve idéntico a hoy (fail-open a DEFAULTS) — verificar footer, contacto, checkout y chat.
- Con la migración (en local si hay DB): cambiar el teléfono desde `/admin/configuracion` y ver que footer/home/contacto lo reflejan (tras el TTL de 5 min o recarga con cache invalidada); cambiar la ventana a 60 y ver el label nuevo en mi-cuenta.
- Probar la sección nueva en ambos temas y a 375px.

## Criterios de aceptación

- El dueño edita teléfono, email, Instagram, horario de copy, días, ventana de cancelación, tolerancia y datos bancarios desde `/admin/configuracion`, y los cambios se reflejan en footer, contacto, home, lookbook, checkout, mi-cuenta y chat sin deploy.
- La ventana de cancelación editada se aplica en el RPC `cancel_appointment` (server-side), no solo en el copy.
- Con `app_settings` vacío o inaccesible, el sitio funciona exactamente como hoy (defaults de `constants.ts`).
- `supabase/migrations/999_FULL_SETUP.sql` y `src/lib/supabase_schema.sql` quedan idénticos entre sí (`diff` vacío) e incluyen la 027.

## Restricciones

- Rama `feat/polish-config-negocio`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks del componente. Ojo especial con Footer/contacto/mi-cuenta al introducir `useBusinessConfig()`: los valores hoy calculados a nivel módulo pasan adentro del componente, después de los hooks. El build no lo detecta; crashea en runtime.
- Estados/labels de citas y órdenes viven en `src/lib/constants.ts` — no duplicar strings.
- NO tocar `get_availability`, `timeSlotMinutes` ni los `working_hours` de barbers/branches.
- NO aplicar la migración a la DB en esta fase; solo dejar el archivo + espejos.
- Base del worktree: verificar que el HEAD sea el de `refinamiento-pre-demo` actualizado (commit `ee82fb0` o posterior).
