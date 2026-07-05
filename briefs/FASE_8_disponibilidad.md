# FASE 8 — Disponibilidad en vivo (horarios reales y bloqueos)

> Leer primero `briefs/README.md`. **Requiere Fase 7 aplicada** (el EXCLUDE de 009 y `book_appointment`, que esta fase extiende).

## Contexto

El wizard de reserva usa horarios globales hardcodeados (`BUSINESS_CONFIG.workingHours` 9–20 y `workingDays` lun–sáb de `src/lib/constants.ts`) e **ignora** `barbers.working_hours` (JSONB que existe desde 001 con default lun–sáb). No hay forma de: editar horarios por barbero o sucursal, bloquear días (vacaciones, feriados) ni horas puntuales. El único control "en vivo" es el toggle `is_active`, que sí funciona y se mantiene como apagado inmediato.

**Drift confirmado a normalizar**: la tabla `branches` tiene la columna **`active`** (no `is_active`) y NO tiene `working_hours` ni `image_url` — pero `admin/sucursales/page.tsx` lee/escribe `is_active`, el tipo TS `Branch` declara las tres, y `reservar/page.tsx` consulta `active`. Uno de los dos flancos está roto contra la DB real; esta fase lo unifica en `is_active`.

**Decisiones de diseño**:
- Conservar el formato JSONB de `working_hours` (claves `lunes`…`sabado`/`domingo` en minúsculas sin tildes, valores `{start, end, break_start?, break_end?}`, día ausente o `null` = cerrado — exactamente el default de 001 y el tipo `WorkingHours` de `database.types.ts`).
- Resolución efectiva por día: `barbero.working_hours[dia] ?? sucursal.working_hours[dia] ?? cerrado`.
- Un **RPC único `get_availability`** como única fuente de verdad para el wizard (1 llamada para los 14 días, en vez de 14 round-trips).

## Tareas

### 1. Migración `supabase/migrations/011_availability.sql`

Crear (header manual como 005/006) y replicar en `src/lib/supabase_schema.sql` y `999_FULL_SETUP.sql`. **Antes de aplicar**: verificar en la DB real si la columna de `branches` se llama `active` o `is_active` (el guard cubre ambos casos).

