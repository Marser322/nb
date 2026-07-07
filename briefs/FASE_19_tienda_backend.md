# FASE 19 — Backend de tienda: pedidos, POS y stock híbrido por sucursal · brief para GPT/Gemini

INSTRUCCIÓN MAESTRA: esta fase tiene una **dependencia dura**. El **AGENTE A (fundación DB + constantes)** debe terminar y commitear PRIMERO — crea el esquema, las RPCs y las constantes que todos los demás consumen. Recién cuando A esté commiteado, lanzá **B, C, D, E en paralelo** (sus archivos son disjuntos, no se pisan) y, cuando los cuatro terminen, corré el **AGENTE F secuencial** como integrador/QA. Si no podés paralelizar de verdad: **A → B → C → D → E → F** en ese orden estricto. Cada agente recibe su bloque completo + las REGLAS TRANSVERSALES.

CONTEXTO: Next.js 16 (App Router) + React 19 + TS estricto (alias `@/*`), Tailwind 4 + shadcn/ui + framer-motion + lucide-react. Supabase (Auth + Postgres con RLS). Repo en `/Volumes/1TB CACHE/Barberia`. Moneda: pesos uruguayos (UYU), usar `formatPrice` de `src/lib/utils.ts`. El admin es 100% client components (`"use client"` + `createClient()` de `@/lib/supabase/client`, carga con `useEffect`/`loadX()`, mutaciones por update/insert directo o RPC, toasts de `sonner`, tablas shadcn). Patrón canónico de página admin: `src/app/admin/productos/page.tsx`. Patrón de cobro transaccional (dialog + RPC SECURITY DEFINER): `src/components/shared/ChargeDialog.tsx` + RPC `complete_appointment_with_payment`.

### Estado actual de la tienda (auditado — punto de partida)
- **`products`**: `id, name, description, price, stock INTEGER, low_stock_threshold INTEGER DEFAULT 5, image_url, category, is_active, created_at`. **Stock GLOBAL** (un entero, sin sucursal). `branches` existe (`id, name, address, phone, is_active, working_hours JSONB, image_url`) pero NO está conectada a la tienda.
- **`orders`**: `id, client_id → profiles, subtotal, total, status order_status, payment_method payment_method, created_at`. Enums: `order_status = ('pending','paid','shipped','delivered','cancelled')`, `payment_method = ('mercadopago','efectivo','transferencia')`. **Sin** `branch_id`, sin tipo de pedido, sin datos de entrega, sin `updated_at`, sin nº legible.
- **`order_items`**: `id, order_id → orders (CASCADE), product_id → products (SET NULL), quantity, unit_price`.
- **Checkout** (`src/app/(main)/checkout/page.tsx`): llama RPC `create_order_with_items(p_payment_method, p_items JSONB)` (transaccional, `FOR UPDATE`, precios server-side, descuenta `products.stock`, status `'pending'`), con fallback legacy no-atómico a `decrement_stock` si la RPC no existe. Solo captura método de pago; no pide sucursal ni entrega. Post-compra: `/checkout/success` estático (no muestra nº de orden). **El cliente NO tiene "mis pedidos"** (`/mi-cuenta` solo consulta citas/cortes/suscripciones).
- **Admin**: **NO existe** página de pedidos. `orders` solo se lee read-only en `admin/caja` (suma ingresos) y `admin/clientes/[id]` (compras del cliente). Stock se edita en `admin/productos` con botones +/- (update directo a `products.stock`). `ORDER_STATUS_LABELS/COLORS` existen en `constants.ts:61-75` pero casi no se usan.
- **Caja** (`cash_movements`): `type CHECK (income|expense)`, `category CHECK (service,product,tip,adjustment,supply,salary,rent,chair_rental,settlement,other)`, `payment_method CHECK (cash|card|transfer|other)`, `amount, description, reference_id, branch_id, barber_id, appointment_id, created_by, created_at`. Tiene categoría `'product'` pero **ninguna RPC registra un movimiento de caja al venderse un producto** (online o local). Índice único anti doble-cobro sobre `appointment_id WHERE category='service'`.
- **Agujero de seguridad**: `decrement_stock` es `SECURITY DEFINER` **sin REVOKE** → ejecutable por `anon`; permite drenar stock sin crear orden. Hay que cerrarlo.
- **Última migración**: `018`. La próxima es **`019`**. `999_FULL_SETUP.sql` (raíz `supabase/migrations/`) es el master acumulado sincronizado hasta la 018; espejo en `src/lib/supabase_schema.sql`.

