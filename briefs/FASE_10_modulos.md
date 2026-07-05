# FASE 10 — Configuración modular (feature flags)

> Leer primero `briefs/README.md`. **Requiere Fase 9** (gatea el ChargeDialog y Liquidaciones). Las demás dependencias son suaves: si algún módulo aún no existe al ejecutar esta fase, dejar su flag sembrado y gatear lo que sí exista.

## Contexto

Decisión de producto: la barbería debe poder **activar/desactivar módulos** desde el panel según lo que use — y el proyecto tiene potencial de convertirse en SaaS para otras barberías, así que la configuración debe nacer preparada para multi-tenant sin rediseño.

Módulos toggleables: **tienda online** (tienda, checkout, carrito), **turnos fijos** (suscripciones), **contabilidad** (cobro al completar, caja avanzada, liquidaciones), **propinas** (campo tip del cobro) y **mensajes CRM** (WhatsApp/recordatorios).

Diseño: tabla clave-valor `app_settings` (más general que una tabla `feature_flags` dedicada: mañana guarda también `tips.barber_pct`, ventana de cancelación, etc.). Lectura pública **solo** de claves `feature.*` (la web pública necesita saber si la tienda está activa); escritura solo admin.

**Preparación SaaS**: `app_settings.key` es el único unique "global" del diseño — para multi-tenant solo cambia la PK a `(tenant_id, key)` + policies. Las tablas de las fases 7–9 (`schedule_blocks`, `barber_compensation`, `barber_settlements`) ya cuelgan por FK de entidades tenant-scopeables. Regla para el ejecutor: **ningún código hardcodea ids de settings ni asume una única fila global fuera de `src/lib/features.ts`**.

## Tareas

### 1. Migración `supabase/migrations/013_app_settings.sql`

Crear (header manual como 005/006) y replicar en `src/lib/supabase_schema.sql` y `999_FULL_SETUP.sql`:

```sql
-- =============================================================
-- 013 — Configuración de la aplicación y feature flags.
-- Ejecutar a mano en el SQL Editor de Supabase (requiere 006).
-- =============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- La web pública (anon) solo puede leer flags de features;
-- cualquier otro setting queda admin-only por defecto.
DROP POLICY IF EXISTS "Public read feature flags" ON app_settings;
CREATE POLICY "Public read feature flags" ON app_settings
  FOR SELECT USING (key LIKE 'feature.%' OR is_admin());
DROP POLICY IF EXISTS "Admins manage settings" ON app_settings;
CREATE POLICY "Admins manage settings" ON app_settings
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO app_settings (key, value, description) VALUES
  ('feature.tienda',        'true'::jsonb, 'Tienda online: /tienda, /checkout, carrito y link en navbar'),
  ('feature.suscripciones', 'true'::jsonb, 'Turnos fijos semanales (wizard paso 6, mi-cuenta, generación automática)'),
  ('feature.contabilidad',  'true'::jsonb, 'Cobro al completar cita, caja avanzada y liquidaciones'),
  ('feature.propinas',      'true'::jsonb, 'Campo propina en el diálogo de cobro'),
  ('feature.mensajes_crm',  'true'::jsonb, 'Mensajes y recordatorios por WhatsApp')
ON CONFLICT (key) DO NOTHING;
```

### 2. `src/lib/features.ts` (nuevo)

Singleton de módulo con cache — sin React Context (casi todas las páginas son client components; un provider obligaría a tocar todos los layouts):

```ts
export type FeatureKey = 'tienda' | 'suscripciones' | 'contabilidad' | 'propinas' | 'mensajes_crm'
export type Features = Record<FeatureKey, boolean>

const DEFAULTS: Features = {
  tienda: true, suscripciones: true, contabilidad: true,
  propinas: true, mensajes_crm: true,
}
```

- `fetchFeatures(): Promise<Features>` — `supabase.from('app_settings').select('key,value').like('key', 'feature.%')`, merge sobre `DEFAULTS`. Cache en módulo con TTL 5 min + dedupe de fetches concurrentes (guardar la Promise in-flight). **Fail-open**: ante cualquier error devuelve `DEFAULTS` (un fallo de Supabase nunca apaga la web pública). En modo dummy: devolver `DEFAULTS` directo.
- `useFeatures(): { features: Features; isLoaded: boolean }` — hook con `useEffect`; estado inicial `DEFAULTS` (evita flicker en el nav). **Regla**: los redirects de página esperan `isLoaded === true` antes de decidir; el ocultamiento cosmético (links, botones) puede usar el valor inmediato.
- `invalidateFeatures(): void` — limpia el cache; la usa la página de configuración tras guardar.

