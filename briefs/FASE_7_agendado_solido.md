# FASE 7 — Agendado sólido (integridad de reservas)

> Leer primero `briefs/README.md`. **Requiere Fases 1–4 aplicadas** (RLS de 006, `src/lib/booking.ts` de la Fase 4). Independiente de las Fases 5 y 6.

## Contexto

La experiencia de agendado tiene cuatro fallas de fondo:

1. **Race condition**: la validación de solapes es client-side (`reservar/page.tsx`); el índice único `idx_unique_barber_slot` solo cubre `start_time` exacto, no solapes parciales (10:00–10:30 vs 10:15–10:45). Además `/admin/citas` inserta directo sin ninguna defensa server-side.
2. **Suscripciones fantasma**: el toggle "turno fijo semanal" inserta en `subscriptions` pero **nada genera las citas recurrentes**. Peor: el doble insert (suscripción → cita) no es atómico; si la cita falla queda una suscripción huérfana.
3. **Sin cancelación**: `canCancelAppointment()` (ventana 2 h, `src/lib/utils.ts:50`) nunca se usa en la UI; el cliente no puede cancelar citas. La policy `"Clients can update own appointments"` (001) es demasiado amplia (permite cambiar fecha/hora/estado sin límite).
4. **Sesión expirada en el paso 6** deja al usuario trabado; `(auth)/login/page.tsx` ignora el param `?next=` que `mi-cuenta` ya envía.

La solución: mover la integridad a la base (EXCLUDE constraint que protege TODOS los caminos de escritura) y las operaciones del cliente a RPCs transaccionales (patrón `create_order_with_items` de 005).

## Tareas

### 1. Migración `supabase/migrations/009_booking_integrity.sql`

Crear con este contenido (header con instrucciones de ejecución manual, como 005/006), y replicar en `src/lib/supabase_schema.sql` y `999_FULL_SETUP.sql`:

```sql
-- =============================================================
-- 009 — Integridad de reservas: anti-solapes a nivel DB,
-- RPC transaccional de reserva y cancelación con ventana de 2 h.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 006 y 008).
--
-- ⚠️ ANTES DE APLICAR: correr este diagnóstico. Si devuelve filas,
-- hay citas solapadas en producción y el EXCLUDE va a fallar:
-- resolverlas a mano (cancelar una de cada par) y recién entonces migrar.
--
--   SELECT a1.id, a2.id, a1.barber_id, a1.appointment_date,
--          a1.start_time, a1.end_time, a2.start_time, a2.end_time
--   FROM appointments a1
--   JOIN appointments a2 ON a1.barber_id = a2.barber_id
--     AND a1.appointment_date = a2.appointment_date AND a1.id < a2.id
--     AND a1.start_time < a2.end_time AND a2.start_time < a1.end_time
--   WHERE a1.status NOT IN ('cancelled','no_show')
--     AND a2.status NOT IN ('cancelled','no_show');
-- =============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Anti-solapes declarativo: protege wizard, admin/citas y el cron de
-- suscripciones por igual. tsrange es [) por defecto, así que una cita
-- que termina 10:30 no choca con otra que empieza 10:30.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    barber_id WITH =,
    tsrange(appointment_date + start_time, appointment_date + end_time) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

-- El índice único viejo queda redundante y genera un código de error
-- distinto (23505 vs 23P01), complicando el manejo en UI.
DROP INDEX IF EXISTS idx_unique_barber_slot;

-- El cliente ya no actualiza citas directo: pasa por cancel_appointment.
-- (La policy de 001 permitía cambiar fecha/hora/estado sin restricción.)
DROP POLICY IF EXISTS "Clients can update own appointments" ON appointments;

-- -------------------------------------------------------------
-- RPC de reserva: end_time server-side, suscripción + cita en UNA
-- transacción, y errores legibles para la UI.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION book_appointment(
  p_barber_id UUID,
  p_service_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_recurring BOOLEAN DEFAULT false,
  p_style_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_duration INT;
  v_end_time TIME;
  v_subscription_id UUID;
  v_appointment_id UUID;
BEGIN
  -- Perfil del usuario autenticado (patrón OR de 005: tolera ambos esquemas)
  SELECT id INTO v_client_id FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  SELECT duration_minutes INTO v_duration FROM services
  WHERE id = p_service_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICIO_NO_DISPONIBLE';
  END IF;

  -- No se confía en el end_time del cliente
  v_end_time := p_start_time + make_interval(mins => v_duration);

  -- appointment_date/start_time son hora local UY sin tz: comparar contra
  -- el reloj de Montevideo, no contra el del servidor (UTC).
  IF (p_date + p_start_time) <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'HORARIO_PASADO';
  END IF;

  -- (La Fase 8 inserta acá la validación de horario/bloqueos:
  --  IF NOT is_slot_bookable(...) THEN RAISE EXCEPTION 'FUERA_DE_HORARIO')

  IF p_recurring THEN
    INSERT INTO subscriptions (client_id, barber_id, service_id, day_of_week, start_time, status)
    VALUES (v_client_id, p_barber_id, p_service_id, EXTRACT(dow FROM p_date)::int, p_start_time, 'active')
    RETURNING id INTO v_subscription_id;
  END IF;

  BEGIN
    INSERT INTO appointments (client_id, barber_id, service_id, appointment_date,
      start_time, end_time, status, style_reference, notes, subscription_id)
    VALUES (v_client_id, p_barber_id, p_service_id, p_date,
      p_start_time, v_end_time, 'pending', p_style_reference, p_notes, v_subscription_id)
    RETURNING id INTO v_appointment_id;
  EXCEPTION WHEN exclusion_violation THEN
    -- Si falla la cita, el RAISE revierte también la suscripción (misma tx)
    RAISE EXCEPTION 'SLOT_OCUPADO';
  END;

  RETURN jsonb_build_object(
    'appointment_id', v_appointment_id,
    'subscription_id', v_subscription_id
  );
END; $$;

REVOKE EXECUTE ON FUNCTION book_appointment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION book_appointment TO authenticated;

-- -------------------------------------------------------------
-- Cancelación por el cliente con ventana de 2 h garantizada server-side.
-- NO toca la suscripción: cancelar una ocurrencia ≠ cancelar el turno fijo.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_appointment(p_appointment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_apt RECORD;
BEGIN
  SELECT id INTO v_client_id FROM profiles
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'PERFIL_NO_ENCONTRADO';
  END IF;

  SELECT * INTO v_apt FROM appointments
  WHERE id = p_appointment_id AND client_id = v_client_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CITA_NO_ENCONTRADA';
  END IF;

  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'NO_CANCELABLE';
  END IF;

  IF (v_apt.appointment_date + v_apt.start_time) - interval '2 hours'
     <= (now() AT TIME ZONE 'America/Montevideo') THEN
    RAISE EXCEPTION 'FUERA_DE_VENTANA';
  END IF;

  UPDATE appointments SET status = 'cancelled' WHERE id = p_appointment_id;
END; $$;

REVOKE EXECUTE ON FUNCTION cancel_appointment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_appointment TO authenticated;
```

