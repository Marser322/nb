# FASE 1 — Seguridad admin real (prerequisito del CRM)

> Leer primero `briefs/README.md`. **Esta fase va antes que las fases 2–5**: sin sesión Supabase de admin real, el RLS (migración 006) hace que todo el panel devuelva datos vacíos.

## Contexto — el flujo actual está roto

- `src/app/admin-login/actions.ts` define `loginAdmin()` que setea la cookie `admin_session=true`, pero **es código muerto: nadie lo importa**.
- `src/app/admin-login/page.tsx` ya hace `supabase.auth.signInWithPassword` real.
- `src/lib/supabase/middleware.ts:59-69` exige la cookie `admin_session` que ya no se setea → hoy solo se entra al panel con cookies viejas.
- Además `middleware.ts:46-48` tiene un TODO con `/admin` y `/barbero` fuera de las rutas protegidas "para demo".

Conclusión: este cambio **no rompe nada** — arregla un flujo ya roto. La migración 006 (`is_admin()`, policies por rol) ya está en la DB.

## Prerequisito operativo

Debe existir en Supabase un usuario auth con perfil `role='admin'` (las instrucciones para crearlo están en el header de `supabase/migrations/006_harden_rls.sql`). Verificarlo antes de probar.

## Tareas

### 1. `src/lib/supabase/middleware.ts`

- Eliminar el bloque de la cookie `admin_session` (líneas 59-69) y el TODO de líneas 46-48.
- Tras `supabase.auth.getUser()`:
  - **`/admin` y `/admin/*`** (excluir `/admin-login` para evitar bucles): si no hay `user` → redirect a `/admin-login`. Si hay user, consultar su rol:
    ```ts
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle()
    ```
    Si `profile?.role !== 'admin'` → redirect a `/admin-login?error=forbidden`.
  - **`/barbero/*`**: exigir user con rol `barbero` o `admin`; si no → redirect a `/login`.
  - **`/mi-cuenta`**: mantener el comportamiento actual (user requerido, redirect a `/login`).
- La query de rol corre en cada request a `/admin/*`: aceptable para este volumen (query indexada por PK). No agregar caches.

### 2. `src/app/admin-login/page.tsx`

- Tras `signInWithPassword` exitoso, consultar el rol del perfil (misma query `.or(...)`). Si no es `admin`: `await supabase.auth.signOut()` + toast de error "No tenés permisos de administrador". Solo redirigir al panel si es admin.
- Si llega `?error=forbidden` en la URL, mostrar ese mismo mensaje al montar.
- Quitar cualquier email/contraseña default hardcodeado del formulario si existe.

### 3. Eliminar código muerto

- Borrar `src/app/admin-login/actions.ts` completo.
- `grep -rn "admin_session\|ADMIN_PASSWORD" src/ .env*` — no debe quedar ninguna referencia salvo la limpieza de logout (tarea 4).

### 4. Logout real en `src/app/admin/layout.tsx`

- Crear `src/app/admin/actions.ts` con server action `logoutAdmin()`: `cookies().delete('admin_session')` (higiene de la cookie legacy), `signOut()` server-side con el cliente de Supabase de servidor, y `redirect('/admin-login')`.
- En el sidebar del layout admin, agregar botón "Cerrar sesión" (icono `LogOut` de lucide-react) que invoque la action. Mantener "Volver al inicio" como link aparte.

## Criterios de aceptación

- [ ] Ir a `/admin` sin sesión → redirect a `/admin-login`.
- [ ] Login con un usuario `role='cliente'` → rechazado con toast, sin acceso.
- [ ] Login con el admin → dashboard **con datos** (confirma que RLS + sesión funcionan juntos).
- [ ] `/barbero/mi-agenda` solo accesible con rol barbero/admin.
- [ ] "Cerrar sesión" vuelve al login y `/admin` queda bloqueado.
- [ ] `actions.ts` eliminado; sin referencias a `admin_session` (salvo el delete de higiene).
- [ ] `npm run build` y `npm run lint` pasan.
