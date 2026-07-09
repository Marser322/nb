# Roadmap de crecimiento — NB Barber (post-MVP)

> Estado: el MVP se presenta al CEO **tal cual** (demo en producción). Este documento
> es el plan de desarrollo local que sigue: qué construir después, en qué orden y por qué.
> Cada iniciativa está pensada para partirse en un brief de ejecución (Gemini/Sonnet) cuando
> se active. No es código: son decisiones de diseño y alcance ya resueltas.

## Estado actual (base sobre la que crecemos)

- **Roles**: enum `user_role` = `cliente | barbero | admin` (plano). RLS gobernada por
  `is_admin()` (todo-o-nada) y `current_barber_id()` (alcance del portal del barbero).
  El panel `/admin/*` es una sola compuerta: quien es admin ve **todo** (incluidas
  ganancias, liquidaciones y caja). No existe rol intermedio.
- **Barberos**: tabla `barbers` (`profile_id`, `working_hours` JSONB, `is_active`);
  compensación en `barber_compensation` (`commission`/`chair_rental`/`hybrid`/`employee`).
  El barbero gestiona su agenda en `/barbero/mi-agenda`.
- **Tienda**: `/(main)/tienda` sólo tiene búsqueda por texto + filtro por categoría +
  agregar al carrito con chequeo de stock. Sin ficha de producto, orden, reseñas,
  variantes, cross-sell, promociones ni recompra.
- **Ya en el roadmap base**: Mercado Pago, recordatorios WhatsApp/Email
  (`reminders_config`/`communication_logs`), multi-sucursal vía `branch_id`.

## Principios

1. **Ingresos recurrentes y retención** por encima de features vistosas de una sola vez.
2. **Llenar sillón ocioso** = el ROI más directo en una barbería (cada hueco es plata perdida).
3. **Diferenciación**: apuntar a lo que el rubro **todavía no ofrece** en Uruguay, no a copiar agendas.
4. Construir sobre lo que ya existe (haircut_history, lookbook, chat IA, WhatsApp, branch_id).

---

## Iniciativa 1 — RBAC y permisos granulares (pedido explícito del CEO)

**Problema**: hoy "admin" ve todo. El CEO quiere (a) que un admin **cree barberos** y
opcionalmente les dé privilegios de admin, y (b) un **admin intermedio / gerente** que
gestione agendas y operación pero **no** vea todas las ganancias ni toque configuración crítica.

**Decisión de diseño**: no basta con agregar un rol al enum; hay que separar *rol* de
*capacidades*. Modelo recomendado: **rol base + matriz de permisos** (capabilities).

- **Schema**:
  - `ALTER TYPE user_role ADD VALUE 'gerente';` (rol intermedio).
  - `profiles.permissions JSONB` (overrides por persona) + tabla `role_permissions`
    (defaults por rol). Un permiso = clave string.
  - Claves propuestas: `agenda.own`, `agenda.all`, `finances.view`, `finances.manage`,
    `cash.operate`, `products.manage`, `services.manage`, `clients.view`, `clients.manage`,
    `staff.manage`, `branches.manage`, `reports.view`, `settings.manage`.
- **Defaults por rol**:
  - `barbero` → `agenda.own`, `clients.view`, `cash.operate` (solo sus ventas).
  - `gerente` → `agenda.all`, `cash.operate`, `products.manage`, `services.manage`,
    `clients.manage`, `reports.view` **(sin `finances.*`, `staff.manage`, `settings.manage`)**.
  - `admin` (dueño) → todo.
- **SQL helper**: `has_permission(key text)` SECURITY DEFINER que lee rol + overrides.
  Reemplazar los `is_admin()` de RLS **en tablas sensibles** por `has_permission(...)`:
  `barber_compensation`, `cash_movements`, liquidaciones → `finances.view/manage`;
  el resto de las tablas operativas → su permiso correspondiente. Escopar por `branch_id`
  donde aplique (un gerente ve su sucursal, no todas).
- **Crear barberos desde el panel**: endpoint server con `service_role` (mismo patrón que
  `/api/demo-admin/login`) que crea el usuario auth + `profiles` (rol) + fila `barbers`, y
  asigna permisos con checkboxes. UI en `/admin/barberos`.
- **Gating de UI**: filtrar `sidebarLinks` en `src/app/admin/layout.tsx` por permiso, y
  ocultar montos/tarjetas de ganancias cuando falta `finances.view`.
