# POLISH_BACKLOG — Loop de perfeccionamiento

> Cola priorizada del loop `/polish`: Fable analiza un área a fondo y deja un brief `FASE_NN_polish_*.md` listo para Sonnet.
> Documento vivo: el skill actualiza estados e historial en cada ciclo.

## Principios del loop

1. **Simple pero profundo**: llevar cada función existente al máximo de su valor sin agregar superficie. Pulir ≠ agregar features — las ideas de features nuevas van a `ROADMAP_CRECIMIENTO.md`, no a un brief de polish.
2. **Anti-monstruo**: cada brief declara explícitamente qué NO se hace en ese ciclo.
3. **Anclado a código real**: toda afirmación del brief con `archivo:línea` verificado en el ciclo, nunca de memoria.
4. **Un ciclo = un brief**: cada invocación de `/polish` produce exactamente un brief ejecutable y autocontenido.

## Estados

`pendiente` → `en análisis` → `brief listo (FASE_NN)` → `ejecutado` → `verificado`

## Cola priorizada — Ciclo 1 (completada 9/9)

| # | Área | Máximo valor a extraer | Estado |
|---|------|------------------------|--------|
| 1 | **Asistente IA (chat)** | Que responda las FAQs reales (disponibilidad viva vía `get_availability`, políticas, precios) y lleve al usuario a donde necesita con deep links; fallback local robusto; OpenAI como retry real ante fallo de Gemini. Pre-análisis hecho (ver abajo). | ejecutado |
| 2 | **Wizard de reserva** | Deep links que salten pasos ya resueltos (auto-avance cuando hay selección por query params), menos fricción en el flujo de 6 pasos. | ejecutado |
| 3 | **Mi cuenta / fidelización** | Explotar `haircut_history` para "lo mismo de la vez pasada": rebook en 1 toque desde la última cita. | ejecutado |
| 4 | **Skins visuales del admin** (código GPT en `feat/visual-skins`, `27cd627`) | Estabilizar: anti-FOUC, skins sin fuga al sitio público (branding NB inmutable), CSS en `@layer components` sin `!important`, contraste 4 skins × claro/oscuro. | ejecutado |
| 5 | **Dashboard admin** | Que las métricas respondan las preguntas reales del dueño (¿cómo viene el mes?, ¿quién rinde?, ¿qué se cae?). Correrlo DESPUÉS de los skins (pegan de lleno en dashboard/crm-cards). | ejecutado |
| 6 | **Home + lookbook** | Conversión hacia reserva; que el patrón lookbook→wizard (`?styleId=&serviceId=`) rinda al máximo. | ejecutado |
| 7 | **Portal barbero (mi-agenda)** | Profundidad del día a día: agenda clara, ingresos del día, próxima cita a un vistazo. | ejecutado |
| 8 | **Tienda + checkout (pulido menor)** | Solo terminación fina que no pise Tienda v2 del roadmap (PDP, cross-sell, etc. quedan allá). | ejecutado |
| 9 | **Contacto / auth / detalles** | Terminación premium: recuperar contraseña, contacto, microcopy, estados vacíos. | ejecutado |

## Cola priorizada — Ciclo 2 (sembrada 2026-07-09)

> Foco del ciclo 2: pensamiento lateral sobre cada función del admin — evaluar todos los escenarios posibles, plantillas de mensajes por evento y chat con conocimiento vivo que aprende de las preguntas. Ítems 12-17 son propuestas reordenables; cada ciclo re-analiza el código antes de escribir el brief.

| # | Área | Máximo valor a extraer | Estado |
|---|------|------------------------|--------|
| 10 | **Plantillas de mensajes contextuales** | Plantillas por evento (cancelación, confirmación, reprogramación, recordatorio de cita, agradecimiento post-visita) con variables `{fecha}/{hora}/{barbero}/{servicio}/{sucursal}`; al cancelar/reprogramar/confirmar desde `/admin/citas`, ofrecer avisar al cliente por WhatsApp con la plantilla precargada y loguear en `communication_logs`. Reusar `fillTemplate`/`SendWhatsappDialog`; envío sigue siendo `wa.me` manual. | ejecutado |
| 11 | **Chat que aprende (auto-aprendizaje)** | `chat_logs` (pregunta/respuesta/proveedor/modo) + `chat_knowledge` auto-alimentada por el LLM e inyectada al prompt; panel en admin para ver preguntas frecuentes/sin respuesta y editar/borrar lo aprendido; flag `chat_aprendizaje` para apagarlo. Guardrail: lo aprendido nunca pisa datos live de Supabase. | ejecutado |
| 12 | **Citas: escenarios límite** | No-show con reactivación, walk-in rápido, cliente llega tarde, doble gestión del mismo horario, cancelación en cadena por bloqueo de agenda. | ejecutado |
| 13 | **Clientes/CRM: segmentación y acciones** | Segmentos (top clientes, frecuencia, en riesgo), cumpleaños si hay dato, envío WhatsApp por segmento reutilizando `SendWhatsappDialog`. | ejecutado |
| 14 | **Caja + liquidaciones: escenarios** | Ajustes/retiros, cierre de día, diferencias de caja, liquidación con citas sin cobrar. | ejecutado |
| 15 | **Pedidos + POS: flujos de borde** | Cancelación con restock, stock insuficiente en mostrador, pedido pagado sin stock. | ejecutado |
| 16 | **Barberos: ausencias y perfil** | Autogestión de ausencias desde el portal (RLS ya lo permite), visibilidad de licencias en admin, primer turno libre por barbero en el wizard. Nota: franjas por día ya existían (`break_start/break_end`). | ejecutado |
| 17 | **Configuración: negocio editable** | Claves `business.%` en `app_settings` (contacto, horarios de copy, ventana de cancelación enforced en el RPC, tolerancia, datos bancarios) editables desde `/admin/configuracion` con patrón features.ts; consumidas por footer/contacto/checkout/mi-cuenta/chat/JSON-LD. Migración 027. | brief listo (FASE_37) |

