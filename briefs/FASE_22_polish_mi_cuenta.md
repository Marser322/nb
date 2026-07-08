# FASE 22 — Polish: Mi cuenta / fidelización

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: llevar "lo mismo de la vez pasada" a su máximo — historial de visitas visible y repetible, rebook sin fricción, cancelación premium y perfil editable.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas 2026-07-08)

Todo en `src/app/(main)/mi-cuenta/page.tsx` salvo indicación:

- El rebook ya existe y está bien resuelto: `lastExperience` toma `haircut_history[0]` con fallback a la última cita pasada (`page.tsx:132-149`) y `repeatHref` arma `/reservar?serviceId=X&barberId=Y` (`page.tsx:202-204`). `haircut_history` se alimenta automáticamente al cobrar la cita (RPC `complete_appointment_with_payment`, `src/lib/supabase_schema.sql:1233-1236`).
- **`recentAppointments` se cargan (últimas 5, `page.tsx:92-99`) pero nunca se renderizan**: solo se usan como fallback de `lastExperience`. El cliente no tiene ninguna lista visible de visitas pasadas.
- La tarjeta "Última experiencia" no muestra **cuándo** fue (`page.tsx:282-311`): sin fecha ni "hace X semanas", el dato de fidelización más útil de la página.
- Las cancelaciones (turno y suscripción) usan `window.confirm` nativo (`page.tsx:152-154`, `:172-175`) — rompe la estética premium en ambos temas.
- El mensaje de error de cancelación hardcodea "2 horas" (`page.tsx:185`) en vez de derivar de `BUSINESS_CONFIG.cancellationWindowMinutes` (`src/lib/constants.ts:4`); ídem el texto "menos de 2 h" (`page.tsx:376`).
- La tarjeta Perfil muestra nombre y teléfono en solo-lectura, con "Sin teléfono cargado" como estado frecuente (`page.tsx:257-264`); no hay forma de completarlo ni editarlo.
- Ganchos disponibles: `Dialog` en `src/components/ui/dialog.tsx` (NO existe `alert-dialog`; no agregar dependencias — usar Dialog), `react-hook-form` + `zod` ya en el stack, `ROUTES` (`src/lib/constants.ts:226-253`), `canCancelAppointment` (`src/lib/utils.ts`), labels de estados en `constants.ts`.
- Integración con FASE 21: el wizard auto-avanza pasos resueltos por query params (`briefs/FASE_21_polish_wizard_reserva.md`, bloque A). El rebook pasa `barberId`, y el barbero tiene `branch_id` — hoy la sucursal no se deriva.

## Análisis (máximo valor / qué NO se hace)

**Valor a extraer**: la promesa de la página es "tu estilo, sin empezar de cero", y el motor (`haircut_history` + `repeatHref`) ya funciona — lo que falta es superficie: el historial existe pero es invisible, la última experiencia no dice cuándo fue, y el camino de rebook todavía puede exigir elegir sucursal. Cerrar eso convierte Mi cuenta en la página de retención del negocio. Los `window.confirm` y el teléfono no editable son la diferencia entre "demo" y "producto".

