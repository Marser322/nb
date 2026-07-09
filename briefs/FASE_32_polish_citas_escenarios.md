# FASE 32 — Polish: Citas — escenarios límite del día real

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-09).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que la agenda del admin sobreviva al día real de un salón — no-shows, errores de dedo, citas viejas sin resolver y bloqueos que chocan con reservas — sin agregar superficie nueva.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas)

- La RPC `admin_update_appointment_status` (`src/lib/supabase_schema.sql:1570-1603`) **no valida transiciones**: cualquier estado → cualquier estado, incluido `no_show` y "revivir" una cancelada. Autoriza admin o el barbero dueño de la cita. El enum incluye `no_show` (`:30`).
- `src/app/admin/citas/page.tsx`:
  - `updateStatus(cita, newStatus)` genérico con toast + update local (`:215-244`, extendido en FASE 30 con oferta de WhatsApp para cancelled/confirmed).
  - `AppointmentCard`: `isActionable = pending || confirmed` (`:1042`); acciones actuales Confirmar/Cobrar/Reprogramar/Recordar/Cancelar (`:1090-1136`); estados terminales muestran "Agradecer" (completed con teléfono) o el texto muerto "Sin acciones pendientes" (`:1150-1154`). **No hay botón de no_show ni de deshacer.**
  - La vista carga UN día (`loadAppointments` con `.eq("appointment_date", selectedDate)`, `:130-140` aprox.) y el único navegador de fechas es el strip `quickDates` de hoy → +6 (`:415`, render `:715-731`). **No se puede ir al pasado**: una cita `pending` de ayer es inaccesible e invisible (el dashboard tampoco la detecta).
  - `no_show` existe como opción del filtro (`:756`) pero ninguna acción lo dispara.
- El portal del barbero **sí** tiene el patrón resuelto: botón "No vino" → `updateStatus(cita.id, APPOINTMENT_STATUS.NO_SHOW)` para citas confirmadas (`src/app/barbero/mi-agenda/page.tsx:482-491`) — referencia de UX a espejar en el admin.
- Bloqueos de agenda: el alta hace INSERT plano en `schedule_blocks` sin mirar `appointments` — barberos (`src/app/admin/barberos/page.tsx:401-410`) y sucursales (`src/app/admin/sucursales/page.tsx:171-180`). No hay trigger en la tabla (`supabase_schema.sql:774-804`). El bloqueo oculta slots futuros vía `get_availability`, pero **las citas ya agendadas en el rango quedan huérfanas sin aviso a nadie**.
- Ganchos reutilizables: `APPOINTMENT_STATUS`/`_LABELS`/`_COLORS` (`src/lib/constants.ts:44+`), diálogo de aviso WhatsApp por evento de FASE 30 (`notifyApt` + `SendWhatsappDialog` con `eventType`), `getBookingErrorMessage` (`src/lib/booking-errors.ts`), `IllustratedEmptyState`.

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: la agenda maneja bien el camino feliz, pero el día real de una barbería es una sucesión de excepciones, y hoy cada excepción termina en datos falsos o en un callejón sin salida: el no-show queda como "confirmada" para siempre (métricas mienten, el cliente problemático no se identifica), un cancelado por error no tiene vuelta atrás aunque la DB lo permite, las pendientes de ayer desaparecen del universo visible, y unas vacaciones cargadas encima de 5 reservas no le avisan a nadie. Cerrar estos cuatro agujeros convierte la agenda de "demo linda" a herramienta operativa de verdad — y todo con la RPC y los estados que ya existen.
- **Reutilización**: `updateStatus` ya es genérico (solo faltan los botones); el patrón "No vino" ya está diseñado en el portal barbero; el input date ya se usa en el form de reprogramación; el aviso WhatsApp post-cancelación de FASE 30 se dispara solo al reusar `updateStatus`.
- **Fuera de alcance en este ciclo (anti-monstruo)**:
  - NO waitlist / relleno automático del hueco liberado (roadmap, iniciativa 3.1).
  - NO deshacer citas `completed` (el cobro ya generó movimientos contables vía `ChargeDialog`; revertir eso es un flujo de contabilidad, no de agenda).
  - NO endurecer la RPC con máquina de estados (la libertad actual es justamente lo que permite deshacer; sin migración este ciclo).
  - NO log de auditoría de cambios de estado — anotado en `ROADMAP_CRECIMIENTO.md`.
  - NO cancelación/reprogramación masiva de las citas de un bloqueo (el admin decide cita por cita; solo se le muestra el choque).
  - NO plantilla de WhatsApp nueva para no_show (los 5 eventos de FASE 30 quedan como están).

## Trabajo — Base de datos

No aplica. **Sin migración**: todo lo necesario (enum `no_show`, RPC permisiva, `schedule_blocks`) ya existe.

## Trabajo — App

### Bloque A — Acciones que faltan en la tarjeta de cita (`src/app/admin/citas/page.tsx`)

1. **Botón "No vino"** en `AppointmentCard` para citas `confirmed` (mismo criterio que el portal barbero, `mi-agenda:482-491`): variante outline discreta con `XCircle`, llama `updateStatus(cita, APPOINTMENT_STATUS.NO_SHOW)`. Para `pending` de fechas pasadas (ver Bloque B) también ofrecerlo. Usar siempre las constantes, nunca el string.
2. **Deshacer en estados terminales**: en tarjetas `cancelled` y `no_show`, reemplazar "Sin acciones pendientes" (`:1150-1154`) por un botón "Reactivar" (icono `RotateCcw`) que llama `updateStatus(cita, APPOINTMENT_STATUS.CONFIRMED)`. Antes de reactivar, verificar en memoria que el horario no haya sido tomado por otra cita activa del mismo barbero (los datos del día ya están en `appointments`); si está tomado, toast de error claro ("El horario ya fue ocupado — reprogramala en su lugar"). Las `completed` NO tienen deshacer (dejar "Agradecer"/texto informativo como hoy).
3. El flujo de FASE 30 no se toca: al reactivar como `confirmed`, el toast existente de `updateStatus` ya ofrece "Avisar por WhatsApp" con la plantilla de confirmación — verificar que funcione y no duplicar nada.