### Modelo objetivo (híbrido, decidido para esta fase)
- **Stock por sucursal**: nueva tabla `product_stock(product_id, branch_id, quantity, low_stock_threshold, PK(product_id,branch_id))` = **fuente de verdad**. `products.stock` pasa a mantenerse **automáticamente como la suma** de `product_stock.quantity` (trigger), para que la tienda pública y las alertas de stock actuales sigan funcionando sin cambios. Retrocompatible.
- **Pedidos online**: el cliente elige **sucursal de retiro** (o envío) en el checkout → se descuenta el stock de ESA sucursal. `orders.order_type='online'`.
- **Pedidos en el local (POS)**: el staff registra una venta de mostrador desde el admin, elige su sucursal → descuenta stock de esa sucursal + genera un `cash_movement` (income/product) en la misma transacción. `orders.order_type='local'`.
- **Ciclo de vida**: RPCs para transicionar estados y, al cancelar, **reponer** el stock de la sucursal.

## REGLAS TRANSVERSALES (van en el prompt de CADA agente)
- **Voseo uruguayo** en toda la UI ("elegí", "guardá", "tenés"). Labels y estados desde `src/lib/constants.ts` — NO duplicar strings ni colores.
- **Tokens de tema** siempre (`primary`, `foreground`, `muted-foreground`, `card`, `border`, `destructive`, utilidades `.glass-card`); NUNCA colores hardcodeados; **probar claro Y oscuro**.
- **Cualquier guard/early-return en componentes va SIEMPRE después de TODOS los hooks** (el build no lo detecta; crashea en runtime — bug recurrente del proyecto).
- **Mobile-first**: clase base = mobile; inputs enfocables ≥16px bajo 768px (patrón `text-base md:text-sm`); tablas con scroll horizontal en mobile.
- **NO tocar archivos fuera del scope de tu bloque** (otros agentes trabajan en paralelo sobre el mismo working tree).
- **Migraciones SQL a mano**: crear/editar el archivo `.sql` alcanza; **NO** intentar aplicarla a la DB. Toda migración nueva se refleja en los TRES lugares: `supabase/migrations/019_*.sql`, `src/lib/supabase_schema.sql` (espejo) y `supabase/migrations/999_FULL_SETUP.sql` (master acumulado). Solo el AGENTE A toca SQL.
- **Reusar** helpers de `src/lib/utils.ts` (`formatPrice`) y el patrón admin de `src/app/admin/productos/page.tsx`.
- **Commit atómico AL FINAL de tu bloque**. Antes de commitear: `npm run build` y `npm run lint` limpios (hay ~44 warnings preexistentes; **no agregar nuevos**). Commits estilo historial (`feat:`/`fix:`/`chore:` en español).
- Si git falla con "non-monotonic index" (disco externo): `find .git -name '._*' -delete`.
- Feature gating: reusar los flags existentes (`useFeatures()` de `src/lib/features.ts`). **No** crear flags nuevos: la página de pedidos y el POS se gatean con los flags ya existentes (ver cada agente). El gating es solo UX; la seguridad real va por RLS/RPC.

---

## AGENTE A — Fundación DB + constantes (BLOQUEANTE, corre y commitea PRIMERO)

Objetivo: crear todo el esquema, RPCs y constantes que consumen B/C/D/E. **Único agente que toca `.sql` y `src/lib/constants.ts`.**

