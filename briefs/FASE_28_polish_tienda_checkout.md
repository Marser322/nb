# FASE 28 — Polish: Tienda + checkout (terminación fina)

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: cerrar el circuito de compra con datos reales y sin promesas rotas — hoy el checkout muestra datos bancarios de mentira y promete un WhatsApp para el comprobante que nunca aparece.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens — nunca colores hardcodeados. Rama de trabajo: `feat/polish-tienda-checkout` desde `refinamiento-pre-demo`.

## Estado actual (anclas verificadas 2026-07-08)

- **Datos bancarios placeholder visibles al cliente**: "Banco: Santander / Cuenta: 1234 5678 9012 / Titular: NB Barber S.A." hardcodeados en `src/app/(main)/checkout/page.tsx:352-359`. Es texto inventado en producción.
- **Promesa rota del comprobante**: el método "Transferencia bancaria" dice "Enviá el comprobante por WhatsApp tras confirmar" (`checkout/page.tsx:345`), pero ni el checkout ni la página de éxito ofrecen link alguno de WhatsApp. Ya existe `buildWaLink(phone, message)` con `normalizeUyPhone` en `src/lib/whatsapp.ts:47-51` y el teléfono del negocio en `BUSINESS_CONFIG.phone` (`src/lib/constants.ts:7`).
- **La página de éxito no sabe el método de pago**: `checkout/success/page.tsx:34-38` selecciona `id, total, status, fulfillment, created_at, branch` pero no `payment_method` (la columna existe: enum `payment_method` en `src/lib/supabase_schema.sql:40,137`). Sin eso no puede mostrar instrucciones de transferencia.
- **Teléfono sin validar en checkout**: para delivery solo se chequea `contactPhone.trim()` (`checkout/page.tsx:131-134`); un teléfono no uruguayo/basura pasa igual. `normalizeUyPhone` (`whatsapp.ts:6`) ya resuelve la validación.
- **Tienda**: banner de categoría usa `<Image unoptimized>` (`tienda/page.tsx:220`) sin motivo (assets webp locales) — el resto de la app optimiza.
- Lo que está bien (no romper): RPC transaccional `create_order_with_items` con mapeo de errores ES (`checkout/page.tsx:106-119, 139-158`), skeletons, badges de stock ("AGOTADO"/"Últimos N", `tienda/page.tsx:300-306`), empty state ilustrado, `CartDrawer` con áreas táctiles de 44px y guard de features correcto, redirección `login?next=/checkout`, éxito con estado/modalidad/sucursal desde constants (`success/page.tsx:80-88`).

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: el flujo funcional ya es sólido (FASE 19 backend); lo que falta es honestidad de datos y cerrar el loop de pago por transferencia con el patrón wa.me manual del proyecto. Es exactamente "terminación fina".
- **Fuera de alcance (anti-monstruo, todo esto es Tienda v2 / roadmap)**:
  - NO ficha de producto (PDP), NO cross-sell, NO reseñas, NO wishlist, NO promos/cupones.
  - NO Mercado Pago (roadmap propio).
  - NO editor de datos bancarios en `/admin/configuracion` (anotado como idea en `ROADMAP_CRECIMIENTO.md`; por ahora constante única en código).
  - NO tocar el RPC ni el flujo de stock.

## Trabajo — Base de datos

Ninguna migración.

## Trabajo — App

### Bloque A — Datos bancarios reales y centralizados

1. En `src/lib/constants.ts`, dentro o junto a `BUSINESS_CONFIG`, agregar `BANK_TRANSFER_INFO = { bank: '', account: '', holder: '' }` con valores placeholder VACÍOS y un comentario "completar con los datos reales del negocio".
2. En `checkout/page.tsx:352-359`: leer de esa constante. Si los campos están vacíos, el bloque muestra "Te pasamos los datos bancarios por WhatsApp al confirmar el pedido" en lugar de datos falsos. Nunca más un número de cuenta inventado en pantalla.

### Bloque B — Cerrar el loop del comprobante (success)

1. En `checkout/success/page.tsx`: agregar `payment_method` al select (34-38) y al tipo `SuccessOrder`.
2. Si `payment_method === 'transferencia'`: mostrar bloque con los datos bancarios (misma constante del Bloque A, mismo fallback) y un botón "Enviar comprobante por WhatsApp" → `buildWaLink(BUSINESS_CONFIG.phone, mensaje)` con mensaje en voseo tipo: `Hola! Acabo de hacer el pedido #${shortId} por ${total} por transferencia. Te paso el comprobante.`. Abrir en `target="_blank" rel="noopener"`.
3. Si `payment_method === 'efectivo'`: línea informativa "Pagás al retirar en {sucursal}". Mostrar el método de pago como fila más del resumen (labels: reusar/crear `PAYMENT_METHOD_LABELS` en constants si no existe — verificar antes de duplicar).

### Bloque C — Validación de teléfono en checkout

1. En `handleCheckout` (`checkout/page.tsx:121-134`): cuando haya teléfono (siempre que no esté vacío, y obligatorio en delivery), validarlo con `normalizeUyPhone`; si devuelve null → toast "Ingresá un teléfono uruguayo válido (ej: 099 123 456)". Guardar el valor tal como lo escribió el usuario (la normalización es solo validación).

### Bloque D — Micro-higiene tienda

1. Quitar `unoptimized` del `<Image>` de banners de categoría (`tienda/page.tsx:220`) y verificar que las webp locales rendericen igual.

## Parte manual (Mario)

- Completar `BANK_TRANSFER_INFO` en `src/lib/constants.ts` con los datos bancarios reales del negocio (hasta entonces la UI usa el fallback por WhatsApp, que es honesto).

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Compra completa con método transferencia: checkout muestra el fallback honesto (constante vacía); success muestra método de pago + botón WhatsApp cuyo wa.me abre con el mensaje correcto (nro de orden y total).
- Compra con efectivo: success indica pago al retirar; sin bloque bancario.
- Delivery con teléfono inválido ("123") → bloqueado con toast; con "099 123 456" → pasa.
- Completar `BANK_TRANSFER_INFO` de prueba y ver que checkout y success muestran los datos.
- Banners de categoría de tienda se ven bien sin `unoptimized`.
- Ambos temas y 375px (checkout y success).
- Si el dev server falla con "Failed to open database… invalid digit": `rm -rf .next` + `find . -name '._*' -not -path './node_modules/*' -delete`.

## Criterios de aceptación

- Ningún dato bancario inventado visible en ninguna pantalla, en ningún estado.
- El cliente que paga por transferencia llega al comprobante por WhatsApp en 1 tap desde la confirmación.
- Teléfonos inválidos no pasan el checkout de delivery.

## Restricciones

- Rama `feat/polish-tienda-checkout`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels viven en `src/lib/constants.ts` — no duplicar strings.