**Fuera de alcance en este ciclo (anti-monstruo)**:
- NO recordatorios push/WhatsApp por cadencia (ya está como iniciativa #2 en `ROADMAP_CRECIMIENTO.md`) — acá solo el hint pasivo en pantalla.
- NO fotos del historial (`photo_urls` queda para "antes/después automático", roadmap #8).
- NO cambio de contraseña/email (ya existe flujo `/recuperar`), NO borrado de cuenta.
- NO reprogramar citas (solo cancelar, como hoy).

## Trabajo — Base de datos

Ninguna migración: el RLS ya permite al cliente leer su historial y actualizar su perfil.

## Trabajo — App

### Bloque A — La última experiencia, completa

En `src/app/(main)/mi-cuenta/page.tsx`:

1. Mostrar en la tarjeta "Última experiencia" la fecha (`created_at`, formato `d 'de' MMMM` con locale `es`) y un hint de cadencia: "Hace X semanas" (con `differenceInWeeks` de date-fns; si es < 1 semana, "Esta semana"). Si pasaron ≥ 4 semanas, un matiz de copy que invite a repetir ("¿Volvemos a dejarlo impecable?") — solo copy, nada de lógica nueva.
2. **Rebook sin paso de sucursal**: en `src/app/(main)/reservar/page.tsx`, dentro del cálculo de arranque del bloque A de la FASE 21: si `paramBarberId` resuelve a un barbero con `branch_id`, auto-seleccionar esa sucursal (el filtro `filteredBarbers` de `page.tsx:172-176` ya usa esa relación). Si la FASE 21 aún no se mergeó, implementar solo este caso puntual sin bloquear.

### Bloque B — Historial de visitas visible

1. Nueva sección/Card "Historial de visitas" que renderice las `recentAppointments` ya cargadas (`page.tsx:92-99`, hoy invisibles): fecha, servicio, barbero, precio y badge de estado (labels/colores de `constants.ts` como en Próximas reservas).
2. Cada visita con acción "Repetir" → `/reservar?serviceId=X&barberId=Y` (mismo patrón de `repeatHref`).
3. Estado vacío consistente con los existentes (ícono + copy).

### Bloque C — Cancelación premium

1. Reemplazar ambos `window.confirm` por un `Dialog` de confirmación (reusar `src/components/ui/dialog.tsx`): título claro, detalle del turno/suscripción a cancelar, botones "Volver" / "Sí, cancelar" (destructivo). Un solo componente reutilizado para ambos casos.
2. Derivar los textos de ventana de cancelación de `BUSINESS_CONFIG.cancellationWindowMinutes` (mostrar "2 horas" calculado, no hardcodeado) en `page.tsx:185` y `:376`.

### Bloque D — Perfil editable

1. Botón "Editar" en la tarjeta Perfil que abre un `Dialog` con form (`react-hook-form` + `zod`): `full_name` (requerido, min 2) y `phone` (opcional, formato uruguayo laxo: dígitos/espacios, 8-12). `supabase.from("profiles").update(...)` sobre el propio perfil; actualizar el estado local y toast de éxito.
2. Si `phone` está vacío, la tarjeta muestra un nudge suave ("Agregalo para que podamos avisarte de tu turno") en lugar del actual "Sin teléfono cargado" a secas.

## Parte manual (Mario)

- Nada.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Con un cliente que tenga historial: la última experiencia muestra fecha y "hace X semanas"; el historial lista las visitas con "Repetir" funcionando (aterriza en el wizard con servicio+barbero marcados y, si FASE 21 está integrada, sin pasos redundantes).
- Cancelar un turno y una suscripción: el Dialog aparece en ambos temas, la cancelación sigue funcionando, y el caso "fuera de ventana" muestra el texto derivado de la config.
- Editar perfil: guardar nombre y teléfono, recargar la página y verificar persistencia; probar validaciones (nombre vacío, teléfono inválido).
- Navegador: ambos temas y 375px (nueva sección de historial y dialogs).

## Criterios de aceptación

- El cliente ve sus visitas pasadas y puede repetir cualquiera en un toque.
- La última experiencia dice cuándo fue, en semanas.
- Ningún `window.confirm` queda en la página; ningún "2 horas" hardcodeado.
- El teléfono del cliente es editable y persiste.
- Todo lo existente (cancelar, suscripciones, pedidos, tour ids `#profile-card`/`#last-experience-card`/`#upcoming-reservations-card`) sigue funcionando igual.

## Restricciones

- Rama `feat/polish-mi-cuenta`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks. El build no lo detecta; crashea en runtime.
- No agregar dependencias (usar `Dialog` existente, no instalar `alert-dialog`).
- Coordinación: el punto A2 toca `reservar/page.tsx`, que la FASE 21 modifica en paralelo — si hay conflicto al mergear, prevalece la estructura de FASE 21 y A2 se reimplementa encima.
