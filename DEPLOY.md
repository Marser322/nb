# 🚀 Guía de Despliegue - NB Barber

Esta guía cubre los pasos necesarios para llevar la aplicación a producción.

## 1. Base de Datos (Supabase)

Antes de desplegar, asegúrate de que tu base de datos tenga todas las tablas necesarias.

1.  Ve al **SQL Editor** de tu proyecto en Supabase.
2.  Abre el archivo `src/lib/supabase_schema.sql` que hemos generado.
3.  Copia todo su contenido y pégalo en el editor de Supabase.
4.  Ejecuta el script. Esto creará:
    - Tablas: `branches`, `cash_movements`, `reminders_config`.
    - Políticas de seguridad (RLS).
    - Datos iniciales de configuración.

### 1.1 Migraciones pendientes (ejecutar en orden)

Después del setup base, ejecutá en el **SQL Editor** las migraciones de `supabase/migrations/` que falten en tu proyecto:

- **`005_transactional_checkout.sql`** — Crea la función `create_order_with_items`: orden + items + descuento de stock en una sola transacción, con precios leídos del servidor. Sin esta migración el checkout usa un flujo de respaldo desde el cliente (funcional pero no atómico).
- **`006_harden_rls.sql`** — Endurece RLS para producción: elimina las policies de desarrollo que daban acceso total a cualquier usuario autenticado (caja, sucursales, recordatorios), restringe escrituras del catálogo a admins, permite a los barberos ver/actualizar solo sus citas, y crea `get_booked_slots` para consultar disponibilidad sin exponer citas ajenas.
  - ⚠️ **Antes de ejecutarla**, verificá que tu usuario admin tenga `role = 'admin'` en `profiles` (la migración incluye la query de verificación en su encabezado). Si no, el panel admin quedará sin permisos de escritura.

## 2. Edge Functions (Mensajes Automáticos)

Para activar el sistema de recordatorios:

1.  Instala el Supabase CLI si no lo tienes: `npm install -g supabase`.
2.  Inicia sesión: `supabase login`.
3.  Despliega la función:
    ```bash
    supabase functions deploy send-reminders
    ```
4.  Configura las variables de entorno para la función:
    ```bash
    supabase secrets set SUPABASE_URL=tu_url SUPABASE_SERVICE_ROLE_KEY=tu_key
    ```
5.  (Opcional) Configura el Cron Job en el Dashboard de Supabase para que llame a esta función diariamente.

## 3. Frontend (Vercel)

El proyecto está optimizado para Vercel.

1.  Sube tu código a GitHub.
2.  Importa el repositorio en Vercel.
3.  Configura las **Variables de Entorno** en Vercel:
    - `NEXT_PUBLIC_SUPABASE_URL`: Tu URL de Supabase.
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Tu clave pública (anon).
4.  Dale a **Deploy**.

### Notas Importantes
- **Dominios de Imágenes:** Hemos configurado `next.config.ts` para permitir imágenes de `unsplash.com` y `supabase.co`.
- **Cuentas de Admin:** Asegúrate de tener usuarios creados en Supabase Auth.