1. **Crear `supabase/migrations/019_tienda_backend.sql`** (y reflejar en `src/lib/supabase_schema.sql` y `999_FULL_SETUP.sql`) con, en orden:

   a. **Enums nuevos**:
   ```sql
   CREATE TYPE order_type AS ENUM ('online', 'local');
   CREATE TYPE fulfillment_type AS ENUM ('pickup', 'delivery');
   ```
   (Usar `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; $$` o `IF NOT EXISTS` para que sea idempotente, siguiendo el estilo de las migraciones existentes.)

   b. **Columnas nuevas en `orders`** (con `ADD COLUMN IF NOT EXISTS`):
   `branch_id UUID REFERENCES branches(id)`, `order_type order_type NOT NULL DEFAULT 'online'`, `fulfillment fulfillment_type NOT NULL DEFAULT 'pickup'`, `contact_name TEXT`, `contact_phone TEXT`, `delivery_address TEXT`, `notes TEXT`, `created_by UUID REFERENCES auth.users(id)`, `updated_at TIMESTAMPTZ DEFAULT now()`. Trigger `set_updated_at` en `orders` (reusá el patrón de trigger de updated_at que ya exista en el schema; si no existe función genérica, creála).

   c. **Tabla `product_stock`** (fuente de verdad por sucursal):
   ```sql
   CREATE TABLE IF NOT EXISTS product_stock (
       product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
       quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
       low_stock_threshold INTEGER NOT NULL DEFAULT 5,
       updated_at TIMESTAMPTZ DEFAULT now(),
       PRIMARY KEY (product_id, branch_id)
   );
   ```
   Índices por `branch_id` y por `product_id`.

   d. **Trigger de agregación**: función que recalcula `products.stock = COALESCE(SUM(product_stock.quantity),0)` para el producto afectado, disparada `AFTER INSERT/UPDATE/DELETE ON product_stock`. Así la tienda pública (que lee `products.stock`) sigue mostrando disponibilidad total sin cambios.

   e. **Seed de migración de datos**: por cada producto con `stock > 0`, insertar una fila en `product_stock` para la **primera sucursal activa** (`SELECT id FROM branches WHERE is_active ORDER BY created_at LIMIT 1`) con `quantity = products.stock`. Envolver en `DO $$` defensivo (si no hay sucursales, no romper). Documentá con comentario que en DB existente esto corre una vez.

   f. **Tabla `stock_movements`** (kardex/auditoría, opcional pero recomendado):
   ```sql
   CREATE TABLE IF NOT EXISTS stock_movements (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
       delta INTEGER NOT NULL,               -- negativo = salida, positivo = entrada
       reason TEXT NOT NULL,                 -- 'sale_online','sale_local','adjustment','restock','cancel_restock'
       reference_id UUID,                    -- order_id u otro
       created_by UUID REFERENCES auth.users(id),
       created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

   g. **RLS** en las tablas nuevas: `product_stock` y `stock_movements` → SELECT/ALL solo `is_admin()` (helper existente). Barbero podrá leer stock de su sucursal (opcional). Habilitar RLS y crear las policies siguiendo el estilo del schema.

   h. **RPC `create_order_with_items` — reescribir** (misma firma + `p_branch_id UUID` y `p_fulfillment`, `p_contact_*`, `p_delivery_address`, `p_notes`): validar y descontar **`product_stock` de la sucursal elegida** (`SELECT ... FOR UPDATE`), no `products.stock`. Excepciones con el mismo estilo de códigos que hoy (`STOCK_INSUFICIENTE:<name>`, `SUCURSAL_INVALIDA`, etc.). Insertar `orders` con `order_type='online'`, `branch_id`, datos de entrega. Insertar un `stock_movements` (reason `sale_online`) por item. `REVOKE FROM PUBLIC, anon; GRANT TO authenticated`. Devuelve el `id` de la orden (que el frontend AHORA sí usará).

   i. **RPC `create_counter_sale`** (POS, SECURITY DEFINER, patrón `complete_appointment_with_payment`): parámetros `p_branch_id UUID, p_payment_method payment_method, p_items JSONB, p_barber_id UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL`. Autoriza `is_admin() OR current_barber_id() IS NOT NULL`. En una transacción: valida/lockea `product_stock` de la sucursal, crea `orders` con `order_type='local'`, `status='paid'`, `created_by=auth.uid()`, inserta `order_items`, descuenta `product_stock`, inserta `stock_movements` (reason `sale_local`), e inserta un `cash_movements` (`type='income'`, `category='product'`, `amount=total`, `payment_method` **mapeado** a códigos EN — ver punto 2c, `reference_id=order_id`, `branch_id`, `barber_id`, `created_by`). `REVOKE FROM PUBLIC, anon; GRANT TO authenticated`.

   j. **RPC `update_order_status`** (admin): `p_order_id UUID, p_new_status order_status`. Autoriza `is_admin()`. Lockea la orden `FOR UPDATE`. Transiciones válidas (rechazar saltos ilegales con excepción `TRANSICION_INVALIDA`). **Al pasar a `cancelled`**: reponer el stock de la sucursal de la orden (`UPDATE product_stock ... + INSERT stock_movements reason 'cancel_restock'`) solo si la orden aún no estaba cancelada. **Al pasar `online` a `paid`** (cobro confirmado): insertar `cash_movements` (income/product) si aún no existe uno para esa orden (guardá con un chequeo por `reference_id` para no duplicar). `updated_at` lo maneja el trigger.

   k. **RPC `set_product_stock`** (admin): `p_product_id, p_branch_id, p_new_quantity` → upsert en `product_stock` + `stock_movements` (reason `adjustment`, delta = nuevo - viejo). `is_admin()` only.

   l. **Cerrar el agujero de `decrement_stock`**: `REVOKE ALL ON FUNCTION decrement_stock(UUID, INTEGER) FROM PUBLIC, anon;` (o `DROP FUNCTION` si confirmás que ya nadie la usa tras el rework del checkout — coordinar con AGENTE B; lo más seguro es REVOKE en esta migración y que B elimine el fallback legacy).

   m. **Policy de cancelación por el cliente** (opcional): permitir al cliente cancelar su propia orden en estado `pending` vía `update_order_status` (chequear ownership) — si lo hacés, documentalo; si no, dejá la cancelación solo para admin.

2. **`src/lib/constants.ts`** (único agente que lo edita):
   a. Agregar rutas: `ADMIN_PEDIDOS: '/admin/pedidos'` y `ADMIN_POS: '/admin/pos'` en el bloque Admin de `ROUTES`.
   b. Agregar `ORDER_TYPE_LABELS` (`online → 'Pedido online'`, `local → 'Venta en local'`) y `FULFILLMENT_LABELS` (`pickup → 'Retiro en sucursal'`, `delivery → 'Envío'`), con sus colores si aplica (reusar el estilo de `ORDER_STATUS_COLORS`).
   c. Agregar un helper/mapa `ORDER_TO_CASH_PAYMENT` que traduzca el enum ES de `orders` (`efectivo→'cash'`, `transferencia→'transfer'`, `mercadopago→'transfer'`) a los códigos EN de `cash_movements`. Usalo en las RPCs (punto 1i/1j) y exponelo para el frontend si hace falta.

3. **Verificación**: `npm run build` y `npm run lint` limpios (los cambios de A son SQL + constantes; el build valida los tipos de constants). Confirmar que `999_FULL_SETUP.sql` quedó sincronizado (contiene todo lo de la 019).

Scope de archivos: `supabase/migrations/019_tienda_backend.sql` (nuevo), `src/lib/supabase_schema.sql`, `supabase/migrations/999_FULL_SETUP.sql`, `src/lib/constants.ts`.
Commit sugerido: `feat(db): backend de tienda — stock por sucursal, tipos de pedido y RPCs de ventas/estados (019)`

---

## AGENTE B — Checkout con sucursal/entrega + "Mis pedidos" del cliente

Depende de A (RPC `create_order_with_items` con `p_branch_id`; rutas/labels en constants).

1. **`src/app/(main)/checkout/page.tsx`**: agregar al formulario la **selección de sucursal de retiro** (cargar `branches` activas con el browser client) y la **modalidad** (retiro / envío). Si es envío, pedir `delivery_address` y `contact_phone`. Pasar `p_branch_id`, `p_fulfillment`, `p_contact_*`, `p_delivery_address`, `p_notes` a la RPC `create_order_with_items`. **Eliminar el fallback legacy no-atómico** (líneas ~72-155, el camino `decrement_stock` + inserts manuales): ahora la RPC es la única vía (coordinado con el REVOKE/DROP de A). Capturar el `order_id` que devuelve la RPC y pasarlo a la success page (query param `?order=<id>` o similar).
2. **`src/app/(main)/checkout/success/page.tsx`**: mostrar el **número/ID de la orden** y un resumen mínimo (leer la orden por id, respetando RLS del cliente). Quitar el texto "Te enviaremos un email…" si no hay email real, o suavizarlo a "Podés seguir el estado de tu pedido en Mi cuenta".
3. **"Mis pedidos" en `src/app/(main)/mi-cuenta/page.tsx`**: agregar una sección/card `#orders-card` que liste las órdenes del cliente (`orders` + `order_items(quantity, unit_price, product:products(name,image_url))`), con estado (usar `ORDER_STATUS_LABELS/COLORS` de constants), sucursal, tipo, total (`formatPrice`) y fecha (`date-fns` locale `es`). Ordenar por `created_at` desc. Skeleton mientras carga. Diseño coherente con las otras cards de mi-cuenta.
4. **Tienda** (`src/app/(main)/tienda/page.tsx`): NO requiere cambios de stock (sigue leyendo `products.stock`, ahora mantenido por trigger = disponibilidad total). Opcional: si hay tiempo, mostrar "Disponible para retiro en X sucursales". No es obligatorio.
5. Respetar `features.tienda` como hoy.

