# FASE 21 — Polish: Wizard de reserva

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: reducir la fricción del wizard de 6 pasos — que los deep links salten los pasos ya resueltos, que el paso de referencia use el lookbook real, y que fechas/horas no mientan ni dejen al usuario frente a grillas vacías.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas 2026-07-08)

Todo en `src/app/(main)/reservar/page.tsx` salvo indicación:

- Los query params `styleId`/`serviceId`/`barberId` se leen y preseleccionan estado (`page.tsx:40-42`, `:48-50`, `:99-110`) pero `currentStep` arranca en 0 (`page.tsx:44`): el usuario que llega desde el lookbook o el chat con todo elegido igual recorre Sucursal → Servicio → Referencia a mano. El único salto de paso existente es la rehidratación del draft, que va al paso 5 (`page.tsx:157`).
- **El paso Referencia solo conoce `STATIC_STYLES`**: la preselección por `styleId` (`page.tsx:48-49`), la rehidratación del draft (`page.tsx:144`) y la grilla del paso 3 (`page.tsx:819`) usan el array estático — nunca la tabla `lookbook`. El chat y el lookbook operan con ids de la DB (`src/app/api/chat/route.ts:536`, tabla leída en `:177-183`), así que un `styleId` real de DB no matchea y se ignora en silencio.
- La tarjeta de sucursal muestra **"Abierto hoy" hardcodeado** con check verde (`page.tsx:647-650`), sin ningún dato detrás.
- `availableDates` lista los días con `is_open` (`page.tsx:220-224`) aunque estén completamente llenos: el usuario elige un día, espera la carga y descubre a mano que no hay horas. Y si `timeSlots` queda sin ningún slot disponible, la grilla de horas se renderiza vacía sin mensaje ni salida (`page.tsx:981-1005`).
- Tras confirmar, el form se resetea al paso 0 con un toast (`page.tsx:467-485`): no hay pantalla de éxito con el resumen ni CTA a Mi Cuenta.
- Al pasar de paso no se hace scroll al inicio del contenido: en mobile el botón "Siguiente" está al fondo (`page.tsx:1098-1124`) y el paso nuevo aparece fuera de viewport.
- Ganchos: `fetchAvailability` y `DayAvailability` (`src/lib/booking.ts:175-217`), `generateTimeSlotsFromRange` y `calculateEndTime` (`src/lib/utils.ts`), filtro de barberos por sucursal (`page.tsx:172-176`), lógica de slots `isSlotAvailable` (`page.tsx:227-281`), ids `step-indicator-${index}` usados por el tour (`page.tsx:569`) — no romperlos.

## Análisis (máximo valor / qué NO se hace)

**Valor a extraer**: el wizard ya es sólido por detrás (RPCs anti-solape, draft, disponibilidad real); su techo está en la entrada y la salida. Entrada: el ecosistema entero (lookbook, chat FASE 20, home) genera deep links que hoy solo "pintan" selecciones — hacer que aterricen en el primer paso sin resolver convierte esos links en atajos reales. Salida: una confirmación digna cierra el ciclo emocional de la reserva y alimenta Mi Cuenta. En el medio, honestidad de datos: días llenos marcados y grillas vacías con salida.

**Fuera de alcance en este ciclo (anti-monstruo)**:
- NO opción "cualquier barbero / primer disponible" (anotada en `ROADMAP_CRECIMIENTO.md`).
- NO reserva multi-servicio, NO pago online (Mercado Pago ya está en roadmap), NO edición de reservas existentes.
- NO tocar los RPCs ni la lógica de `isSlotAvailable` (funciona y está probada).
- NO rediseño visual: misma estética, mismos componentes.

## Trabajo — Base de datos

Ninguna migración.

## Trabajo — App

### Bloque A — Arranque inteligente (deep links que saltan pasos)

En `src/app/(main)/reservar/page.tsx`:

1. Al terminar `loadData` (`page.tsx:68-115`), calcular el **primer paso sin resolver** y setear `currentStep` una sola vez (no pisar al draft, que tiene prioridad y va al paso 5):
   - Si hay **una sola sucursal activa**, auto-seleccionarla (el paso Sucursal deja de existir en la práctica; el indicador puede mostrarla resuelta).
   - Con `serviceId` resuelto → saltar Servicio; con `styleId` resuelto → saltar Referencia; con `barberId` resuelto → saltar Barbero. Avanzar hasta el primer paso cuyo dato falte (típico lookbook: `styleId+serviceId` + sucursal única → aterrizar en Barbero).
