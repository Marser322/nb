# Deploy de Produccion - NB Barber

Runbook para llevar NB Barber a produccion con Supabase Cloud free tier y backup diario desde el VPS de Mario.

## 1. Supabase de produccion

1. Crear un proyecto nuevo en Supabase.
   - Region: `sa-east-1` (Sao Paulo), la mas cercana a Uruguay.
   - Guardar `Project URL` y `anon public key` para el front.
2. Antes de cargar el SQL, habilitar `pg_cron`.
   - Supabase Dashboard -> Database -> Extensions.
   - Buscar `pg_cron` y habilitarlo.
3. Crear la DB fresca desde el script maestro.
   - Abrir `supabase/migrations/999_FULL_SETUP.sql`.
   - Copiar todo el archivo y pegarlo una sola vez en Supabase -> SQL Editor.
   - Ejecutar el script completo.
   - Este archivo equivale al setup consolidado `001 -> 018`, excepto `017_fix_service_images.sql` porque solo corrige DBs existentes con seeds viejos. No correr migraciones una por una para una DB nueva.
   - En una DB existente, correr las migraciones pendientes `011 -> 018` en orden manual desde SQL Editor si todavia no fueron aplicadas.
4. Crear el usuario admin real.
   - Registrar el email del dueño en Supabase Auth.
   - En SQL Editor, asignar rol admin al perfil creado:

```sql
update profiles
set role = 'admin'
where auth_user_id = (
  select id from auth.users where email = 'email-del-dueno@example.com'
);
```

5. Cargar datos reales minimos.
   - Sucursales en `branches` usando la columna real `is_active`.
   - Barberos con `branch_id`.
   - Servicios con precios y `duration_minutes` reales.
   - Productos con stock y umbrales de stock bajo.
6. Configurar Auth -> URL Configuration.
   - Site URL: dominio final, por ejemplo `https://newbrothers.uy`.
   - Redirect URLs: agregar `https://newbrothers.uy/actualizar-password`.

## 2. Configuración de Storage (Bucket 'media')

La plataforma requiere un bucket de Supabase Storage llamado `media` para alojar las imágenes de productos y cortes subidas desde el panel de administración.

1. **Crear el bucket**:
   - Ingresar a **Storage** en el menú lateral de Supabase.
   - Hacer clic en **New Bucket** y asignarle el nombre `media`.
   - Marcar el bucket como **Public** para habilitar la lectura directa de las imágenes.
2. **Políticas de Seguridad (RLS)**:
   - Las políticas se crean automáticamente mediante la migración `016_storage_setup.sql` (o en `999_FULL_SETUP.sql`).
   - En caso de configurarlas manualmente desde la interfaz de Supabase (si el SQL Editor de tu usuario tiene restricciones sobre la tabla `storage.objects`), agregar las siguientes políticas para el bucket `media`:
     - **Lectura Pública**: Comando `SELECT` permitido para rol `public` si `bucket_id = 'media'`.
     - **Inserción Admin**: Comando `INSERT` para rol `authenticated` con control `bucket_id = 'media' AND public.is_admin()`.
     - **Edición Admin**: Comando `UPDATE` para rol `authenticated` con control `bucket_id = 'media' AND public.is_admin()`.
     - **Borrado Admin**: Comando `DELETE` para rol `authenticated` con control `bucket_id = 'media' AND public.is_admin()`.

## 3. Variables de entorno

Usar `.env.example` como referencia.

