# FASE 35 — Polish: Pedidos + POS (flujos de borde)

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-09).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que cancelar una orden nunca deje la contabilidad ni el stock mintiendo (reversa de caja idempotente, restock siempre visible) y que el POS y el admin de pedidos manejen los bordes reales del mostrador.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens — nunca colores hardcodeados.

## Estado actual (anclas verificadas 2026-07-09)

- Stock real por sucursal en `product_stock` (CHECK `quantity >= 0`, `src/lib/supabase_schema.sql:1898-1905`); trigger `recalculate_product_stock` mantiene `products.stock` global (`:1916-1946`) — nunca escribir `products.stock` directo. Ledger `stock_movements` con reasons `sale_online|sale_local|adjustment|restock|cancel_restock` (`:1969-1978`).
- Checkout público → RPC `create_order_with_items` (`supabase_schema.sql:2018-2142`): valida stock con `FOR UPDATE` (`:2093-2100`), descuenta al CREAR la orden (`pending`, `:2115,2132-2134`). Errores `STOCK_INSUFICIENTE:<nombre>` mapeados en `checkout/page.tsx:112-125`.
- POS `/admin/pos` → RPC `create_counter_sale` (`pos/page.tsx:158-167`; RPC en `schema:2147-2283`): orden nace `paid`+`local`, descuenta stock, inserta ingreso en `cash_movements` categoría `product` con `ON CONFLICT DO NOTHING` (`:2271-2279`). Stock en cliente se carga una vez (`loadPosData`, `pos/page.tsx:84-108`) y solo se refresca tras cobrar (`:175`) — stale entre medio, el error del RPC llega recién al cobrar.
- Admin pedidos `/admin/pedidos` (una página): transiciones vía RPC `update_order_status` (`pedidos/page.tsx:152-168`; RPC en `schema:2288-2374`): whitelist `pending→{paid,cancelled}`, `paid→{shipped,delivered,cancelled}`, `shipped→{delivered,cancelled}` (`:2319-2329`); al cancelar restockea `product_stock` + movimiento `cancel_restock`, pero SOLO `IF v_order.branch_id IS NOT NULL` (`:2331-2345`); al pasar a `paid` (online) inserta ingreso en caja con guardia anti-duplicado (`:2351-2372`, índice único `idx_cash_movements_order_product` `:1983-1984`).
- **Gap principal**: cancelar una orden ya cobrada (online pagada, o CUALQUIER venta POS que nace `paid`) restockea el inventario pero **nunca revierte el ingreso en `cash_movements`** — la plata queda contada en caja. No existe reversa/refund en todo el schema.
- Acciones en `getActions` (`pedidos/page.tsx:170-191`) no distinguen `order_type`: una venta `local` (retiro en mostrador ya pagado) ofrece "Enviar"/"Entregar" como si fuera envío online.
- Órdenes `pending` viejas retienen stock indefinidamente (descuento al crear + sin expiración); solo se libera si el admin cancela a mano — y hoy nada las destaca.
- Labels/colores de estados y tipos en `constants.ts:69-93` (`ORDER_STATUS*`, tipos `online|local`); mapeadores de error extensibles: `mapStatusError` (`pedidos/page.tsx:144-150`), `mapSaleError` (`pos/page.tsx:133-144`).
- FASE 28 ya pulió la UI de checkout (datos bancarios, WhatsApp comprobante) — no re-tocar.
- Nota FASE 34 (misma sesión): introdujo el patrón de contra-asiento `void_cash_movement` con `reference_id` + índice único parcial `idx_cash_movements_void_once` (`WHERE category='adjustment' AND reference_id IS NOT NULL`) — la reversa de órdenes debe convivir con ese índice (ver Trabajo-DB).

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: el flujo cancelación queda contablemente honesto de punta a punta (stock vuelve Y la plata sale de caja, una sola vez, con rastro); el mostrador ve el stock real antes de cobrar; los pedidos pendientes viejos dejan de ser stock fantasma invisible.
- **Fuera de alcance en este ciclo (anti-monstruo)**:
  - NO reserva de stock con expiración automática ni cron de limpieza de `pending` (→ roadmap; acá solo se hace visible + cancelable en un clic).
  - NO reembolsos reales al cliente (Mercado Pago → roadmap); la reversa es contable, en caja.
  - NO editar órdenes ni ítems; NO estados nuevos de orden; NO tocar la whitelist de transiciones existente.
  - NO borrar `decrement_stock` legacy de DBs existentes (solo queda anotado como código muerto; no tocarla).
  - NO tocar checkout público (FASE 28) salvo nada — cero cambios en `(main)/checkout`.

## Trabajo — Base de datos

