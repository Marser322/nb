# FASE 20 — Polish: Asistente IA (chat)

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que el chat responda las FAQs reales del cliente con datos vivos (disponibilidad, su propia cita) y lo lleve a donde necesita con deep links, con un pipeline LLM que no se caiga en silencio.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas 2026-07-08)

- Cascada de proveedores: Gemini solo si hay `GEMINI_API_KEY` (`src/app/api/chat/route.ts:313`); OpenAI es `else if` (`route.ts:364`) — **si Gemini falla en runtime (`!response.ok`) NO se intenta OpenAI**, cae directo al motor local. Ninguna de las dos llamadas tiene timeout.
- Conocimiento hidratado de Supabase con fallback estático (`route.ts:124-201`), pero los **horarios son un string fijo** `"Lunes a Sábado: 09:00 - 20:00"` repetido en `staticBranches` (`route.ts:215-219`) y en el map de branches reales (`route.ts:227`). El RPC `get_availability` (fuente única del wizard, `src/lib/supabase_schema.sql:805`, grant a `anon, authenticated` en `:886`) **no se consulta nunca**.
- El chat no sabe nada del usuario logueado: `supabase.auth.getUser()` solo se usa para verificar admin (`route.ts:104`), nunca para leer sus `appointments`.
- Políticas hardcodeadas en el prompt (`route.ts:287-290`) duplican `BUSINESS_CONFIG.cancellationWindowMinutes` (`src/lib/constants.ts:4`).
- Motor local por keywords: mezcla inconsistente de `userQuery` (con acentos) y `normalizedUserQuery` (sin acentos, solo políticas) (`route.ts:92-93`, ramas `:483-590`). "Ubicación" con tilde no matchea `ubicacion` (`route.ts:514`); "cuánto sale" con tilde no matchea `cuanto sale` (`route.ts:486`).
- La rama local de cancelación (`route.ts:563-575`) responde la política pero **sin botón a Mi Cuenta** (donde se cancela de verdad). No existe rama "mi cita / mi próximo turno". No existe rama contacto.
- Deep links ya funcionan: `AssistantData` (`route.ts:45-50`) → el frontend renderiza `<Link>` a `/reservar?serviceId=`, `/reservar?styleId=&serviceId=`, `/tienda` y `action.url` genérico (`src/components/chat/AiAssistant.tsx:315-380`).
- Quick replies cliente: corte / precios / sucursales / reservar (`AiAssistant.tsx:111-119`).
- Rutas canónicas viven en `ROUTES` (`src/lib/constants.ts:224`) pero el route usa strings sueltos (`/admin/caja`, `/reservar`, etc.).
- Helper listo para disponibilidad: `fetchAvailability(supabase, barberId, fromISO, toISO)` (`src/lib/booking.ts:175-217`).

## Análisis (máximo valor / qué NO se hace)

**Valor a extraer**: las 3 preguntas más frecuentes de un cliente de barbería son "¿cuánto sale?" (ya resuelta), "¿hay lugar / a qué hora abren?" (hoy responde con un string que puede mentir) y "¿qué pasa con MI turno?" (hoy no sabe nada). Cerrar esas dos brechas con los ganchos que ya existen (`get_availability`, `auth.getUser`, `AssistantData.action`) convierte al chat de folleto a conserje real, sin agregar superficie nueva de producto.