- **Migración**: seed de `role_permissions`, backfill de admins existentes a "todo".

**Valor**: desbloquea operar con equipo sin exponer la caja del dueño; prerequisito para escalar a varias sucursales.

---

## Iniciativa 2 — Tienda v2 (hoy se siente "simple")

Cerrar la brecha entre "grilla de productos" y una tienda que convierte:

- **Ficha de producto (PDP)**: galería, descripción larga, stock, relacionados, CTA. Hoy no existe.
- **Orden y filtros**: por precio/novedad/popularidad, rango de precio, "solo con stock".
- **Cross-sell / upsell**: en el carrito y en el checkout ("suele comprarse con…").
- **Retail attach (novedoso)**: al terminar un corte, sugerir **el producto que usó tu barbero**
  (vincular `services`/`haircut_history` → productos). Convierte el servicio en venta de retail.
- **Reseñas y rating**: solo para quien compró (order `delivered`).
- **Favoritos / wishlist** (requiere auth) + "avisame cuando vuelva" para sin stock.
- **Promos y combos**: cupones, kits de cuidado (bundle con precio de paquete).
- **Suscripción de producto (recurrente)**: reenvío automático mensual del shampoo/cera → ingreso recurrente.
- **UX de stock**: badges de "últimas unidades", estados de agotado prolijos.
- ~~**Datos bancarios editables desde `/admin/configuracion`**~~ → cubierto por el brief FASE 37 (polish config negocio, `business.bank_transfer` en `app_settings`).

**Valor**: sube ticket promedio y suma un canal de ingreso además del sillón.

---

## Iniciativa 3 — Features novedosas de alto valor (adelantarnos al CEO)

Curadas por valor y diferenciación. Etiquetas: **[R]** ingreso recurrente · **[LL]** llena sillón ·
**[D]** diferenciador · **[Q]** quick win.

1. **Lista de espera inteligente / relleno de cancelaciones** **[LL][Q]** — cuando alguien cancela,
   avisar por WhatsApp a quien esté en lista de espera de ese día/franja; 1 tap para tomar el hueco.
   Usa `appointments` + WhatsApp que ya existe. ROI inmediato.
2. **Recordatorio por cadencia + rebook en 1 tap** **[LL][R]** — "hace 4 semanas de tu último corte,
   ¿reservamos?" calculado desde `haircut_history`. Motor de retención automático.
3. **Membresía / abono mensual** **[R][D]** — N cortes/mes o ilimitado por precio fijo; ingreso
   predecible y sube el LTV. Se apoya en Mercado Pago (ya en roadmap).
4. **Depósito anti-no-show + score de reputación** **[LL]** — seña vía Mercado Pago para horarios
   pico o clientes con no-shows; reduce ausencias, la peor pérdida del rubro.
5. **Precios dinámicos / happy hours** **[LL]** — descuento configurable en horas valle para
   empujar demanda a los huecos; el `get_availability` ya conoce la ocupación.
6. **Perfil social del barbero + "seguí a tu barbero"** **[D]** — cada barbero con portfolio
   (extiende lookbook); el cliente sigue a su favorito y recibe aviso de cupos nuevos.
7. **Ficha de cliente premium para el barbero** **[D]** — preferencias, alergias, número de máquina,
   productos usados e historial de fotos. Personalización que fideliza y justifica precio premium.
8. **Antes/después automático por cliente** **[D]** — timeline visual reutilizando el before/after;
   material compartible = marketing orgánico.
9. **Referidos + gift cards ("regalá un corte")** **[R][Q]** — adquisición barata y estacional (fechas).
10. **Analítica para el dueño** **[D]** — utilización de sillón, ingreso por barbero, cohortes de
    retención, ranking de servicios, alerta de churn. Convierte el CRM en herramienta de decisión.
11. **Try-on / recomendación de estilo con IA desde foto** **[D]** — extiende lookbook + chat:
    el cliente sube una foto y sugiere corte + servicio + barbero. Muy pocos en el rubro lo tienen.
12. **"Cualquier barbero" / primer disponible en el wizard** **[LL][Q]** — opción que busca el
    primer hueco entre todos los barberos de la sucursal. Detectada en el ciclo /polish FASE 21;
    excluida de ese brief (requiere consultar `get_availability` multi-barbero con criterio de reparto).