Scope de archivos: `src/app/(main)/checkout/page.tsx`, `src/app/(main)/checkout/success/page.tsx`, `src/app/(main)/mi-cuenta/page.tsx`. (Solo si hacés lo opcional: `src/app/(main)/tienda/page.tsx`.)
Commit sugerido: `feat(tienda): checkout con sucursal/entrega y sección Mis pedidos del cliente`

---

## AGENTE C — Stock por sucursal en el admin

Depende de A (`product_stock`, RPC `set_product_stock`).

1. **`src/app/admin/productos/page.tsx`**: reemplazar el stock global por **stock por sucursal**. Cargar `branches` activas y, por producto, las filas de `product_stock`. UI: por cada producto mostrar el stock por sucursal (p.ej. un selector de sucursal arriba que filtra la columna de stock, o una sub-fila expandible con una celda por sucursal). Editar la cantidad de una sucursal llama la RPC `set_product_stock(p_product_id, p_branch_id, p_new_quantity)` (no update directo). Optimistic update + reload en error (patrón actual).
2. **Alertas de stock bajo por sucursal**: usar `product_stock.low_stock_threshold` (la DB lo tiene) en vez del hardcode `<= 5` actual. Resaltar sucursales bajo umbral.
3. Al **crear** un producto nuevo, permitir setear stock inicial por sucursal (o dejar en 0 y que se cargue después). El campo `products.stock` ya NO se edita directo (lo mantiene el trigger).
4. Respetar el gating `features.tienda` como ya hace la página.