```sql
-- =============================================================
-- 011 — Disponibilidad: normalización de branches, horarios
-- efectivos, bloqueos y RPC único de disponibilidad.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 009).
-- =============================================================

-- 1. Normalizar branches al nombre que ya usa el panel admin
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'branches'
               AND column_name = 'active') THEN
    ALTER TABLE branches RENAME COLUMN active TO is_active;
  END IF;
END $$;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT
  '{"lunes": {"start": "09:00", "end": "20:00"}, "martes": {"start": "09:00", "end": "20:00"}, "miercoles": {"start": "09:00", "end": "20:00"}, "jueves": {"start": "09:00", "end": "20:00"}, "viernes": {"start": "09:00", "end": "20:00"}, "sabado": {"start": "09:00", "end": "18:00"}}'::jsonb;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS image_url TEXT;
UPDATE branches SET working_hours = DEFAULT WHERE working_hours IS NULL;

-- Recrear explícita la policy de 006 sobre el nombre nuevo
DROP POLICY IF EXISTS "Anyone can view active branches" ON branches;
CREATE POLICY "Anyone can view active branches" ON branches
  FOR SELECT USING (is_active = true OR is_admin());

-- 2. Bloqueos: vacaciones de barbero, feriado de sucursal, bloqueo puntual.
--    start_time/end_time NULL (ambos) = día(s) completo(s).
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date),
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NULL OR end_time > start_time),
  CHECK (barber_id IS NOT NULL OR branch_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_barber
  ON schedule_blocks(barber_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_branch
  ON schedule_blocks(branch_id, start_date, end_date);

ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage schedule blocks" ON schedule_blocks;
CREATE POLICY "Admins manage schedule blocks" ON schedule_blocks
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Barbers manage own blocks" ON schedule_blocks;
CREATE POLICY "Barbers manage own blocks" ON schedule_blocks
  FOR ALL USING (barber_id = current_barber_id())
  WITH CHECK (barber_id = current_barber_id() AND branch_id IS NULL);
-- Sin SELECT público: la disponibilidad se lee vía RPC SECURITY DEFINER.

-- 3. RPC único de disponibilidad (público, como get_booked_slots en 006).
--    Devuelve por día: horario efectivo (barbero ?? sucursal), bloqueos y
--    citas ocupadas. El wizard hace UNA llamada para la tira de 14 días.
CREATE OR REPLACE FUNCTION get_availability(
  p_barber_id UUID,
  p_from DATE,
  p_to DATE DEFAULT NULL
) RETURNS TABLE (
  day DATE,
  is_open BOOLEAN,
  open_time TIME,
  close_time TIME,
  break_start TIME,
  break_end TIME,
  slot_minutes INT,
  booked JSONB,
  blocks JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_barber RECORD;
  v_to DATE;
  v_day DATE;
  v_key TEXT;
  v_hours JSONB;
  v_day_blocks JSONB;
  v_full_day_block BOOLEAN;
BEGIN
  v_to := LEAST(COALESCE(p_to, p_from), p_from + 30);  -- cap 31 días

  SELECT b.working_hours AS barber_hours, b.branch_id,
         br.working_hours AS branch_hours
  INTO v_barber
  FROM barbers b
  LEFT JOIN branches br ON br.id = b.branch_id
  WHERE b.id = p_barber_id AND b.is_active = true;
  IF NOT FOUND THEN RETURN; END IF;

  v_day := p_from;
  WHILE v_day <= v_to LOOP
    v_key := (ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])
             [EXTRACT(dow FROM v_day)::int + 1];
    v_hours := COALESCE(v_barber.barber_hours -> v_key, v_barber.branch_hours -> v_key);
    IF v_hours = 'null'::jsonb THEN v_hours := NULL; END IF;

    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'start', COALESCE(sb.start_time::text, '00:00'),
        'end',   COALESCE(sb.end_time::text,   '23:59'),
        'reason', sb.reason) ORDER BY sb.start_time NULLS FIRST), '[]'::jsonb),
      COALESCE(bool_or(sb.start_time IS NULL), false)
    INTO v_day_blocks, v_full_day_block
    FROM schedule_blocks sb
    WHERE v_day BETWEEN sb.start_date AND sb.end_date
      AND (sb.barber_id = p_barber_id
           OR (sb.branch_id IS NOT NULL AND sb.branch_id = v_barber.branch_id));

    day := v_day;
    slot_minutes := 30;
    blocks := v_day_blocks;
    IF v_hours IS NULL OR v_full_day_block THEN
      is_open := false;
      open_time := NULL; close_time := NULL;
      break_start := NULL; break_end := NULL;
      booked := '[]'::jsonb;
    ELSE
      is_open := true;
      open_time := (v_hours->>'start')::time;
      close_time := (v_hours->>'end')::time;
      break_start := (v_hours->>'break_start')::time;
      break_end := (v_hours->>'break_end')::time;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'start', a.start_time::text, 'end', a.end_time::text)
        ORDER BY a.start_time), '[]'::jsonb)
      INTO booked
      FROM appointments a
      WHERE a.barber_id = p_barber_id AND a.appointment_date = v_day
        AND a.status IN ('pending', 'confirmed');
    END IF;
    RETURN NEXT;
    v_day := v_day + 1;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION get_availability(UUID, DATE, DATE) TO anon, authenticated;

-- 4. Validación server-side compartida: dentro del horario efectivo, fuera
--    de break y sin bloqueos. Los solapes con citas NO se chequean acá:
--    los garantiza el EXCLUDE de 009.
CREATE OR REPLACE FUNCTION is_slot_bookable(
  p_barber_id UUID, p_date DATE, p_start TIME, p_end TIME
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v RECORD;
BEGIN
  SELECT * INTO v FROM get_availability(p_barber_id, p_date) LIMIT 1;
  IF NOT FOUND OR NOT v.is_open THEN RETURN false; END IF;
  IF p_start < v.open_time OR p_end > v.close_time THEN RETURN false; END IF;
  IF v.break_start IS NOT NULL
     AND p_start < v.break_end AND v.break_start < p_end THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v.blocks) blk
    WHERE p_start < (blk->>'end')::time AND (blk->>'start')::time < p_end
  ) THEN RETURN false; END IF;
  RETURN true;
END; $$;

-- 5. book_appointment v2: agregar la validación de horario. Re-crear la
--    función de 009 COMPLETA insertando, después del check HORARIO_PASADO:
--
--      IF NOT is_slot_bookable(p_barber_id, p_date, p_start_time, v_end_time) THEN
--        RAISE EXCEPTION 'FUERA_DE_HORARIO';
--      END IF;
--
-- (copiar el cuerpo de 009 con ese bloque agregado; actualizar también los espejos)

-- Nota: get_booked_slots (006) queda DEPRECATED en favor de get_availability.
-- No se elimina todavía: el fallback de src/lib/booking.ts la usa.
```