1. Nueva migración `supabase/migrations/026_pedidos_pos_bordes.sql`, **idempotente**, espejada en `src/lib/supabase_schema.sql` y `supabase/migrations/999_FULL_SETUP.sql`. NO aplicarla (la corre Mario). Contenido:

   **(a) Reversa de caja al cancelar — `CREATE OR REPLACE FUNCTION update_order_status(...)`** (copiar la definición vigente en `src/lib/supabase_schema.sql` ~`:2288-2378` — anclas pre-FASE 34, verificarlas — y modificar SOLO el bloque de cancelación):
   - Los ingresos de pedidos ya se insertan con `reference_id = v_order.id` (UUID) y `category='product'` (ver `schema:~2369` y el chequeo anti-duplicado `WHERE reference_id = v_order.id AND category = 'product'` en `:~2378`). Tras el restock, si la orden estaba cobrada (existe ese ingreso `type='income'`/`category='product'`/`reference_id = v_order.id`), insertar el contra-asiento: `type='expense'`, `category='adjustment'`, mismo `amount` total y `payment_method`, mismo `branch_id`, `reference_id = v_order.id`, `description = 'Reversa por cancelación de pedido'`, `created_by = auth.uid()`.
   - **Idempotencia GRATIS**: la migración 025 (FASE 34) ya creó `idx_cash_movements_void_once` — único sobre `reference_id WHERE category='adjustment' AND reference_id IS NOT NULL` — que también cubre esta reversa (una sola por orden). Capturar `unique_violation` → no duplicar (sin error al usuario; la cancelación sigue). NO crear otro índice.
   - **Guard anti-doble-reversa en `void_cash_movement`** (la 025 lo creó; hacer `CREATE OR REPLACE` copiando la definición de la 025 y agregando UN guard): si el movimiento es un ingreso de pedido (`category='product' AND reference_id IS NOT NULL`), `RAISE EXCEPTION 'MOVIMIENTO_DE_PEDIDO'` — si se anulara a mano Y además se cancelara el pedido, habría doble reversa. La UI de caja (FASE 34) también debe ocultar "Anular" en esas filas (ajuste menor en la condición del botón) y `mapVoidError`/toast: "Es un cobro de pedido: cancelalo desde Pedidos".
   - **Restock defensivo**: si `v_order.branch_id IS NULL`, en lugar de saltear silenciosamente el restock, `RAISE WARNING` + devolver en el jsonb de salida un flag `restock_skipped: true` para que la UI avise ("Pedido sin sucursal: el stock no se devolvió automáticamente, ajustalo a mano en Productos").

   **(b)** Ningún otro objeto nuevo. NO tocar `create_order_with_items`, `create_counter_sale`, triggers ni CHECKs. La 026 asume la 025 aplicada (documentarlo en el header del archivo).

## Trabajo — App

### Bloque A — Migración 026 + admin de pedidos

1. Escribir la migración 026 (a) + espejos.
2. `src/app/admin/pedidos/page.tsx`:
   - `getActions` (`:170-191`): ramificar por `order_type` — órdenes `local`: solo "Cancelar" (si no terminal); nunca "Enviar"/"Entregar" (ya están `paid` y retiradas). Órdenes `online`: igual que hoy.
   - Al cancelar una orden cobrada, toast de éxito que confirme la reversa: "Pedido cancelado — stock devuelto y reversa registrada en caja". Si el jsonb devuelve `restock_skipped`, toast ámbar con el aviso manual.
   - Destacar pendientes viejos: en el listado, para órdenes `pending` con más de 48 h (comparación client-side con `created_at`), badge ámbar "Pendiente hace N días" + dejar la acción Cancelar visible de primera. Sin cron, sin auto-cancelación.
   - Extender `mapStatusError` (`:144-150`) con los códigos nuevos si los hubiera.

### Bloque B — POS: stock fresco (independiente de A en UI, requiere solo el repo)

1. `src/app/admin/pos/page.tsx`:
   - Antes de confirmar la venta (`create_counter_sale`), revalidar stock: re-fetch de `product_stock` para la sucursal activa y, si algún ítem del carrito supera el stock fresco, NO llamar al RPC; marcar el/los ítems excedidos en el carrito (texto `text-destructive` + cantidad máxima disponible) y toast claro por línea ("Pomada X: quedan 2 unidades").
   - Refrescar el stock mostrado también al cambiar de sucursal y con un botón manual de refresco (icono RefreshCw) en la barra del catálogo.
   - Mantener el mapeo de `STOCK_INSUFICIENTE` de `mapSaleError` (`:133-144`) como red de seguridad (el RPC sigue siendo la fuente de verdad).

## Parte manual (Mario)

- Correr `supabase/migrations/026_pedidos_pos_bordes.sql` en el SQL Editor (después de la 025).

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Prueba manual, ambos temas y a 375px:
  1. Venta POS → cancelar el pedido desde `/admin/pedidos` → stock del producto vuelve Y en `/admin/caja` aparece el egreso `adjustment` de reversa; cancelarla "de nuevo" (no debería ofrecerse) / forzar doble cancelación → una sola reversa.
  2. Pedido online `pending` → cancelar → stock vuelve y NO hay reversa (nunca se cobró).
  3. Pedido online `paid` → cancelar → reversa presente.
  4. Orden `local` en el admin: no ofrece "Enviar"/"Entregar".
  5. Pedido `pending` con `created_at` viejo (editarlo en DB o crear y esperar es inviable — simular ajustando el umbral temporalmente y revertirlo): badge "Pendiente hace N días".
  6. POS: poner en el carrito más unidades que el stock, bajar el stock desde otra pestaña (Productos), confirmar → el POS detecta el stock fresco y marca la línea sin llamar al RPC.

## Criterios de aceptación

- Cancelación de orden cobrada = stock devuelto + egreso de reversa idempotente en caja, con autor.
- Cancelación de orden no cobrada = solo restock, sin reversa.
- `branch_id` NULL nunca produce un restock silenciosamente omitido (aviso explícito).
- Órdenes locales sin acciones de envío; pendientes viejos visibles de un vistazo.
- El POS avisa el stock insuficiente ANTES de llamar al RPC, por línea, con el máximo disponible.

## Restricciones

- Rama `feat/polish-pedidos-pos` desde `refinamiento-pre-demo`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: guards/early-returns DESPUÉS de todos los hooks.
- Labels/estados desde `src/lib/constants.ts`; tokens de tema.
- NO aplicar migraciones; NO tocar `create_order_with_items`/`create_counter_sale`/triggers/CHECKs; NO tocar checkout público.
- La migración 026 asume la 025 ya escrita (misma sesión): revisar que los índices/objetos no colisionen por nombre.
