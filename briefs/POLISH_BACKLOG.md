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

## Cola priorizada

| # | Área | Máximo valor a extraer | Estado |
|---|------|------------------------|--------|
| 1 | **Asistente IA (chat)** | Que responda las FAQs reales (disponibilidad viva vía `get_availability`, políticas, precios) y lleve al usuario a donde necesita con deep links; fallback local robusto; OpenAI como retry real ante fallo de Gemini. Pre-análisis hecho (ver abajo). | ejecutado |
| 2 | **Wizard de reserva** | Deep links que salten pasos ya resueltos (auto-avance cuando hay selección por query params), menos fricción en el flujo de 6 pasos. | ejecutado |
| 3 | **Mi cuenta / fidelización** | Explotar `haircut_history` para "lo mismo de la vez pasada": rebook en 1 toque desde la última cita. | ejecutado |
| 4 | **Home + lookbook** | Conversión hacia reserva; que el patrón lookbook→wizard (`?styleId=&serviceId=`) rinda al máximo. | pendiente |
| 5 | **Dashboard admin** | Que las métricas respondan las preguntas reales del dueño (¿cómo viene el mes?, ¿quién rinde?, ¿qué se cae?). | pendiente |
| 6 | **Portal barbero (mi-agenda)** | Profundidad del día a día: agenda clara, ingresos del día, próxima cita a un vistazo. | pendiente |
| 7 | **Tienda + checkout (pulido menor)** | Solo terminación fina que no pise Tienda v2 del roadmap (PDP, cross-sell, etc. quedan allá). | pendiente |
| 8 | **Contacto / auth / detalles** | Terminación premium: recuperar contraseña, contacto, microcopy, estados vacíos. | pendiente |

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
