# FASE 20 — Aprovisionar el admin de demostración (seed idempotente) · brief para Gemini/Sonnet

> Leer primero `briefs/README.md` (reglas transversales). **OBJETIVO**: que a quien reciba el link de la demo le baste un clic ("Entrar como Admin demo") para entrar al panel/CRM. Todo el UI ya existe (FASE 15 + FASE 18); esta fase solo **crea y promueve** el usuario admin de demo de forma reproducible, para no depender de crearlo a mano en el dashboard de Supabase.

## Estado actual — YA HECHO, NO REHACER
Verificado en `main`:
- `/admin-login` (`src/app/admin-login/page.tsx`) ya muestra el botón **"Entrar como Admin demo"** cuando `NEXT_PUBLIC_DEMO_MODE==='true'`; hace `signInWithPassword` con `NEXT_PUBLIC_DEMO_ADMIN_EMAIL` / `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD`, **verifica `profile.role==='admin'`** y redirige a `/admin/dashboard`.
- La home tiene el CTA destacado al panel, el tour tiene el paso al panel y el header muestra el acceso staff en modo demo (commits `8210a4c`, `6f5c59e`, `b09ae5b`).
- **NO tocar** ninguno de esos componentes. Esta fase es solo aprovisionamiento + docs + verificación.

## Qué falta (lo único de esta fase)
1. El usuario `demo@nbbarber.uy` debe existir en Supabase Auth (confirmado) y su fila en `profiles` debe tener `role='admin'`.
2. Documentar las env vars de demo (el seteo real en Vercel lo hace Mario a mano — es build-time).

## Contexto técnico (verificado)
- `@supabase/supabase-js` ya es dependencia del proyecto. Convención de scripts one-off: `scripts/*.mjs` (ver `scripts/make-logo-transparent.mjs`, `scripts/audit-assets.mjs`).
- `profiles` = `id UUID pk`, `auth_user_id UUID UNIQUE → auth.users(id)`, `full_name`, `role user_role DEFAULT 'cliente'`. Enum `user_role` incluye `'admin'`.
- Existe el trigger `handle_new_user()` (`AFTER INSERT ON auth.users`) que **inserta automáticamente** la fila en `profiles` con `role='cliente'`. Por eso el seed solo tiene que **crear el user de auth y luego UPDATE-ar el role a `admin`** (con reintento por si el trigger todavía no corrió).

## REGLA DE ORO DE SEGURIDAD (crítica)
- El seed necesita `SUPABASE_SERVICE_ROLE_KEY`, que se lee **solo del `.env` local** al correr el script.
- **NUNCA** commitear la service role key, ni ponerla como var de Vercel, ni como `NEXT_PUBLIC_*` (`DEPLOY.md:75`). El script es una herramienta local/one-off, no se despliega.
- Las 3 vars `NEXT_PUBLIC_DEMO_*` sí son públicas por diseño (van al browser). Por eso el proyecto Supabase de la demo debe ser **descartable/solo-demo**: nunca reutilizar un admin real con estas credenciales.

---

## TAREA 1 — Script de seed idempotente
Crear `scripts/seed-demo-admin.mjs`. Debe ser idempotente (correrlo N veces deja el mismo estado) y usar la Admin API:

```js
// scripts/seed-demo-admin.mjs
// Provisiona el admin de demostración de forma idempotente.
// Uso:  node --env-file=.env scripts/seed-demo-admin.mjs
// Requiere: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
// NUNCA commitear la service role key ni exponerla en el front / Vercel.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || 'demo@nbbarber.uy';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || 'DemoNB2026!';
const DEMO_NAME = 'Admin Demo';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno (.env).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // listUsers no filtra por email en el SDK v2: paginar hasta encontrarlo.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  // 1) Crear (o recuperar) el usuario de auth, ya confirmado.
  let user;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });
  if (createErr) {
    user = await findUserByEmail(DEMO_EMAIL);
    if (!user) throw createErr;
    await admin.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: DEMO_NAME },
    });
    console.log('Usuario demo ya existía → password/confirmación reseteados.');
  } else {
    user = created.user;
    console.log('Usuario demo creado.');
  }

  // 2) El trigger handle_new_user() ya insertó el profile (role 'cliente'); promover a admin.
  //    Reintentar por si el trigger todavía no corrió.
  let promoted = false;
  for (let i = 0; i < 5 && !promoted; i++) {
    const { data, error } = await admin
      .from('profiles')
      .update({ role: 'admin', full_name: DEMO_NAME })
      .eq('auth_user_id', user.id)
      .select('id');
    if (error) throw error;
    if (data && data.length) promoted = true;
    else await new Promise((r) => setTimeout(r, 400));
  }
  // Fallback: si no había profile, insertarlo.
  if (!promoted) {
    const { error } = await admin
      .from('profiles')
      .insert({ auth_user_id: user.id, role: 'admin', full_name: DEMO_NAME });
    if (error) throw error;
  }

  console.log(`✔ Admin demo listo: ${DEMO_EMAIL} (role=admin)`);
}

main().catch((e) => { console.error('Seed falló:', e.message ?? e); process.exit(1); });
```