2. Mantener navegación hacia atrás normal (el usuario puede volver y cambiar lo preseleccionado).
3. Cuidado con el orden de efectos: el cálculo va en el mismo flujo post-carga que ya setea las preselecciones, y el draft-check (`page.tsx:118-169`) debe seguir ganando si rehidrata.

### Bloque B — Referencia con lookbook real

1. En `loadData`, cargar también `lookbook` de Supabase (mismo patrón fallback que services/barbers: si viene vacío, `STATIC_STYLES`). Tipar un `StyleItem` mínimo común (`id`, `title`, `image_url`, `serviceId?`, `tags?`).
2. Usar esa lista en: preselección por `paramStyleId` (`page.tsx:48-50` — pasa a resolverse post-carga, no en el initializer), rehidratación del draft (`page.tsx:144`) y grilla del paso 3 (`page.tsx:819`).
3. `styleRef` del submit (`page.tsx:436`) sigue armándose igual (`title (image_url)`).
4. Verificar que el link del chat `styles` (`AiAssistant.tsx:339`) y el del lookbook siguen funcionando con ids de DB **y** con ids estáticos.

### Bloque C — Honestidad de fechas/horas + detalles

1. **Días llenos**: en `availableDates`, calcular por día si queda al menos un hueco para la duración del servicio elegido (reusar la aritmética de `isSlotAvailable` extrayendo un helper `dayHasFreeSlot(day, durationMinutes)` — considerar ubicarlo en `src/lib/booking.ts` para que la FASE 20 (chat, bloque B2) reuse el mismo cálculo). Días sin hueco: renderizarlos deshabilitados con etiqueta "Completo" (no ocultarlos: ver el día lleno comunica demanda).
2. **Grilla de horas vacía**: si `timeSlots` filtrados no dejan ninguna hora disponible, mostrar estado vacío con mensaje ("No quedan horarios este día para este servicio") y sugerencia de elegir otro día u otro barbero (botón que vuelve al paso Barbero).
3. **"Abierto hoy" honesto**: quitar el check hardcodeado (`page.tsx:647-650`) — reemplazarlo por el teléfono de la sucursal, dato que ya está en el objeto.
4. **Scroll al cambio de paso**: en `nextStep`/`prevStep`, scrollear al inicio del contenido del paso (`scrollIntoView` sobre el contenedor, con `behavior: "smooth"`), especialmente para mobile.

### Bloque D — Pantalla de éxito (cierre del ciclo)

1. Tras `bookAppointment` exitoso (`page.tsx:467-485`), en lugar de resetear al paso 0: estado `confirmed` que renderiza una vista de éxito con el resumen (mismos datos del paso 6), fecha/hora destacadas, y dos CTAs: "Ver mis reservas" → `/mi-cuenta` y "Hacer otra reserva" (que sí resetea el form). Mantener el toast.
2. Respetar el modo dummy (`page.tsx:348-412`): misma pantalla de éxito.

## Parte manual (Mario)

- Nada.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Deep links: `/reservar?styleId=<id de DB>&serviceId=<id>` debe aterrizar más allá de Referencia con estilo y servicio marcados; lo mismo con ids estáticos (`style-1`). `/reservar` pelado se comporta como siempre (o salta Sucursal si hay una sola activa).
- Draft: reservar sin sesión, loguearse, volver — debe seguir aterrizando en Confirmar (paso 5).
- Elegir un barbero con un día completamente reservado: el día aparece "Completo" y deshabilitado; un día sin horas muestra el estado vacío con salida.
- Confirmar una reserva de verdad (o en modo dummy): aparece la pantalla de éxito con ambos CTAs.
- Tour de la home: verificar que los `step-indicator-*` siguen presentes y el tour no rompe.
- Navegador: ambos temas y 375px (scroll de paso, tarjetas, pantalla de éxito).

## Criterios de aceptación

- Un usuario que llega del lookbook con estilo+servicio no repite manualmente ningún paso ya resuelto.
- Un `styleId` de la tabla `lookbook` real preselecciona la referencia (hoy se ignora).
- Ningún día "abierto pero lleno" invita a un clic muerto; ninguna grilla de horas queda vacía sin mensaje.
- Después de confirmar, el usuario ve su reserva resumida con acceso directo a Mi Cuenta.
- El flujo actual sin query params, el draft y el tour siguen funcionando exactamente igual.

## Restricciones

- Rama `feat/polish-wizard-reserva`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- No tocar RPCs ni `isSlotAvailable` más allá de extraer el helper; no agregar dependencias.
- Si la FASE 20 (chat) ya se ejecutó y creó el helper de conteo de huecos en `booking.ts`, reusarlo en vez de duplicarlo (y viceversa).
