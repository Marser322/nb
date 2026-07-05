# FASE 6 — Producción: Supabase free tier + backups desde el VPS

> Leer primero `briefs/README.md`. Ejecutar cuando las fases 0–5 estén mergeadas. Esta fase es mayormente operativa (consola de Supabase + VPS), con poco código.

## Decisión tomada

**Supabase cloud free tier ahora**, con red de seguridad de backups diarios desde el VPS de Mario. Migrar a self-host (Docker/Coolify en el VPS) o a Pro (~USD 25/mes) cuando el negocio lo justifique. Razones: el volumen de una barbería local entra holgado en el free tier (500 MB DB); sus dos carencias reales — sin backups automáticos y pausa tras 7 días sin tráfico — se cubren con el cron de backup (que además genera tráfico diario).

## Tareas

### 1. Proyecto Supabase de producción

1. Crear proyecto en supabase.com (región `sa-east-1` / São Paulo, la más cercana a Uruguay).
2. En el SQL Editor, correr las migraciones en orden: `001` → `007` (o `999_FULL_SETUP.sql` si ya incorpora la 007 — verificar antes).
3. Crear el usuario admin real: registrar el email del dueño vía Auth y setear `profiles.role='admin'` (instrucciones en el header de `006_harden_rls.sql`). No reusar contraseñas de demo.
4. Cargar datos reales mínimos: sucursales, barberos (con `branch_id`), servicios con precios y duraciones reales, productos con stock.
5. En Auth → URL Configuration: setear el site URL de producción y el redirect de `/actualizar-password`.

### 2. Variables de entorno

- Producción: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` del proyecto nuevo. `GEMINI_API_KEY`/`OPENAI_API_KEY` para el asistente (opcionales: hay fallback a reglas locales).
- Crear/actualizar `.env.example` con todas las claves documentadas (sin valores).
- **Nunca** exponer el `service_role` key en el front (hoy el código no lo usa — mantenerlo así).

### 3. Backup diario desde el VPS

Crear `scripts/backup-supabase.sh` en el repo (documentado, para copiar al VPS):

```bash
#!/usr/bin/env bash
# Backup diario de Supabase (free tier no incluye backups).
# Requiere: postgresql-client >= 15. Configurar DB_URL con el
# connection string "Direct" o "Session pooler" (puerto 5432) de
# Supabase → Settings → Database. Guardarlo en ~/.pg_backup_env, no acá.
set -euo pipefail
source ~/.pg_backup_env   # export DB_URL='postgresql://...'
DEST=/var/backups/nbbarber
mkdir -p "$DEST"
STAMP=$(date +%F)
pg_dump "$DB_URL" --no-owner --no-privileges -Fc -f "$DEST/nbbarber-$STAMP.dump"
# Rotación: conservar 14 días
find "$DEST" -name 'nbbarber-*.dump' -mtime +14 -delete
```

En el VPS: `crontab -e` → `30 4 * * * /opt/nbbarber/backup-supabase.sh >> /var/log/nbbarber-backup.log 2>&1`.

Probar un **restore** al menos una vez: `pg_restore -d <db_local_de_prueba> nbbarber-YYYY-MM-DD.dump`.

### 4. Deploy del front

Dos opciones válidas — elegir con Mario al llegar acá:

- **Vercel** (recomendada para Next 16: cero config, previews por PR): conectar el repo, cargar env vars, dominio custom.
- **VPS**: `npm run build` + `next start` detrás de Nginx/Caddy con SSL, o contenedor Docker. Tiene sentido si quiere todo bajo su control desde ya.

En ambos casos: verificar `robots.txt`, `sitemap.xml` y OG image con el dominio final (revisar que `SITE_URL` salga de env y no esté hardcodeada — ajustar si lo está).

### 5. Camino de migración futuro (solo documentar)

Free tier → VPS self-host o Pro = `pg_dump` → restore + cambiar 2 env vars. Sin cambios de código. Dejarlo anotado en `DEPLOY.md` (actualizar ese archivo con todo lo de esta fase).

## Criterios de aceptación

- [ ] App de producción funciona de punta a punta: reserva pública, login admin, panel con datos reales.
- [ ] RLS verificado en producción: un usuario anónimo no puede leer `profiles` ni `communication_logs` (probar con el anon key vía curl).
- [ ] El cron de backup corrió al menos una vez y el dump restaura en una DB local.
- [ ] `DEPLOY.md` actualizado con el runbook completo.
