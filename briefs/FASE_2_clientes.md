# FASE 2 — /admin/clientes + migración 007

> Leer primero `briefs/README.md`. **Requiere Fase 1 aplicada** (sesión admin real; si no, RLS devuelve vacío).

## Contexto

No existe gestión de clientes en el admin. Los datos están dispersos en `profiles`, `appointments`, `orders`, `haircut_history`. Esta fase crea la lista maestra y el detalle de cliente, más la migración 007 que también consumen las fases 3 y 4.

## Tareas

### 1. Migración `supabase/migrations/007_crm.sql`

Crear con este contenido (header con instrucciones de ejecución manual, como 005/006), y replicar en `src/lib/supabase_schema.sql` y `999_FULL_SETUP.sql`:

```sql
-- =============================================================
-- 007 — CRM: notas de cliente, logs vinculados, multi-sucursal,
-- perfiles walk-in y overview agregado de clientes.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 006).
-- =============================================================

-- Notas internas del cliente (visibles solo para staff vía RLS de 006)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notes TEXT;

-- Vincular logs de mensajes al perfil (historial por cliente, dedupe futuro)
ALTER TABLE communication_logs
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Multi-sucursal: un barbero pertenece a una sucursal (la sucursal de una
-- cita se deriva del barbero — usado por la Fase 4)
ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- El admin necesita crear perfiles walk-in (sin auth_user_id) desde el panel
DROP POLICY IF EXISTS "Admins insert profiles" ON profiles;
CREATE POLICY "Admins insert profiles" ON profiles
  FOR INSERT WITH CHECK (is_admin());

-- Overview agregado de clientes: 1 RPC en vez de N queries.
-- SECURITY DEFINER con guard is_admin() (patrón 005/006) — evita el
-- pitfall de vistas que bypasean RLS.
CREATE OR REPLACE FUNCTION get_clients_overview()
RETURNS TABLE (
  id UUID, full_name TEXT, phone TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ, notes TEXT,
  last_visit DATE, total_appointments BIGINT, total_spent NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.avatar_url, p.created_at, p.notes,
    MAX(a.appointment_date) FILTER (WHERE a.status = 'completed'),
    COUNT(a.id) FILTER (WHERE a.status = 'completed'),
    COALESCE(SUM(s.price) FILTER (WHERE a.status = 'completed'), 0)
      + COALESCE((SELECT SUM(o.total) FROM orders o
                  WHERE o.client_id = p.id
                    AND o.status IN ('paid','shipped','delivered')), 0)
  FROM profiles p
  LEFT JOIN appointments a ON a.client_id = p.id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE p.role = 'cliente'
  GROUP BY p.id;
END; $$;

GRANT EXECUTE ON FUNCTION get_clients_overview() TO authenticated;
```

> Antes de darla por buena, verificar contra el schema real que los estados de `orders` usados en el `IN (...)` existen (revisar el CHECK/enum de `orders.status` en `001_initial_schema.sql` y ajustar la lista si difiere).

### 2. Lista maestra — `src/app/admin/clientes/page.tsx`

Client component, patrón de `src/app/admin/productos/page.tsx`:

- Carga única: `supabase.rpc('get_clients_overview')`.
- Búsqueda **en memoria** por nombre o teléfono (Input arriba de la tabla; una barbería tiene cientos de clientes, no miles).
- Table shadcn con columnas: Avatar + nombre, teléfono, última visita (formateada con date-fns locale `es`; "Nunca" si null), total de citas, total gastado (`formatPrice`), y Badge ámbar **"Inactivo"** si `last_visit` es null o hace más de `INACTIVE_DAYS` días.
- Fila clickeable → `/admin/clientes/[id]`.
- Respetar el query param `?filtro=inactivos` (pre-filtrar a inactivos; lo usa el dashboard de la Fase 5).
- Skeletons de carga (`animate-pulse`).

### 3. Detalle — `src/app/admin/clientes/[id]/page.tsx`

Client component. Con `Promise.all` traer:

1. Perfil: `profiles` por id.
2. Citas: `appointments` con `*, service:services(*), barber:barbers(*)` por `client_id`, orden descendente por fecha.
3. Historial de cortes: `haircut_history` con `*, barber:barbers(name)`; grid de fotos desde `photo_urls` (usar `next/image` con `unoptimized` si son URLs externas/storage).
4. Compras: `orders` con `*, order_items(*, product:products(name))`.
5. Mensajes: `communication_logs` por `client_id`, descendente por `sent_at`.

Layout: Card de contacto arriba (nombre, teléfono, cliente desde `created_at`, **Textarea de notas editable** con botón guardar → `update profiles set notes`), y Tabs shadcn debajo: **Citas / Historial de cortes / Compras / Mensajes**. Estados vacíos con texto amable en español.

### 4. Integración

- `src/app/admin/layout.tsx`: link "Clientes" en el sidebar (icono `Contact` de lucide — `Users` ya lo usa Barberos), entre Citas y Productos.
- `src/lib/constants.ts`: `ROUTES.ADMIN_CLIENTES = '/admin/clientes'` y `INACTIVE_DAYS = 30`.
- `src/types/database.types.ts`: agregar `notes` a `Profile`, `branch_id` a `Barber`, y tipos nuevos `ClientOverview`, `CommunicationLog`, `RemindersConfig` (espejar columnas reales del schema).

## Criterios de aceptación

- [ ] Migración corre limpia en el SQL Editor; espejos (`supabase_schema.sql`, `999_FULL_SETUP.sql`) actualizados.
- [ ] `/admin/clientes` lista clientes con totales correctos (verificar 1 cliente a mano contra la DB).
- [ ] Búsqueda por nombre y por teléfono filtra en vivo; `?filtro=inactivos` funciona.
- [ ] Detalle muestra las 4 tabs con datos e historial; guardar notas persiste.
- [ ] Un usuario no-admin no puede ejecutar el RPC (probar: devuelve error NO_AUTORIZADO).
- [ ] `npm run build` y `npm run lint` pasan.