Scope de archivos: `src/app/admin/productos/page.tsx` (y, si extraés UI, un componente nuevo bajo `src/app/admin/productos/` o `src/components/admin/` que NO exista aún).
Commit sugerido: `feat(admin): gestión de stock por sucursal en productos`

---

## AGENTE D — Página admin de pedidos + navegación + conciliación de caja

Depende de A (rutas, RPC `update_order_status`, labels). **Único agente que toca `src/app/admin/layout.tsx` y `src/app/admin/caja/page.tsx`.**

1. **Crear `src/app/admin/pedidos/page.tsx`** (nueva): lista de órdenes con filtros por estado, tipo (`order_type`), sucursal y rango de fechas. Columnas: nº/id corto, fecha, cliente, sucursal, tipo, items (cantidad), total (`formatPrice`), estado (badge con `ORDER_STATUS_COLORS`). Detalle por orden (dialog o fila expandible) con los `order_items` y datos de entrega/contacto. **Acciones de estado**: botones para transicionar (`pending → paid → shipped → delivered`, y `cancelled`) llamando la RPC `update_order_status`; mapear errores por substring (`TRANSICION_INVALIDA`, etc.) a toasts en español. Skeleton + `useFeatures()` gating por `features.tienda` (patrón exacto de productos/caja). 100% client component con el patrón admin.
2. **Navegación** en `src/app/admin/layout.tsx`: agregar al array `sidebarLinks` DOS items — "Pedidos" (`ROUTES.ADMIN_PEDIDOS`, ícono `ClipboardList`/`Package`) y "Punto de venta" (`ROUTES.ADMIN_POS`, ícono `ShoppingCart`, lo construye el AGENTE E pero el link lo registrás vos). Filtrar ambos por `features.tienda` en `SidebarContent` (POS además puede requerir `features.contabilidad` — sumalo al filtro). Cada link ya recibe su id `sidebar-<label>` para el tour; no romper eso.
3. **Conciliación en `src/app/admin/caja/page.tsx`**: hoy suma **todas** las órdenes del rango sin filtrar por estado (incluye `pending`/`cancelled` como ingreso — bug). Corregir para contar solo órdenes efectivamente cobradas (`status IN ('paid','shipped','delivered')`), evitando doble conteo con los `cash_movements` que ahora generan las ventas locales y los cobros online (definí una regla clara y documentala: p.ej. caja lee `cash_movements` como fuente de ingresos por productos, y las órdenes online marcadas `paid` ya insertan su `cash_movement` vía RPC de A — entonces caja NO debe volver a sumar `orders` para no duplicar). Elegí una fuente única y dejala consistente.

Scope de archivos: `src/app/admin/pedidos/page.tsx` (nuevo), `src/app/admin/layout.tsx`, `src/app/admin/caja/page.tsx`.
Commit sugerido: `feat(admin): página de pedidos con gestión de estados y conciliación de caja`

---

## AGENTE E — Punto de venta (POS) / venta de productos en el local

