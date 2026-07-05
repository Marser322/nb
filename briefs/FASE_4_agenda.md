# FASE 4 — Agenda mejorada + multi-sucursal

> Leer primero `briefs/README.md`. **Requiere Fases 1–3** (policy walk-in y `barbers.branch_id` de la migración 007; `normalizeUyPhone` de `src/lib/whatsapp.ts`).

## Contexto

La creación manual de citas en `/admin/citas` hoy: no valida solapes, no vincula `client_id` (guarda el nombre del cliente en `notes`), y calcula `end_time` a mano. El flujo público de `/reservar` ya hace la validación bien — hay que extraerla y reusarla. Además, decisión tomada: **multi-sucursal por la vía barata** — un barbero pertenece a una sucursal (`barbers.branch_id`, ya agregado en 007); la sucursal de una cita se deriva de su barbero. NO agregar `branch_id` a `appointments` (anotado como "no hacer ahora"; solo sería necesario si los barberos rotaran de sucursal).

## Tareas

### 1. Extraer helpers de reserva — `src/lib/booking.ts` (nuevo)

Extraer de `src/app/(main)/reservar/page.tsx` (aprox. líneas 95-138 y 240-242) sin cambiar comportamiento:

- `fetchActiveAppointments(supabase, barberId, dateStr)` — citas `pending`/`confirmed` del barbero y fecha (o el RPC `get_booked_slots` de la migración 006 si encaja igual).
- `computeBookedSlots(appointments, ...)` — slots ocupados considerando `duration_minutes`.
- `hasOverlap(startTime, endTime, existing)` — la comparación `selectedTime < apt.end_time && apt.start_time < endTime`.

Reemplazar los helpers inline de `reservar/page.tsx` por imports de `src/lib/booking.ts` (refactor puro — verificar que el wizard sigue funcionando idéntico).

### 2. `/admin/citas` — `src/app/admin/citas/page.tsx`

1. **Filtros**: junto al filtro de estado existente, agregar Select de **barbero** ("Todos los barberos") y Select de **sucursal** ("Todas las sucursales"). La sucursal filtra los barberos por `branch_id`, y las citas mostradas se filtran por los barberos de esa sucursal. Filtrado en memoria (patrón del filtro de estado actual).
2. **Validación de solapes al crear** (en `handleCreateAppointment`):
   - Usar `calculateEndTime` de `src/lib/utils.ts` (eliminar el cálculo manual actual).
   - Antes del insert: `fetchActiveAppointments` + `hasOverlap`; si hay conflicto → toast "El horario se superpone con otra cita de {barbero}" y abortar.
   - En el Select de hora del formulario: cuando cambian barbero/fecha, cargar los slots ocupados y **deshabilitar** las horas no disponibles (considerando la duración del servicio elegido).
3. **Vincular `client_id`**:
   - Al someter, normalizar el teléfono con `normalizeUyPhone` y buscar: `select id from profiles where phone = X limit 1` (probar también contra el formato crudo si el histórico no está normalizado).
   - Si no existe → crear perfil walk-in: `insert into profiles (full_name, phone, role) values (..., 'cliente')` (lo permite la policy "Admins insert profiles" de 007) y usar ese id en `appointments.client_id`.
   - Mantener el nombre en `notes` como fallback visual, pero ya no como única fuente.
4. **Vista semanal (opcional — hacer al final si el resto está sólido)**: Tabs "Día | Semana". La semanal: grilla de 7 columnas (lunes a domingo de la semana de la fecha seleccionada), citas como bloques compactos (hora, cliente, barbero) coloreados con `APPOINTMENT_STATUS_COLORS` de constants. Una sola query con `gte/lte appointment_date`. Sin drag&drop.

### 3. Barberos y sucursal

- `src/app/admin/barberos/page.tsx`: Select de sucursal en el form de crear/editar (persiste `branch_id`; opción "Sin asignar" permitida). Mostrar la sucursal como columna en la tabla.

### 4. Wizard público — `src/app/(main)/reservar/page.tsx`

- Al elegir sucursal en el paso correspondiente, **filtrar los barberos** por `branch_id` (barberos sin sucursal asignada: mostrarlos en todas, para no romper datos existentes). Así la sucursal queda implícita en la cita vía barbero.
- Ojo: hoy el paso de sucursal usa datos estáticos — verificar si conviene pasar a leer `branches` de la DB para que los ids casen con `barbers.branch_id` (mantener las imágenes locales de `constants.ts` mapeando por nombre o agregando el id).

### 5. Dashboard — `src/app/admin/dashboard/page.tsx`

- Aplicar el mismo par de filtros barbero/sucursal a la lista "Agenda de hoy".

## Criterios de aceptación

- [ ] El wizard público funciona igual que antes tras el refactor a `src/lib/booking.ts` (reservar de punta a punta en dev).
- [ ] Crear cita manual solapada → rechazada con toast; slots ocupados aparecen deshabilitados.
- [ ] La cita manual queda con `client_id` vinculado; un cliente walk-in repetido no duplica perfil (match por teléfono).
- [ ] Asignar sucursal a un barbero y filtrar `/admin/citas` por esa sucursal muestra solo sus citas.
- [ ] En el wizard, elegir sucursal muestra solo los barberos de esa sucursal.
- [ ] `npm run build` y `npm run lint` pasan.
