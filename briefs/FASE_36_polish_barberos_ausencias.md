# FASE 36 — Polish: Barberos — ausencias y perfil

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-09).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que el barbero gestione sus propias ausencias desde su portal, que el dueño vea de un vistazo quién está de licencia, y que el cliente elija barbero sabiendo cuándo tiene turno libre.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas 2026-07-09)

- `schedule_blocks` ya soporta ausencias **multi-día** (`start_date`/`end_date`) con franja horaria opcional y motivo (`src/lib/supabase_schema.sql:777-792`).
- La RLS **ya permite** que el barbero gestione sus propios bloqueos: policy "Barbers manage own blocks" — `FOR ALL USING (barber_id = current_barber_id()) WITH CHECK (... AND branch_id IS NULL)` (`src/lib/supabase_schema.sql:804-808`). **No hay ninguna UI que la use**: el portal `/barbero/mi-agenda` no menciona bloqueos (`src/app/barbero/mi-agenda/page.tsx`, completo).
- Las "franjas por día" del backlog **ya están resueltas**: `working_hours` soporta `break_start`/`break_end` por día, editable en `WorkingHoursEditor` (botón "Descanso", `src/components/admin/WorkingHoursEditor.tsx:143-191`), respetado por `get_availability` (`src/lib/supabase_schema.sql:874-877`) y por `dayHasFreeSlot` (`src/lib/booking.ts:324-328`). No tocar.
- Admin `/admin/barberos`: alta de bloqueos con chequeo de choques contra citas activas vía `findScheduleBlockConflicts` + `ScheduleBlockConflictDialog` (FASE 32; `src/app/admin/barberos/page.tsx:419-454`, `src/lib/booking.ts:87`, `src/components/admin/schedule-block-conflict-dialog.tsx`). Pero:
  - La **tabla no muestra nada** sobre ausencias: para saber si alguien está de licencia hay que abrir el diálogo barbero por barbero (`src/app/admin/barberos/page.tsx:731-861`).
  - En la lista de bloqueos las fechas se muestran como ISO crudo: `2026-07-15 al 2026-07-20` (`src/app/admin/barberos/page.tsx:901-909`); `date-fns` con locale `es` ya está importado en el archivo (`:6` importa `format`; agregar `es`).
  - La bio del barbero se edita en un `Input` de una línea (`src/app/admin/barberos/page.tsx:617-623`); existe `src/components/ui/textarea.tsx`.
- Wizard de reserva, paso barbero: la card muestra avatar + nombre + bio (`src/app/(main)/reservar/page.tsx:1098-1144`). El servicio ya fue elegido antes (la duración es conocida). Si el barbero está de vacaciones, el cliente recién se entera al llegar al paso de fecha y no ver ningún día habilitado — callejón sin salida.
- Ganchos reutilizables listos: `fetchAvailability` (RPC `get_availability`, `src/lib/booking.ts:247`), `dayHasFreeSlot(day, durationMinutes)` (`src/lib/booking.ts:298`), `resolveBarberSession` (`src/lib/barber-session.ts:13`), `findScheduleBlockConflicts` (`src/lib/booking.ts:87`).

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: la infraestructura de ausencias está completa a nivel DB/RLS/RPC; lo que falta es pura superficie de uso. (1) El barbero hoy depende del dueño para registrar un día libre — la policy ya lo autoriza a hacerlo solo. (2) El dueño no tiene visibilidad de licencias sin abrir diálogos uno por uno. (3) El cliente puede elegir un barbero de vacaciones y chocar contra un calendario vacío. Los tres se resuelven reutilizando lo que ya existe, **sin migración**.
- **Fuera de alcance en este ciclo** (anotado en `ROADMAP_CRECIMIENTO.md`): columnas nuevas de perfil (especialidades, Instagram, rating); workflow de solicitud/aprobación de ausencias por el admin; calendario visual de ausencias del equipo; N franjas arbitrarias por día (el descanso único ya cubre el caso real); edición inline de bloqueos existentes (borrar + recrear alcanza).

## Trabajo — Base de datos

**Ninguna migración.** Todo lo necesario ya existe en la DB (aplicada hasta la 026 el 2026-07-09). No tocar `999_FULL_SETUP.sql` ni `src/lib/supabase_schema.sql`.

## Trabajo — App

### Bloque A — Portal barbero: "Mis ausencias" (`src/app/barbero/mi-agenda/page.tsx`)