### 2. Migración `supabase/migrations/010_subscription_generation.sql`

También replicada en los espejos:

```sql
-- =============================================================
-- 010 — Generación automática de citas desde turnos fijos.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 009).
-- pg_cron: habilitar primero en Dashboard > Database > Extensions.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotente: se puede correr N veces sin duplicar. Si ya existe una cita
-- para esa ocurrencia (aunque esté cancelada) NO se regenera — cancelar una
-- ocurrencia significa saltearla esa semana. Si el slot lo tomó otro cliente,
-- el EXCLUDE de 009 dispara y se saltea con reason 'SLOT_OCUPADO'.
CREATE OR REPLACE FUNCTION generate_subscription_appointments(p_horizon_days INT DEFAULT 8)
RETURNS TABLE (out_subscription_id UUID, out_date DATE, out_created BOOLEAN, out_reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_date DATE;
  v_end_time TIME;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.client_id, s.barber_id, s.service_id, s.day_of_week,
           s.start_time, srv.duration_minutes
    FROM subscriptions s
    JOIN services srv ON srv.id = s.service_id
    WHERE s.status = 'active'
  LOOP
    v_end_time := v_sub.start_time + make_interval(mins => v_sub.duration_minutes);
    FOR i IN 0..p_horizon_days LOOP
      v_date := (now() AT TIME ZONE 'America/Montevideo')::date + i;
      CONTINUE WHEN EXTRACT(dow FROM v_date)::int != v_sub.day_of_week;
      CONTINUE WHEN i = 0
        AND v_sub.start_time <= (now() AT TIME ZONE 'America/Montevideo')::time;

      IF EXISTS (SELECT 1 FROM appointments a
                 WHERE a.subscription_id = v_sub.id AND a.appointment_date = v_date) THEN
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := false; out_reason := 'YA_EXISTE';
        RETURN NEXT; CONTINUE;
      END IF;

      BEGIN
        INSERT INTO appointments (client_id, barber_id, service_id, appointment_date,
          start_time, end_time, status, subscription_id, notes)
        VALUES (v_sub.client_id, v_sub.barber_id, v_sub.service_id, v_date,
          v_sub.start_time, v_end_time, 'confirmed', v_sub.id,
          'Generada automáticamente por turno fijo');
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := true; out_reason := NULL;
        RETURN NEXT;
      EXCEPTION WHEN exclusion_violation THEN
        out_subscription_id := v_sub.id; out_date := v_date;
        out_created := false; out_reason := 'SLOT_OCUPADO';
        RETURN NEXT;
      END;
    END LOOP;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION generate_subscription_appointments FROM PUBLIC, anon;
-- authenticated: para la invocación oportunista desde el panel (ver Tarea 5)
GRANT EXECUTE ON FUNCTION generate_subscription_appointments TO authenticated;

-- Corrida diaria 06:00 UTC = 03:00 Montevideo. Si se re-corre la migración,
-- cron.schedule con el mismo nombre actualiza el job existente.
SELECT cron.schedule(
  'generate-subscription-appointments',
  '0 6 * * *',
  'SELECT public.generate_subscription_appointments()'
);
```

