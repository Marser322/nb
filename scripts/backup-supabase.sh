#!/usr/bin/env bash
# Backup diario de Supabase (free tier no incluye backups).
# Requiere: postgresql-client >= 15. Configurar DB_URL con el
# connection string "Direct" o "Session pooler" (puerto 5432) de
# Supabase -> Settings -> Database. Guardarlo en ~/.pg_backup_env, no aca.
set -euo pipefail

source ~/.pg_backup_env # export DB_URL='postgresql://...'

DEST=/var/backups/nbbarber
mkdir -p "$DEST"

STAMP=$(date +%F)
pg_dump "$DB_URL" --no-owner --no-privileges -Fc -f "$DEST/nbbarber-$STAMP.dump"

# Rotacion: conservar 14 dias
find "$DEST" -name 'nbbarber-*.dump' -mtime +14 -delete