### 2. Consumo en el wizard — `src/lib/booking.ts` y `src/app/(main)/reservar/page.tsx`

1. `src/lib/booking.ts`: agregar `fetchAvailability(supabase, barberId, fromISO, toISO): Promise<DayAvailability[]>` (una llamada a `get_availability`). Tipo `DayAvailability` nuevo en `src/types/database.types.ts` espejando las columnas del RPC.
2. `src/lib/utils.ts`: agregar `generateTimeSlotsFromRange(start: string, end: string, intervalMinutes: number): string[]` (versión de `generateTimeSlots` que acepta `"09:00"`/`"20:30"` en vez de horas enteras). Mantener la vieja para no romper otros usos.
3. `reservar/page.tsx`, paso 5 (Fecha y Hora):
   - Al elegir barbero: **una** llamada `fetchAvailability(barberId, hoy, hoy + 13)`.
   - `availableDates` = días con `is_open === true` de la respuesta (eliminar `BUSINESS_CONFIG.workingDays` del flujo).
   - `timeSlots` del día elegido = `generateTimeSlotsFromRange(open_time, close_time, slot_minutes)` (eliminar `BUSINESS_CONFIG.workingHours` y el `30` hardcodeado).
   - `isSlotAvailable` considera, además de los `booked` (misma lógica actual de slots consecutivos según `duration_minutes`): los rangos de `blocks` y el break (`break_start`/`break_end`) — un slot que pise cualquiera de esos rangos no es reservable.
   - Manejar el nuevo error `FUERA_DE_HORARIO` del RPC (toast + recargar disponibilidad).
   - Fix puntual: la query de sucursales pasa de `.eq("active", true)` a `.eq("is_active", true)` (línea ~70).
4. `BUSINESS_CONFIG.workingHours`/`workingDays` quedan solo como copy/branding; dejar comentario de que **ya no gobiernan disponibilidad**.
5. Modo dummy: mockear `get_availability` con el horario default (lun–sáb 9–20) para que el wizard demo siga funcionando.

### 3. Editor de horarios — `src/components/admin/WorkingHoursEditor.tsx` (nuevo)

Componente controlado que recibe `value: WorkingHours | null` y `onChange`. Grid de 7 filas (lunes → domingo): Switch abierto/cerrado por día + dos Inputs `type="time"` (apertura/cierre) + botón "＋ descanso" que muestra el par `break_start`/`break_end`. Día cerrado = clave ausente en el JSON. Validar `end > start` y break dentro del rango. Estética `.glass-card` + tokens `primary`.

Integrarlo en:
- `src/app/admin/barberos/page.tsx`: sección "Horario" en el Dialog de crear/editar (persiste `working_hours`; botón "Usar horario de la sucursal" = guardar `null`, que hereda).
- `src/app/admin/sucursales/page.tsx`: ídem para el horario de la sucursal.

### 4. Gestión de bloqueos (admin)

En `admin/barberos/page.tsx` y `admin/sucursales/page.tsx`: botón "Bloqueos" por fila → Dialog con:
- Lista de bloqueos vigentes/futuros (`schedule_blocks` del barbero o sucursal, `end_date >= hoy`), con botón eliminar.
- Form de alta: rango de fechas (dos Inputs `type="date"`), checkbox "Día completo" (default on; si off, aparecen los Inputs de hora), campo motivo ("Vacaciones", "Feriado", etc.).
- Los feriados se cargan como bloqueo de **sucursal** (afectan a todos sus barberos vía `get_availability`).

### 5. Tipos

`src/types/database.types.ts`: agregar `ScheduleBlock` y `DayAvailability`; alinear `Branch` con el schema real post-011 (`is_active`, `working_hours`, `image_url`).

## Criterios de aceptación

- [ ] Migración 011 aplica limpia (verificado antes el nombre real `active`/`is_active` en la DB); espejos actualizados.
- [ ] Editar el horario de un barbero (ej. martes 10:00–14:00) se refleja en el wizard: solo se ofrecen esos slots ese día. Con `working_hours` en null, hereda el de su sucursal.
- [ ] Bloquear vacaciones de un barbero (rango de fechas) hace desaparecer esos días del wizard; un feriado de sucursal bloquea a todos sus barberos.
- [ ] Bloqueo parcial (ej. 13:00–15:00) deshabilita solo esos slots; el break del día hace lo mismo.
- [ ] Intentar reservar fuera de horario vía API directa (curl al RPC con hora inválida) → `FUERA_DE_HORARIO`.
- [ ] `/admin/sucursales` y el wizard usan ambos `is_active` sin errores.
- [ ] `npm run build` y `npm run lint` pasan.