1. Nueva sección/botón "Mis ausencias" en el header de mi-agenda que abre un `Dialog` con el mismo patrón del admin (`src/app/admin/barberos/page.tsx:863-1035`): lista de bloqueos propios vigentes/futuros (`schedule_blocks` filtrado por `barber_id` de `resolveBarberSession`, `end_date >= hoy`) + formulario de alta (rango de fechas, día completo o franja, motivo obligatorio) + borrar. **No enviar `branch_id`** en el INSERT (la policy lo exige NULL).
2. Antes de insertar, correr `findScheduleBlockConflicts` con su propio `barberId` y mostrar `ScheduleBlockConflictDialog` si hay citas activas pisadas (mismo flujo que admin; el componente vive en `components/admin/` y es client-safe — importarlo directo). Si el barbero confirma igual, insertar; las citas afectadas quedan para que el admin las gestione (no cancelar en cadena acá).
3. En la navegación rápida de 7 días (`src/app/barbero/mi-agenda/page.tsx:240-263`), marcar visualmente los días que caen dentro de un bloqueo propio (p. ej. punto o borde `text-muted-foreground` + title "Ausencia"), para que el barbero vea su semana real.
4. Fechas siempre formateadas con `date-fns` + locale `es` ("mar 15/07"), nunca ISO crudo.

### Bloque B — Admin: visibilidad de ausencias (`src/app/admin/barberos/page.tsx`)

1. Un solo query adicional al cargar la página: `schedule_blocks` con `end_date >= hoy` de todos los barberos (sin filtro de barbero). Derivar por barbero: bloqueo activo hoy o el próximo dentro de 14 días.
2. En la tabla, columna/badge junto al estado: "Ausente hasta el vie 18/07" (bloqueo activo hoy, `text-destructive` suave) o "Licencia del 15/07" (próxima, tono `muted`). Sin bloqueo → nada. Tooltip/title con el motivo.
3. En el diálogo de bloqueos existente, formatear fechas con locale `es` ("mar 15/07 al lun 20/07" en vez de `2026-07-15 al 2026-07-20`, `src/app/admin/barberos/page.tsx:901-909`).
4. Cambiar el `Input` de bio por `Textarea` (`src/components/ui/textarea.tsx`) con 3 filas y un hint de que se muestra al cliente en el wizard de reserva (`src/app/admin/barberos/page.tsx:617-623`).

### Bloque C — Wizard: disponibilidad visible al elegir barbero (`src/app/(main)/reservar/page.tsx`)

1. Al renderizar el paso de barbero (cards en `:1098-1144`), disparar en paralelo `fetchAvailability(supabase, barber.id, hoy, hoy+6)` para los barberos visibles (son pocos por sucursal) y calcular con `dayHasFreeSlot(day, selectedService.duration_minutes)` el **primer día con hueco libre**.
2. Chip en la card: "Hoy" / "Mañana" / "vie 18" (verde/primary) o "Sin turnos esta semana" (muted, honesto) si ningún día de la ventana tiene hueco. Mientras carga, skeleton pequeño — nunca bloquear el render de las cards.
3. La card sigue siendo seleccionable en todos los casos (el paso de fecha ya maneja la verdad final); el chip es informativo, no un filtro.
4. Cache simple por `barber.id + serviceId` en un `useRef`/estado para no re-consultar al volver atrás en el wizard.

## Parte manual (Mario)

- Nada de DB ni env vars. Solo prueba visual (abajo).

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Portal barbero (login barbero real o vinculado): crear ausencia multi-día completa, ver el marcado en la nav de 7 días, borrarla; crear una que pise una cita activa y verificar que aparece el diálogo de conflicto.
- Admin/barberos: badge "Ausente hasta…" con un bloqueo activo hoy; fechas en español en el diálogo.
- Wizard: con un barbero bloqueado hoy+mañana, el chip muestra el primer día real libre; con un barbero sin horario esa semana, muestra "Sin turnos esta semana".
- Ambos temas (claro/oscuro) y 375px.

## Criterios de aceptación

- Un barbero puede registrar y borrar sus propias ausencias desde `/barbero/mi-agenda` sin intervención del admin, con chequeo de choques contra sus citas.
- El dueño ve en la tabla de `/admin/barberos` quién está ausente hoy y quién tiene licencia próxima, sin abrir diálogos.
- El cliente ve en cada card de barbero cuándo tiene el primer turno libre para el servicio elegido, y nunca queda atrapado en un paso de fecha vacío sin aviso previo.
- Ninguna fecha visible al usuario queda en formato ISO crudo.

## Restricciones

- Rama `feat/polish-barberos-ausencias`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard (`if (!features.X) return`, `if (loading) return`) va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels de citas y órdenes viven en `src/lib/constants.ts` — no duplicar strings.
- **Sin migraciones** en esta fase; no tocar `get_availability`, `WorkingHoursEditor` ni la lógica de descansos (ya funcionan).
- Base del worktree: verificar que el HEAD sea el de `refinamiento-pre-demo` actualizado (commit `86a5a00` o posterior).