13. **Deep link de sucursal contacto→wizard** **[Q]** — "Reservar en esta sede" con `?branchId=`; requiere que el wizard lea ese param y que contacto use sucursales de DB (hoy usa `BRANCHES` estático con ids numéricos vs uuid). Detectado en el ciclo /polish FASE 29; excluido de ese brief.
14. **Reserva end-to-end desde el chat** **[D]** — el asistente llama `book_appointment` y confirma
    el turno dentro de la conversación (function calling). Detectada en el ciclo /polish FASE 20;
    excluida de ese brief a propósito (el chat guía al wizard, no lo reemplaza — por ahora).
15. **Búsqueda semántica del conocimiento del chat (pgvector)** **[D]** — cuando `chat_knowledge`
    (FASE 31) supere las decenas de entradas, reemplazar el match por keywords por embeddings
    (pgvector en Supabase) para que el fallback local encuentre la respuesta correcta aunque la
    pregunta esté formulada distinto. Detectada en el ciclo /polish FASE 31; excluida de ese brief.
16. **Log de auditoría de cambios de estado de citas** **[D]** — quién cambió qué cita, cuándo y de
    qué estado a cuál (tabla `appointment_events` alimentada por la RPC). Útil con equipo grande y
    para disputas ("me cancelaron el turno"). Detectada en el ciclo /polish FASE 32; excluida de ese
    brief (requiere migración y tocar la RPC).
17. **Export CSV de clientes por segmento** **[Q]** — bajar la lista filtrada (VIP, inactivos,
    cumpleaños) para campañas fuera de la app. Detectada en el ciclo /polish FASE 33; excluida.
18. **Recordatorios masivos por día de agenda** **[LL][Q]** — "avisar a todos los de mañana" en una
    pasada desde /admin/citas, iterando las plantillas por evento de la FASE 30 (sigue siendo `wa.me`
    manual, cita por cita, o da el salto a WhatsApp API). Detectada en el ciclo /polish FASE 30;
    excluida de ese brief (anti-monstruo: sin envíos masivos ni automatización).
18b. **Auditoría de configuración** **[Q]** — historial de cambios de `app_settings` (quién cambió
    qué política y cuándo); útil cuando haya gerentes editando. Detectada en el ciclo /polish
    FASE 37; excluida de ese brief.
19. **Perfil rico del barbero** **[Q]** — columnas nuevas en `barbers` (especialidades, Instagram,
    rating de clientes) mostradas en el wizard y en un perfil público linkeable. Detectada en el
    ciclo /polish FASE 36; excluida de ese brief (requiere migración y moderación de contenido).
20. **Workflow de aprobación de ausencias** — el barbero solicita la licencia y el admin la
    aprueba/rechaza con aviso (hoy el bloqueo propio es directo, permitido por RLS); incluye
    calendario visual de ausencias del equipo. Detectada en el ciclo /polish FASE 36; excluida.

---

## Priorización sugerida (secuencia)

| # | Iniciativa | Por qué primero | Valor / Esfuerzo |
|---|-----------|-----------------|------------------|
| 1 | **RBAC y permisos** (Inic. 1) | Pedido explícito + prerequisito para operar con equipo y multi-sucursal | Alto / Medio |
| 2 | **Waitlist + rebook por cadencia** (3.1, 3.2) | ROI inmediato, usa WhatsApp+datos existentes | Alto / Bajo |
| 3 | **Membresía + depósito anti-no-show** (3.3, 3.4) | Ingreso recurrente; encaja con integración Mercado Pago ya planificada | Alto / Medio |
| 4 | **Tienda v2** (Inic. 2, con retail attach) | Nuevo canal de ingreso; el retail attach es diferenciador | Medio / Medio |
| 5 | **Analítica dueño + perfil social + try-on IA** (3.10, 3.6, 3.11) | Diferenciación de marca una vez sólida la operación | Alto / Alto |

## Cómo se ejecuta

Cada fila de la tabla se convierte, al activarse, en un brief `FASE_NN_*.md` con el detalle
técnico (schema, endpoints, RLS, UI, verificación) listo para Gemini/Sonnet, siguiendo el
flujo multi-modelo del proyecto. Recordar el guard de hooks al bripear (early-return después
de todos los hooks). Este documento es el índice vivo; se actualiza a medida que el CEO
agregue pedidos.