### 3. Puntos de gating

| Punto | Archivo | Comportamiento si el flag está off |
|---|---|---|
| Link "Tienda" en navbar + botón carrito | `src/components/layout/Header.tsx` | no se renderizan (`features.tienda`) |
| CartDrawer | `src/components/shop/CartDrawer.tsx` | `return null` |
| Páginas `/tienda` y `/checkout` | `src/app/(main)/tienda/page.tsx`, `src/app/(main)/checkout/page.tsx` | si `isLoaded && !tienda` → `router.replace('/')` + toast "La tienda no está disponible" |
| Toggle "turno fijo semanal" (paso 6) | `src/app/(main)/reservar/page.tsx` | oculto; `book_appointment` se llama con `p_recurring: false` |
| Sección "Mis Turnos Fijos" | `src/app/(main)/mi-cuenta/page.tsx` | oculta (`suscripciones`) |
| Links sidebar admin: Caja + Liquidaciones / Mensajes / Productos | `src/app/admin/layout.tsx` | filtrar el array de links por `contabilidad`, `mensajes_crm`, `tienda` |
| Diálogo de cobro | `src/components/shared/ChargeDialog.tsx` + llamadores (`barbero/mi-agenda`, `admin/citas`) | si `!contabilidad` → "Completar" vuelve al update simple de status (comportamiento pre-Fase 9); si `!propinas` → el diálogo se muestra sin el campo propina |
| Botones "Enviar WhatsApp" | lista/detalle de clientes | ocultos si `!mensajes_crm` |

> Nota de seguridad (dejar como comentario en `features.ts`): el gating de UI es cosmético — la protección real la dan RLS y los RPCs. Si se quiere gating duro (ej. tienda off rechaza `create_order_with_items`), agregar el chequeo del flag dentro del RPC; queda como opcional fuera del alcance de esta fase.

### 4. Página de configuración — `src/app/admin/configuracion/page.tsx` (nueva)

- Card por módulo (patrón visual de las páginas admin existentes): nombre en español, descripción (la de la tabla), Switch.
- Al toggle: `update app_settings set value = ..., updated_at = now(), updated_by = auth.uid() where key = ...` → toast + `invalidateFeatures()`.
- Aviso bajo el título: "Los cambios pueden tardar hasta 5 minutos en reflejarse para visitantes con la página abierta" (TTL del cache).
- Link "Configuración" al final del sidebar (`src/app/admin/layout.tsx`, icono `Settings`), y `ROUTES.ADMIN_CONFIGURACION = '/admin/configuracion'` en `src/lib/constants.ts`.

### 5. Tipos

`src/types/database.types.ts`: `AppSetting { key, value, description, updated_at, updated_by }`.

## Criterios de aceptación

- [ ] Migración 013 aplica limpia; espejos actualizados; los 5 flags sembrados en `true`.
- [ ] Apagar `feature.tienda` desde `/admin/configuracion`: desaparecen link, carrito y drawer; visitar `/tienda` o `/checkout` directo redirige a home. Encenderla lo restaura (tras invalidar cache / recargar).
- [ ] Apagar `feature.suscripciones`: el paso 6 del wizard no ofrece turno fijo y Mi Cuenta no muestra la sección.
- [ ] Apagar `feature.contabilidad`: "Completar" cita vuelve al cambio de estado simple, sin diálogo de cobro; Caja y Liquidaciones desaparecen del sidebar. Apagar solo `feature.propinas`: diálogo sin campo tip.
- [ ] Un usuario anónimo puede leer los flags (la home carga sin sesión) pero no puede modificarlos ni leer claves que no sean `feature.*` (probar vía API).
- [ ] Con Supabase caído/dummy, la web pública funciona con todos los módulos visibles (fail-open).
- [ ] `npm run build` y `npm run lint` pasan.