**Fuera de alcance en este ciclo (anti-monstruo)**:
- NO reservar desde el chat (no llamar `book_appointment`): el chat guía al wizard, no lo reemplaza. (Idea anotada en `ROADMAP_CRECIMIENTO.md`.)
- NO streaming, NO function-calling multi-turno, NO RAG/embeddings, NO historial en DB (sessionStorage alcanza).
- NO tocar el wizard de reserva (saltos de paso por query params = ítem #2 del backlog).
- NO tocar la persona admin salvo el refactor compartido del pipeline.

## Trabajo — Base de datos

Ninguna migración: `get_availability` ya existe con grant a `anon, authenticated` y las lecturas de `appointments` propias las cubre el RLS vigente.

## Trabajo — App

### Bloque A — Pipeline LLM robusto (`src/app/api/chat/route.ts`)

1. Extraer un helper local `callLLM(provider, systemPrompt, messages)` y convertir la cascada en secuencial real: intentar Gemini (si hay key) → **si falla o no devuelve texto, intentar OpenAI (si hay key)** → motor local. Hoy el `else if` de `route.ts:364` hace que OpenAI casi nunca corra.
2. Timeout de 10 s por proveedor (`AbortSignal.timeout(10000)`) para que el chat nunca quede colgado; ante timeout se sigue la cascada.
3. Envolver cada fetch de proveedor en try/catch (hoy un fetch que lanza — DNS, red — corta el handler entero y devuelve 500 en vez de caer al motor local).
4. El parseo del JSON estructurado (idéntico en `route.ts:344-362` y `:387-405`) pasa a una función única `parseAssistantText(text)`.

### Bloque B — Conocimiento vivo: disponibilidad real + la cita del usuario (`src/app/api/chat/route.ts`)

1. **Horarios**: reemplazar el string fijo por copy derivado de `BUSINESS_CONFIG.workingHours` y `workingDays` (`src/lib/constants.ts:12-18`) con la aclaración de que la disponibilidad exacta se ve al reservar. Un solo lugar (constante local `businessHoursCopy`), usado en `staticBranches`, en el map de branches y en el prompt.
2. **Disponibilidad real (context injection, no function calling)**: si la consulta del usuario matchea disponibilidad (`turno|hora|lugar|disponib|agenda|hoy|mañana|manana|libre`), antes de llamar al LLM: tomar hasta 3 barberos activos, llamar `fetchAvailability` (reusar `src/lib/booking.ts:175`) para hoy→+3 días, y armar un resumen compacto (por día: abierto/cerrado, franja, cantidad de huecos libres estimada restando `booked` de la franja con `slot_minutes`). Inyectarlo al system prompt como bloque `DISPONIBILIDAD PRÓXIMOS DÍAS (datos reales)`. Si el RPC falla, se omite el bloque (nunca romper el chat por esto). El motor local, en la rama reserva (`route.ts:502`), usa el mismo resumen si está disponible ("Mañana hay lugar con X e Y…") + el action a `/reservar` que ya tiene.
3. **La cita del usuario**: obtener `auth.getUser()` también en modo client; si hay sesión, buscar su próxima cita (`appointments` propia vía RLS, `status in (pending, confirmed)`, fecha ≥ hoy, join a service/barber para nombres). Inyectar al prompt un bloque `CITA DEL USUARIO` (fecha, hora, servicio, barbero, y si sigue dentro de la ventana de cancelación calculada con `canCancelAppointment` de `src/lib/utils.ts`). Nueva rama local `mi cita|mi turno|mi reserva|proxima cita`: responde con la cita + `action { label: "Ver en Mi Cuenta", url: ROUTES.account }`; si no hay sesión, invita a iniciar sesión con action a login.

### Bloque C — Motor local + navegación completa (`src/app/api/chat/route.ts` + `AiAssistant.tsx`)

1. **Normalizar todo**: usar `normalizedUserQuery` en TODAS las ramas del motor local (hoy solo políticas) para que tildes no rompan el match ("ubicación", "cuánto sale", "próxima").
2. **Cancelación accionable**: la rama de políticas (`route.ts:563`) suma `dataPayload = { type: "action", label: "Gestionar mi turno", url: ROUTES.account }`.
3. **Rama contacto**: `contacto|telefono|whatsapp|llamar|como llego` → datos de la sucursal + `action` a `/contacto`.
4. **Rutas canónicas**: reemplazar los strings de URL sueltos del route por `ROUTES` de `src/lib/constants.ts:224` (verificar qué claves existen; agregar las que falten ahí, no inline).
5. **Quick replies**: en `AiAssistant.tsx:111-119` agregar "¿Hay lugar mañana?" y, solo si hay sesión iniciada, "Mi próximo turno" (obtener sesión con el cliente browser existente; respetar la regla de oro de hooks).
6. El prompt del LLM (`route.ts:287-290`) deriva la ventana de cancelación de `BUSINESS_CONFIG.cancellationWindowMinutes` en vez del texto fijo "2 horas".

### Bloque D — Higiene del prompt (opcional, si sobra presupuesto)

1. Instruir en `structuredOutputInstruction` (`route.ts:299-307`) que ante intención de reservar SIEMPRE incluya `action` a `/reservar` (o al deep link con `serviceId` si el servicio quedó claro en la conversación), y ante dudas de su turno, `action` a Mi Cuenta.

## Parte manual (Mario)

- Nada de DB. Opcional: verificar que `GEMINI_API_KEY` y `OPENAI_API_KEY` estén ambas en Vercel para que el retry tenga sentido en producción.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Sin keys LLM en `.env.local` (motor local): probar "¿cuánto sale un corte?" con tilde, "¿hay lugar mañana?", "quiero cancelar mi turno" (debe traer botón a Mi Cuenta), "mi próximo turno" logueado y deslogueado, "¿cómo llego?".
- Con `GEMINI_API_KEY` inválida a propósito y `OPENAI_API_KEY` válida: el chat debe responder vía OpenAI (verifica el retry).
- Probar en navegador ambos temas y a 375px (el panel del chat ya es responsive; verificar que los nuevos quick replies no rompan el scroll horizontal de `AiAssistant.tsx:273`).

## Criterios de aceptación

- Ante fallo runtime de Gemini, OpenAI responde; ante fallo de ambos, el motor local responde; nunca un 500 por caída de proveedor.
- "¿Hay lugar mañana?" responde con datos reales de `get_availability` (o, si el RPC falla, con la invitación a reservar de siempre — nunca error).
- Un usuario logueado que pregunta por su turno ve fecha/hora/barbero reales y un botón a Mi Cuenta.
- Ninguna rama del motor local falla por tildes.
- Ningún horario inventado: el copy de horarios sale de `BUSINESS_CONFIG` y la disponibilidad del RPC.

## Restricciones

- Rama `feat/polish-chat`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard (`if (!features.X) return`, sesión, loading) va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels y rutas canónicas viven en `src/lib/constants.ts` — no duplicar strings.
- No agregar dependencias nuevas.
