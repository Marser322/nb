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
   - Este archivo equivale al setup consolidado `001 -> 010`; no correr migraciones una por una para una DB nueva.
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
   - Sucursales en `branches` usando la columna real `active`.
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

Variables opcionales del asistente IA:

```bash
GEMINI_API_KEY=
OPENAI_API_KEY=
```

No cargar `SUPABASE_SERVICE_ROLE_KEY` en Vercel ni en variables publicas del front. Si se despliega una Edge Function que lo requiera, configurarlo solo como secreto de Supabase:

```bash
supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
```

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
2. Cargar las variables de entorno del punto 2.
3. Configurar el dominio custom.
4. Deploy.
5. Verificar con el dominio final:
   - `/robots.txt`
   - `/sitemap.xml`
   - `/og-image.png`
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