Depende de A (RPC `create_counter_sale`, ruta `ADMIN_POS`). El link del sidebar lo agrega el AGENTE D.

1. **Crear `src/app/admin/pos/page.tsx`** (nueva): pantalla de venta de mostrador. Flujo: elegir **sucursal** (default: la del staff si se puede inferir), buscar/seleccionar productos (grid o buscador reusando estilo de tienda), armar un carrito local (cantidades), ver total (`formatPrice`), elegir **método de pago** (`payment_method`), **barbero** opcional (para atribución), notas opcionales. Al confirmar: llamar RPC `create_counter_sale`; toast de éxito con nº de orden; limpiar el carrito. Mapear errores (`STOCK_INSUFICIENTE:<name>`, `SUCURSAL_INVALIDA`) a toasts en español. Mostrar solo productos con stock en la sucursal elegida (o marcar sin stock).
2. Gating: `features.tienda && features.contabilidad` (patrón `useFeatures()`; redirect a dashboard si off, como productos/caja). 100% client component, patrón admin.
3. Reusar componentes shadcn existentes (Card, Button, Select, Dialog, Input). No duplicar `formatPrice` ni labels.

Scope de archivos: `src/app/admin/pos/page.tsx` (nuevo) y, si extraés UI, componentes nuevos bajo `src/app/admin/pos/` que NO existan.
Commit sugerido: `feat(admin): punto de venta (POS) para ventas de productos en el local`

---

## AGENTE F — Integrador / QA final (SECUENCIAL, corre cuando A–E terminaron)

1. Verificar que los 5 commits (A–E) están y que el árbol compila: `npm run build` y `npm run lint` **limpios** (sin warnings nuevos sobre los ~44 preexistentes).
2. **Auditoría cruzada de consistencia**:
   - `999_FULL_SETUP.sql` y `src/lib/supabase_schema.sql` reflejan la 019 completa (todas las tablas/RPCs/enums).
   - Ningún consumidor quedó llamando `create_order_with_items` con la firma vieja; el fallback legacy `decrement_stock` fue eliminado del checkout y la función quedó revocada/dropeada.
   - `constants.ts` tiene las rutas/labels y todos los agentes las consumen (no hay strings hardcodeados duplicados).
   - **No hay doble conteo** de ingresos entre `orders` y `cash_movements` en caja (regla del AGENTE D aplicada de punta a punta).
   - Los early-returns de todas las páginas nuevas van **después** de los hooks.
3. **Smoke test en el navegador** (ambos temas, mobile + desktop): flujo online (tienda → checkout con sucursal → success con nº de orden → Mi cuenta muestra el pedido → admin/pedidos lo ve y cambia estado; al cancelar, el stock de la sucursal se repone); flujo local (admin/pos → venta → descuenta stock de la sucursal → aparece en admin/pedidos como `local`/`paid` y en caja como ingreso, sin duplicar); stock por sucursal en admin/productos refleja los cambios y `products.stock` (agregado) queda consistente.
   > Nota: las RPCs/migración 019 requieren que Mario las corra en el SQL Editor (parte manual). Si la DB local no las tiene, dejá documentado qué no pudiste probar en vivo y verificá al menos que el código llama las RPCs con la firma correcta.
4. **Reporte final consolidado**: archivos tocados por agente, flujos verificados, riesgos, y la lista de pasos manuales para Mario (correr la 019, etc.).

Scope de archivos: ninguno productivo (solo fixes puntuales de integración si algo no compila; documentar cualquier archivo que hayas tenido que tocar).
Commit sugerido (si hubo fixes): `fix(tienda): ajustes de integración backend de tienda (QA fase 19)`

---

## RECORDATORIOS OPERATIVOS PARA MARIO (no son tareas de los agentes)
- **Correr la migración 019 a mano** en Supabase → SQL Editor (pegar `supabase/migrations/019_tienda_backend.sql`). En DB existente, correr 011→018 antes si aún no se aplicaron. El seed de `product_stock` migra el stock global actual a la primera sucursal activa; revisá que la repartición por sucursal quede como querés.
- Tras la 019, el checkout **exige** elegir sucursal: asegurate de tener al menos una sucursal activa (`branches.is_active = true`) con stock cargado.
- Mercado Pago sigue siendo fase futura: `payment_method='mercadopago'` existe en el enum pero no hay pago online real; "pagada" se marca a mano desde admin/pedidos o vía POS.
- Los datos bancarios de transferencia en el checkout siguen siendo placeholder (Santander / 1234…): reemplazalos por los reales antes de producción.