## Pre-análisis del ítem #1 (chat) — insumo listo, no re-explorar desde cero

Recolectado el 2026-07-08 sobre `src/app/api/chat/route.ts` y `src/components/chat/AiAssistant.tsx`:

- Cascada Gemini 1.5-flash → OpenAI gpt-4o-mini (**solo si falta la key de Gemini**; no hay retry ante fallo runtime de Gemini) → motor de reglas local por keywords. Dos personas client/admin (admin verificado contra `profiles.role`).
- Conocimiento hidratado de Supabase (services, barbers, products, lookbook, branches, feature flags) con fallback a `src/lib/static-data.ts`. Los horarios son un string fijo — **no consulta el RPC `get_availability`**, así que no puede responder "¿hay turno mañana a las 15?".
- No conoce las citas del usuario logueado (no lee `appointments`).
- Ya existe el mecanismo de respuestas estructuradas `{content, data}` con deep links (`/reservar?serviceId=X&styleId=Y`, `action{label,url}`) renderizados como `<Link>` en el frontend — es la base para "llevar al usuario a donde necesita".
- Ganchos reutilizables: `src/lib/booking.ts` (`fetchAvailability` → RPC `get_availability`), `src/lib/constants.ts` (ROUTES, BUSINESS_CONFIG), `src/lib/features.ts`. El wizard ya lee `serviceId/styleId/barberId` de query params pero no salta pasos (eso es el ítem #2).

## Historial de ciclos

| Fecha | Ítem | Brief | Ejecución (commit/rama) |
|-------|------|-------|-------------------------|
| 2026-07-08 | #1 Asistente IA (chat) | `FASE_20_polish_chat.md` | merge `62d15d4` (`feat/polish-chat`) |
| 2026-07-08 | #2 Wizard de reserva | `FASE_21_polish_wizard_reserva.md` | merge `d1e28a9` (`feat/polish-wizard-reserva`) |
| 2026-07-08 | #3 Mi cuenta / fidelización | `FASE_22_polish_mi_cuenta.md` | merge `4fa1e20` (`feat/polish-mi-cuenta`) |
| 2026-07-08 | #4 Skins visuales del admin | `FASE_23_polish_skins.md` | merge `db9249a` (`feat/visual-skins`; Sonnet caído por API 500, terminado por Fable) |
| 2026-07-08 | #5 Dashboard admin | `FASE_24_polish_dashboard.md` | merge `4df2309` (`feat/polish-dashboard`) |
| 2026-07-08 | #6 Home + lookbook | `FASE_25_polish_home_lookbook.md` | merge `daeb368` (`feat/polish-home-lookbook`) |
| 2026-07-08 | #7 Portal barbero | `FASE_27_polish_portal_barbero.md` | merge `d13c95b` (`feat/polish-portal-barbero`) |
| 2026-07-08 | #8 Tienda + checkout | `FASE_28_polish_tienda_checkout.md` | merge `acbc304` (`feat/polish-tienda-checkout`) |
| 2026-07-08 | #9 Contacto / auth | `FASE_29_polish_contacto_auth.md` | merge `fe912e9` (`feat/polish-contacto-auth`) |
| 2026-07-09 | #10 Plantillas de mensajes contextuales | `FASE_30_polish_plantillas_mensajes.md` | merge `30f9282` (`feat/polish-plantillas-mensajes`, Sonnet) |
| 2026-07-09 | #11 Chat que aprende (auto-aprendizaje) | `FASE_31_polish_chat_aprendizaje.md` | merge `32d41ff` (`feat/polish-chat-aprendizaje`, Sonnet) |
| 2026-07-09 | #12 Citas: escenarios límite | `FASE_32_polish_citas_escenarios.md` | merge `032cfe6` (`feat/polish-citas-escenarios`, Sonnet) |
| 2026-07-09 | #13 Clientes/CRM: segmentación | `FASE_33_polish_crm_segmentacion.md` | merge `d9a138d` (`feat/polish-crm-segmentacion`, Sonnet) |
| 2026-07-09 | #14 Caja + liquidaciones: escenarios | `FASE_34_polish_caja_liquidaciones.md` | merge `6a20c09` (`feat/polish-caja-liquidaciones`, Sonnet) |
| 2026-07-09 | #15 Pedidos + POS: flujos de borde | `FASE_35_polish_pedidos_pos.md` | merge `601e630` (`feat/polish-pedidos-pos`) |
| 2026-07-09 | #16 Barberos: ausencias y perfil | `FASE_36_polish_barberos_ausencias.md` | merge `2f815cd` (`feat/polish-barberos-ausencias`, Sonnet) |
| 2026-07-09 | #17 Configuración: negocio editable | `FASE_37_polish_config_negocio.md` | pendiente |

> **Cola completada (9/9, 2026-07-08).** Próximos ciclos de /polish: proponer áreas nuevas o re-pulir con lo aprendido; las features grandes viven en `ROADMAP_CRECIMIENTO.md`.