### Bloque B — Navegación al pasado + pendientes vencidas (`src/app/admin/citas/page.tsx`)

1. **Selector de fecha libre**: junto al strip `quickDates` (`:715-731`), agregar un `Input type="date"` compacto (patrón del form de reprogramación) y/o flechas ‹ › para moverse día a día, **sin restricción hacia atrás**. El strip de 7 días queda como acceso rápido; si la fecha seleccionada no está en el strip, mostrarla resaltada en el propio input.
2. **Banner de pendientes vencidas**: al cargar la página, una query liviana `appointments` con `status = 'pending' AND appointment_date < hoy` (count + primeras filas, límite 20, ordenadas desc). Si hay resultados, banner ámbar arriba de la agenda: "Tenés N citas pendientes de días anteriores sin resolver" con expansión (lista compacta: fecha, hora, cliente, servicio, barbero) y acciones rápidas por fila: **Completar** (abre `ChargeDialog` si `features.contabilidad`, como el flujo actual `:833-840`), **No vino**, **Cancelar**. Al resolver una fila, sacarla de la lista y refrescar el count. Si no hay vencidas, no se renderiza nada.
3. Cuidado con la regla de hooks: el banner es parte del componente principal — sin early-returns entre hooks.

### Bloque C — Choque de bloqueos con citas existentes (`src/app/admin/barberos/page.tsx` y `src/app/admin/sucursales/page.tsx`)

1. En ambos handlers de creación de bloqueo (barberos `:381-427`, sucursales `:151-197`), **antes** del INSERT: consultar citas activas (`status IN ('pending','confirmed')`) que se solapen con el rango del bloqueo — por `barber_id` en barberos; para sucursales, por todos los barberos con ese `branch_id` (los ids ya están cargados en la página). Considerar fecha Y hora si el bloqueo es parcial (usar los campos reales de `schedule_blocks`: revisar el shape exacto en `supabase_schema.sql:774-804` para el solape).
2. Si hay choques: diálogo de confirmación (patrón `Dialog` existente) con advertencia y lista de las citas afectadas (fecha, hora, cliente, barbero) + dos salidas: "Crear bloqueo igual" (procede con el INSERT; las citas NO se tocan) o "Cancelar". Texto guía: "Estas citas quedan agendadas dentro del bloqueo — resolvelas desde Citas (reprogramar o cancelar y avisar por WhatsApp)."
3. Si no hay choques, el flujo actual no cambia (ni un diálogo de más).
4. Extraer el chequeo de solape a un helper compartido si ambas páginas lo pueden importar (evaluá `src/lib/booking.ts` como casa natural; ya exporta utilidades de citas).

## Parte manual (Mario)

- Nada de DB para esta fase. (Recordatorio acumulado: las migraciones 022 y 023 de FASE 30/31 siguen pendientes en el SQL Editor.)

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Prueba manual en navegador, ambos temas, y a 375px:
  1. Cita confirmada → "No vino" → estado `no_show` con su badge; el filtro "No se presentó" la encuentra.
  2. Cancelar una cita por error → tarjeta cancelada muestra "Reactivar" → vuelve a `confirmed` y el toast ofrece avisar por WhatsApp (plantilla de confirmación de FASE 30).
  3. Reactivar cuando otro turno ya ocupó el horario → error claro, la cita sigue cancelada.
  4. Navegar a una fecha pasada con el input/flechas → se ven las citas de ese día con sus acciones coherentes (pending vieja ofrece No vino/Cancelar/Completar).
  5. Dejar una cita `pending` con fecha de ayer (editable vía Supabase o creándola antes de medianoche… si no es práctico, simular cambiando `selectedDate`) → el banner de vencidas aparece con la fila y las 3 acciones resuelven y actualizan el count.
  6. Crear un bloqueo de barbero encima de una cita confirmada → diálogo con la cita listada; "Crear igual" inserta el bloqueo; "Cancelar" no inserta nada. Ídem bloqueo de sucursal con citas de dos barberos distintos.
  7. Crear un bloqueo sin choques → cero fricción nueva.

## Criterios de aceptación

- `no_show` es alcanzable desde el panel admin en confirmadas y en pendientes vencidas; `cancelled`/`no_show` tienen "Reactivar" con chequeo de horario; `completed` no se puede deshacer.
- Se puede navegar la agenda a cualquier fecha pasada; las `pending` vencidas se detectan en un banner accionable al abrir la página.
- Ningún bloqueo con citas activas solapadas se crea sin que el admin vea la lista de afectadas y confirme.
- Cero strings de estado duplicados (todo desde `constants.ts`); el flujo de avisos WhatsApp de FASE 30 sigue intacto.

## Restricciones

- Rama `feat/polish-citas-escenarios`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard (`if (!features.X) return`, `if (loading) return`) va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels de citas y órdenes viven en `src/lib/constants.ts` — no duplicar strings.
- Sin migraciones ni cambios de RPC en este ciclo.