Notas:
- `node --env-file=.env` requiere Node ≥ 20.6 (el proyecto usa Next 16, así que ok). Si la versión no lo soporta, exportar las vars inline antes de correr.
- No agregar `dotenv` como dependencia: usar `--env-file`.

## TAREA 2 — Discoverabilidad (script npm + docs)
1. En `package.json`, agregar a `scripts`:
   ```json
   "seed:demo-admin": "node --env-file=.env scripts/seed-demo-admin.mjs"
   ```
2. En `.env.example`, documentar (sin valores reales) las vars que intervienen, con un comentario de que la service role key es **solo local**:
   ```
   # Modo demo (públicas, van al browser) — setear también en Vercel
   NEXT_PUBLIC_DEMO_MODE=true
   NEXT_PUBLIC_DEMO_ADMIN_EMAIL=demo@nbbarber.uy
   NEXT_PUBLIC_DEMO_ADMIN_PASSWORD=DemoNB2026!
   # Solo para correr scripts/seed-demo-admin.mjs en local. NUNCA commitear ni subir a Vercel.
   SUPABASE_SERVICE_ROLE_KEY=
   ```
3. En `DEPLOY.md`, agregar 3 líneas: cómo aprovisionar el admin demo (`npm run seed:demo-admin` con la service key en `.env` local, apuntando a la DB destino) + recordatorio de setear las 3 `NEXT_PUBLIC_DEMO_*` en Vercel y redeployar.
4. Verificar que `.env` y `.env.local` sigan gitignoreados (no commitear secretos).

## TAREA 3 — Verificación end-to-end (documentar en el reporte)
1. En `.env.local` (DB de desarrollo): setear `NEXT_PUBLIC_DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_ADMIN_EMAIL`, `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD` y `SUPABASE_SERVICE_ROLE_KEY`.
2. Correr `npm run seed:demo-admin` → debe imprimir "✔ Admin demo listo".
3. Correrlo **una segunda vez** → no debe fallar (idempotencia), debe imprimir "ya existía".
4. `npm run dev`, ir a `/admin-login`, clic en **"Entrar como Admin demo"** → debe caer en `/admin/dashboard` (no debe rebotar por rol).
5. Confirmar la cadena completa del recorrido del visitante: `/` → CTA/tour → `/admin-login` → botón demo → dashboard.

## Criterios de aceptación
- `scripts/seed-demo-admin.mjs` corre limpio y es idempotente (2ª corrida OK).
- Tras el seed, `demo@nbbarber.uy` puede loguear como admin y ver el CRM.
- La service role key **no** aparece en ningún archivo commiteado.
- `npm run build` y `npm run lint` limpios (no agregar warnings; hay ~44 preexistentes).
- Ningún componente de FASE 15/18 fue modificado.

Commit sugerido: `feat(demo): script idempotente para aprovisionar el admin de demostración`
> Si git falla con "non-monotonic index": `find .git -name '._*' -delete`.

---

## Parte manual (Mario — no es tarea del agente)
Para la demo **desplegada** (prod), una sola vez:
1. Correr el seed apuntando a la DB de prod: poner temporalmente en `.env` la `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` del proyecto de prod y `npm run seed:demo-admin` (o crear el user a mano: Supabase → Auth → Add user `demo@nbbarber.uy` / `DemoNB2026!` con Auto-Confirm, luego `UPDATE profiles SET role='admin', full_name='Admin Demo' WHERE auth_user_id=(SELECT id FROM auth.users WHERE email='demo@nbbarber.uy');`).
2. Vercel → Environment Variables (build-time, requieren redeploy): `NEXT_PUBLIC_DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_ADMIN_EMAIL=demo@nbbarber.uy`, `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD=DemoNB2026!`. Redeployar.
3. Enviar el link. El destinatario entra en `/admin-login` → "Entrar como Admin demo" → CRM.
