# FASE 19 — RBAC y permisos granulares (rol `gerente`)

> Ejecutor: Sonnet. Planificado por Fable. Ver contexto en `briefs/ROADMAP_CRECIMIENTO.md`
> (Iniciativa 1). **Objetivo**: que el dueño (admin) cree barberos/staff desde el panel y les
> asigne permisos; introducir un rol intermedio `gerente` que opere agendas y venta pero
> **no** vea las ganancias del dueño ni la configuración crítica.

## Estado actual (anclas de código verificadas)

- Roles: enum `user_role = cliente|barbero|admin` (`src/lib/supabase_schema.sql:16`, línea 42 default).
- Compuerta RLS todo-o-nada: `is_admin()` (schema:485) usada en `FOR ALL USING (is_admin())`
  en casi todas las tablas; `current_barber_id()` (schema:500) para alcance del barbero.
- Guard de ruta: `src/lib/supabase/middleware.ts:48-68` exige `profile.role === 'admin'` para
  `/admin/*`. `/barbero/*` exige user (schema de barbero).
- Sidebar admin: `sidebarLinks` en `src/app/admin/layout.tsx:30+` (array plano, sin gating).
- Alta de barberos hoy: `src/app/admin/barberos/page.tsx` hace `supabase.from("barbers").insert()`
  **client-side y NO crea usuario de auth** → los barberos no inician sesión con permisos.
- Compensación/finanzas: `barber_compensation` (schema:1098), `cash_movements`, liquidaciones.
- Patrón para operaciones con `service_role` desde server: `src/app/api/demo-admin/login/route.ts`.

## Diseño

Separar **rol** (grueso) de **capacidades** (finas).

### Claves de permiso
`panel.access`, `agenda.own`, `agenda.all`, `finances.view`, `finances.manage`,
`cash.operate`, `products.manage`, `services.manage`, `clients.view`, `clients.manage`,
`staff.manage`, `branches.manage`, `reports.view`, `settings.manage`.

### Defaults por rol
- `barbero`: `panel.access`(a su portal), `agenda.own`, `clients.view`, `cash.operate`.
- `gerente`: `panel.access`, `agenda.all`, `cash.operate`, `products.manage`, `services.manage`,
  `clients.manage`, `reports.view`. **NO**: `finances.*`, `staff.manage`, `settings.manage`, `branches.manage`.
- `admin` (dueño): todas.

## Trabajo — Base de datos

Nueva migración `supabase/migrations/019_rbac_permisos.sql` (idempotente) + espejo en
`src/lib/supabase_schema.sql`. **No aplicar a ninguna DB**: dejar el `.sql` para que Mario lo
corra en el SQL Editor.

1. `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gerente';`
   ⚠️ En Postgres, `ADD VALUE` no puede usarse en la misma transacción donde se crea; poné este
   ALTER en su propio bloque, separado de cualquier uso del nuevo valor.
2. `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;`
   (overrides por persona: `{"finances.view": true}` para conceder, `false` para revocar).
3. Tabla `role_permissions(role user_role, permission text, PRIMARY KEY(role, permission))`
   seedeada con los defaults de arriba (usar `ON CONFLICT DO NOTHING`).
4. Funciones SECURITY DEFINER `SET search_path = public`:
   - `current_profile_role()` → rol del `auth.uid()` (tolerando `auth_user_id` o `id`, como `is_admin()`).
   - `has_permission(perm text)`: admin ⇒ true; si `profiles.permissions ? perm` usar ese valor;
     si no, existencia en `role_permissions(current_profile_role(), perm)`.
5. RLS — reemplazar `is_admin()` por permiso en tablas sensibles:
   - `barber_compensation`, liquidaciones y totales de caja del dueño → `has_permission('finances.view')`
     (lectura) / `has_permission('finances.manage')` (escritura).
   - Operativas (products, services, appointments, clients, cash_movements de operación) →
     `is_admin() OR has_permission('<perm correspondiente>')`.
   - Mantener `is_admin()` como atajo (admin siempre pasa).
   Escopar por `branch_id` donde el modelo lo permita (gerente ve su sucursal).

## Trabajo — App (Next.js)

1. `src/lib/permissions.ts` (módulo plano, server+client): tipo `Permission`, constante con las
   claves, y el mismo mapa de defaults por rol que el seed (fuente única en TS para gating de UI).
   Helper `can(profile, perm)` que replica la lógica de `has_permission` en cliente.
2. Hook/carga del perfil de staff (rol + permisos) para el panel. Reusar el fetch de perfil que
   ya hace el middleware; exponerlo al layout admin (server component o context) para gating.
3. Guard de ruta `src/lib/supabase/middleware.ts:62` → permitir `role IN ('admin','gerente')`
   (o `has_permission('panel.access')` para staff que entra al panel). Mantener el redirect a
   `/admin-login?error=forbidden` para el resto.
4. `sidebarLinks` (`src/app/admin/layout.tsx`): agregar `permission` a cada item y filtrar el
   render por `can(...)`. Esconder Liquidaciones/Caja-totales/Configuración a quien no tenga el permiso.
5. Ocultar montos de ganancias del dashboard (`/admin/dashboard`) y liquidaciones cuando `!finances.view`.
6. **Alta de staff con login**: nuevo endpoint server `POST /api/admin/staff/route.ts` (Node runtime,
   `service_role`, mismo patrón que `demo-admin/login`) que: valida que el llamante tenga `staff.manage`,
   crea el usuario auth (email + password temporal), inserta `profiles` con `role`, inserta/linkea
   `barbers` si corresponde, y guarda overrides de permisos. Devolver credenciales temporales al admin.
7. UI en `/admin/barberos` (o nueva `/admin/equipo`): al crear, elegir rol (`barbero`/`gerente`) y
   permisos por checkbox (prefill con defaults del rol). Guardada tras `staff.manage`. Sustituir el
   insert client-side actual por la llamada al endpoint.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` sin errores nuevos.
- Migración idempotente (releer dos veces no rompe) y con espejo en `supabase_schema.sql`.
- Prueba manual descripta paso a paso en el reporte: crear un `gerente`, iniciar sesión, confirmar
  que entra al panel, ve agendas/productos, y **NO** ve liquidaciones ni totales de ganancias.
- **No** aplicar la migración a la DB real; dejar instrucciones para correrla.

## Restricciones

- Trabajar en rama `feat/rbac-permisos`. Commits atómicos con `Co-Authored-By: Claude Fable 5`.
- No tocar producción ni desplegar. No modificar `main`.
- Todo el texto de UI en español; respetar la estética "lujo minimalista" del proyecto.
- Cuidado con early-returns antes de hooks en componentes cliente (guard conocido del proyecto).