Variables del front:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
```

Variables demo (solo para proyectos descartables/solo-demo):

```bash
NEXT_PUBLIC_DEMO_MODE=true
DEMO_ADMIN_EMAIL=demo@nbbarber.uy
DEMO_ADMIN_PASSWORD=DemoNB2026!
SUPABASE_SERVICE_ROLE_KEY=
```

`NEXT_PUBLIC_DEMO_MODE` es publica porque solo prende la UI demo. `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` y `SUPABASE_SERVICE_ROLE_KEY` deben quedar como variables server-side, sin prefijo `NEXT_PUBLIC_`. La ruta `/api/demo-admin/login` usa esas variables para crear o reparar automaticamente el usuario demo y luego iniciar una sesion real de Supabase.

Compatibilidad legacy: si ya existen `NEXT_PUBLIC_DEMO_ADMIN_EMAIL` y `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD`, el login demo las usa como fallback. Para una demo nueva, preferir las variables server-side.

Variables opcionales del asistente IA:

```bash
GEMINI_API_KEY=
OPENAI_API_KEY=
```

No cargar `SUPABASE_SERVICE_ROLE_KEY` con prefijo `NEXT_PUBLIC_`. En Vercel puede configurarse como variable server-side para el auto-provisionado demo. Si se despliega una Edge Function que lo requiera, configurarlo tambien como secreto de Supabase:

```bash
supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
```

Admin demo: el recorrido recomendado es entrar a `/admin-login` y usar **Entrar como Admin demo**. Ese boton llama a `/api/demo-admin/login`, crea o repara `demo@nbbarber.uy`, confirma email, resetea password y asegura `profiles.role='admin'`.

Plan B manual: poner temporalmente `SUPABASE_URL` (opcional si ya coincide con `NEXT_PUBLIC_SUPABASE_URL`) y `SUPABASE_SERVICE_ROLE_KEY` en `.env` o `.env.local` local, apuntando a la DB destino, y correr:

```bash
npm run seed:demo-admin
```

El comando es idempotente: la segunda corrida debe detectar que el usuario ya existia, resetear password/confirmacion y volver a confirmar `role=admin`. Si tu version de Node no soporta `--env-file-if-exists`, usar `node --env-file=.env scripts/seed-demo-admin.mjs` con las variables exportadas. Si Supabase devuelve `permission denied for table profiles`, aplicar la migracion `demo_admin_service_role_grant` o ejecutar:

```sql
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO service_role;
```

En Vercel setear `NEXT_PUBLIC_DEMO_MODE=true`, `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` y `SUPABASE_SERVICE_ROLE_KEY` como variables de la demo y redeployar. La service role key nunca debe estar en variables `NEXT_PUBLIC_*`.

## 4. Backup diario desde el VPS

El free tier de Supabase no incluye backups automaticos. El script del repo esta en `scripts/backup-supabase.sh` y esta pensado para copiarse al VPS.

1. Instalar cliente PostgreSQL en el VPS.

```bash
sudo apt-get update
sudo apt-get install -y postgresql-client
```

2. Copiar el script al VPS.

```bash
sudo mkdir -p /opt/nbbarber
sudo cp scripts/backup-supabase.sh /opt/nbbarber/backup-supabase.sh
sudo chmod 750 /opt/nbbarber/backup-supabase.sh
```

3. Guardar el connection string fuera del repo.

```bash
cat > ~/.pg_backup_env <<'EOF'
export DB_URL='postgresql://...'
EOF
chmod 600 ~/.pg_backup_env
```

Usar el connection string `Direct` o `Session pooler` de Supabase -> Settings -> Database, puerto `5432`.

4. Probar un backup manual.

```bash
/opt/nbbarber/backup-supabase.sh
ls -lh /var/backups/nbbarber
```

5. Programar el cron diario.

```bash
crontab -e
```

Agregar:

```cron
30 4 * * * /opt/nbbarber/backup-supabase.sh >> /var/log/nbbarber-backup.log 2>&1
```

6. Probar restore al menos una vez en una DB local de prueba.

```bash
createdb nbbarber_restore_test
pg_restore -d nbbarber_restore_test /var/backups/nbbarber/nbbarber-YYYY-MM-DD.dump
```

## 5. Deploy del front

Opcion recomendada: Vercel.

1. Conectar el repo.
2. Cargar las variables de entorno del punto 3.
3. Configurar el dominio custom.
4. Deploy.
5. Verificar con el dominio final:
   - `/robots.txt`
   - `/sitemap.xml`
   - `/opengraph-image`
   - flujo de reset de password hacia `/actualizar-password`

Opcion alternativa: VPS.

1. Instalar Node compatible con Next 16.
2. En el servidor:

```bash
npm ci
npm run build
npm run start
```

3. Exponer `next start` detras de Nginx o Caddy con SSL.
4. Cargar las mismas variables de entorno del punto 2.

Vercel conviene para este proyecto porque Next 16 queda con previews por PR y cero configuracion de runtime. VPS tiene sentido si Mario quiere controlar toda la infraestructura desde el inicio.

## 6. Verificaciones de produccion

1. App publica:
   - home carga con imagenes locales.
   - reserva publica crea una cita.
   - login de cliente funciona.
   - reset de password llega a `/actualizar-password`.
2. Admin:
   - login admin funciona.
   - dashboard carga datos reales.
   - agenda, servicios, productos, caja y clientes responden con RLS activo.
3. RLS con anon key:

```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"

curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/communication_logs?select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Un anonimo no debe poder leer datos sensibles de `profiles` ni `communication_logs`.

4. Backup:
   - el cron genero un dump.
   - el dump restaura en una DB local de prueba.

## 7. Migracion futura

Cuando el negocio lo justifique:

- Free tier -> Supabase Pro: cambiar plan, sin cambios de codigo.
- Free tier -> Supabase self-host/VPS: `pg_dump` desde Supabase Cloud, restore en la nueva DB, actualizar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Si se usan Edge Functions con secretos, tambien actualizar los secretos equivalentes en el destino.