### 3. Wizard — `src/app/(main)/reservar/page.tsx`

1. **`handleSubmit` pasa al RPC**: reemplazar el bloque actual (insert de suscripción + insert de cita + revalidación `hasOverlap`) por una sola llamada `supabase.rpc('book_appointment', {...})`. La revalidación client-side previa al submit puede quedar como cortesía de UX (mensaje temprano), pero la garantía es el RPC + EXCLUDE.
2. **Manejo de errores**: mapear los mensajes del RPC a toasts en español (voseo). Mínimo: `SLOT_OCUPADO` → "Ese horario acaba de ocuparse, elegí otro" + recargar slots + volver al paso de fecha/hora; `HORARIO_PASADO`, `SERVICIO_NO_DISPONIBLE`, `PERFIL_NO_ENCONTRADO`. Cubrir también el código SQLSTATE `23P01` por si el mensaje llega crudo.
3. **Sesión expirada**: en `handleSubmit`, si `auth.getUser()` devuelve null → serializar borrador a `sessionStorage` bajo la clave `nb-reserva-draft`: `{ branchId, serviceId, styleId, barberId, dateISO, time, isRecurring, savedAt }` y `router.push('/login?next=/reservar')`. Al montar la página: si hay borrador con `savedAt` de menos de 45 min y hay sesión, rehidratar los estados (validando que cada id siga existiendo en los datos cargados), saltar al paso 6 y mostrar toast "Retomamos tu reserva donde la dejaste". Borrar el draft tras submit exitoso o si expiró.
4. El "modo dummy" (URL de Supabase con "dummy") debe mockear `book_appointment` en la rama localStorage existente (mismo shape de retorno `{ appointment_id, subscription_id }`).

### 4. Login — `src/app/(auth)/login/page.tsx`

Leer `searchParams.get('next')` y usarlo en el redirect post-login en lugar de `ROUTES.HOME`, **solo si empieza con `/`** (anti open-redirect). Esto además arregla el flujo ya roto: `mi-cuenta/page.tsx` ya envía `?next=` y hoy se ignora.

### 5. Mi Cuenta — `src/app/(main)/mi-cuenta/page.tsx`

- En la lista de próximas citas: botón **"Cancelar"** visible solo si `canCancelAppointment(appointment_date, start_time)` (import de `src/lib/utils.ts`). Confirmación (`window.confirm` como `handleCancelSubscription`) → `supabase.rpc('cancel_appointment', { p_appointment_id })` → toast + refrescar lista.
- Si el RPC devuelve `FUERA_DE_VENTANA` → toast "Solo podés cancelar hasta 2 horas antes del turno".
- Junto al botón, cuando falten menos de 2 h, mostrar texto gris "No se puede cancelar (menos de 2 h)".

### 6. Helper — `src/lib/booking.ts`

Agregar `bookAppointment(supabase, params)` que envuelve el RPC y traduce los códigos de error (`SLOT_OCUPADO`, `23P01`, etc.) a mensajes es-UY tipados (`{ ok: true, appointmentId } | { ok: false, message }`), para que `reservar/page.tsx` no parsee strings de Postgres.

### 7. Invocación oportunista del generador (obligatoria)

En proyectos Supabase free el proyecto pausado no ejecuta pg_cron. Mitigación: en `src/app/admin/dashboard/page.tsx` y `src/app/barbero/mi-agenda/page.tsx`, al montar, disparar fire-and-forget `supabase.rpc('generate_subscription_appointments')` (sin await bloqueante, `.then(() => {}).catch(() => {})`; opcionalmente recargar la lista de citas al resolver). Así, aunque el cron no corra, las citas de turnos fijos aparecen apenas alguien del staff abre el panel.

## Criterios de aceptación

- [ ] Diagnóstico de solapes corrido; migraciones 009 y 010 aplican limpias; espejos (`supabase_schema.sql`, `999_FULL_SETUP.sql`) actualizados.
- [ ] Dos reservas solapadas simultáneas (probar con dos pestañas: misma fecha/barbero, 10:00–10:30 y 10:15–10:45): una gana, la otra recibe "Ese horario acaba de ocuparse". Insert solapado directo desde `/admin/citas` también rechazado por la DB.
- [ ] Reservar con "turno fijo" crea suscripción + cita atómicamente; `generate_subscription_appointments()` (corrida a mano en SQL Editor) crea la cita de la semana siguiente y una segunda corrida no duplica.
- [ ] Cancelar cita desde Mi Cuenta funciona con más de 2 h de antelación y falla con menos (probar moviendo la hora de una cita de prueba).
- [ ] Un cliente NO puede hacer `update` directo de `appointments` vía API (policy eliminada).
- [ ] Login con `?next=/reservar` vuelve a la reserva; borrador del wizard se rehidrata en el paso 6.
- [ ] `npm run build` y `npm run lint` pasan.
