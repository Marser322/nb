# FASE 27 — Polish: Portal barbero (mi-agenda)

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que el barbero, mirando el celular entre cortes, sepa en 2 segundos qué viene ahora, pueda prepararse para mañana y contacte al cliente con un tap — sin agregar superficie nueva al portal.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados. Rama de trabajo: `feat/polish-portal-barbero` desde `refinamiento-pre-demo`.

## Estado actual (anclas verificadas 2026-07-08)

Portal = 2 archivos: `src/app/barbero/mi-agenda/page.tsx` (374 líneas) y `src/app/barbero/layout.tsx` (105).

- **Solo muestra HOY, sin navegación**: `today` fijo (`page.tsx:55`) y query `eq("appointment_date", today)` (`page.tsx:108`). El barbero no puede ver mañana ni repasar ayer. El admin ya resuelve esto con pills de 7 días: `quickDates = Array.from({length: 7}, (_, i) => addDays(startOfToday(), i))` (`src/app/admin/citas/page.tsx:382`).
- **No hay "próxima cita" destacada**: la lista es plana ordenada por hora (`page.tsx:249-358`); ninguna card resalta cuál es la siguiente. El admin ya calcula `nextAppointment` comparando `start_time.slice(0,5) >= format(new Date(), "HH:mm")` sobre activas (`admin/citas/page.tsx:434-437`) — patrón copiable.
- **Teléfono del cliente es texto muerto** (`page.tsx:282-287`): se muestra `cita.client.phone` sin link. Ya existe `buildWaLink(phone, message)` con normalización UY en `src/lib/whatsapp.ts:47-51` (y `normalizeUyPhone`), usado en contacto.
- **Stat `completadas` calculada pero nunca renderizada** (`page.tsx:157` vs grid de 4 cards `page.tsx:196-221`: total, pendientes, confirmadas, ingresos). Código muerto o card faltante.
- **Colores hardcodeados** que rompen tema claro/skins: `text-yellow-400` (205), `text-blue-400` (211), `bg-green-500 hover:bg-green-600` (327), `text-red-400 border-red-400/30` (315), `text-gray-400` (342), badge `bg-green-500/20 text-green-400` con "✓ Completada" a mano (352-354) duplicando `APPOINTMENT_STATUS_LABELS`/`APPOINTMENT_STATUS_COLORS` que el archivo YA importa (18-21).
- **Literales de estado** `"pending"/"confirmed"/"completed"/"no_show"` inline (155-157, 303, 323, 343, 351) en vez de `APPOINTMENT_STATUS` de constants (patrón ya corregido en admin/citas, commit fe19d63).
- **Sidebar genérico**: "Barbero" / "En servicio" hardcodeado (`layout.tsx:62-63`) aunque la página resuelve `barber.name` (`page.tsx:101`); el botón "Volver al inicio" (89-95) no cierra sesión (no hay `signOut` en todo el portal).
- **Ingresos del día**: suma `cash_movements` `type=income` del barbero entre `T00:00:00` y `T23:59:59` (`page.tsx:115-127`) — sin desglose propina/servicio, alcanza como está.
- **Carga**: `generate_subscription_appointments` se `await`ea en serie ANTES de resolver usuario y citas (`page.tsx:60-65`) — retrasa el primer render sin necesidad; es fire-and-forget declarado.
- Lo que está bien (no romper): guard de features después de todos los hooks con comentario explícito (161-167), `ChargeDialog` con gate `features.contabilidad` (328-334), RPC `admin_update_appointment_status` + `getBookingErrorMessage` (137-150), empty state simpático (241-246), resolución auth→profile→barber con mensaje claro (67-99).

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: el portal es la herramienta diaria del barbero en el celular. Navegación de días (patrón admin ya probado), próxima cita imposible de no ver, contacto con 1 tap (WhatsApp ya resuelto en lib), sidebar con identidad real y cierre de sesión, y tema/estados consistentes con el resto de la app.
- **Fuera de alcance (anti-monstruo)**:
  - NO vista semanal/calendario ni grillas nuevas.
  - NO edición de `working_hours`/`schedule_blocks` desde el portal (el editor vive en admin).
  - NO notificaciones/auto-refresh en vivo, NO stats históricas ni comparativas (roadmap 3.10 Analítica).
  - NO tocar `ChargeDialog` ni los RPCs.

## Trabajo — Base de datos

Ninguna migración.

## Trabajo — App

### Bloque A — Navegación de días + próxima cita (page.tsx)

1. Estado `selectedDate` (default hoy) + fila de pills con los próximos 7 días (patrón visual de admin/citas:382 y sus `admin-date-pill` si aplican al portal; si no, pills con tokens). La query de citas y el título usan `selectedDate`; la card "Ingresos del Día" solo tiene sentido para hoy: cuando `selectedDate !== hoy`, mostrar en esa card los ingresos POTENCIALES del día seleccionado (suma de precios de citas activas) con label "Ingresos previstos".
2. Banner/card "Ahora sigue" arriba de la lista, solo cuando `selectedDate` es hoy: próxima cita activa (patrón `nextAppointment` de admin/citas:434-437) con hora, servicio, cliente y acceso directo a sus acciones (puede ser scroll/highlight de la card). Las citas ya pasadas de hoy se atenúan (`opacity-60`).
3. Mover la invocación de `generate_subscription_appointments` para que NO bloquee: dispararla sin `await` (`.then().catch()` con `console.error`) y recargar citas al resolverse solo si trajo cambios… simplificación aceptable: dispararla en paralelo con `Promise.all` junto a la carga, o simplemente no esperarla antes del primer render. Elegí lo más simple que no rompa el flujo actual.

### Bloque B — Contacto con un tap (page.tsx)

1. El teléfono del cliente (282-287) pasa a dos acciones táctiles: link `tel:` y botón WhatsApp con `buildWaLink(phone, mensaje)` de `src/lib/whatsapp.ts:47` — mensaje prellenado en voseo, p.ej. `Hola ${nombre}! Te escribo de NB Barber por tu cita de hoy a las ${hora}.` (ajustar "hoy" si `selectedDate` no es hoy). Si `buildWaLink` devuelve `""` (teléfono no normalizable), mostrar solo el `tel:`.
2. Área táctil ≥40px en mobile (esto se usa con pulgares apurados).

### Bloque C — Higiene de tema y estados (page.tsx)

1. Reemplazar TODOS los literales de estado por `APPOINTMENT_STATUS` (constants ya importadas en el archivo).
2. Badge de completada (352-354): usar `APPOINTMENT_STATUS_LABELS`/`APPOINTMENT_STATUS_COLORS` como el resto.
3. Colores hardcodeados de stats y botones → tokens del tema o las utilidades `admin-*` existentes en `globals.css` si encajan (el portal puede reusar `admin-agenda-stat` con `data-tone` — evaluá; si no encajan, tokens estándar `text-primary`/`text-muted-foreground` + `variant` de Button). El botón destructivo usa `variant="destructive"` o token equivalente, no `text-red-400`.
4. Decidir la stat `completadas`: agregarla como 5ª card NO (el grid es 2×2 en mobile) — reemplazá "Confirmadas" por un formato "X confirmadas · Y completadas" o incorporá completadas al hint de otra card. Lo importante: que el dato calculado se muestre o se borre el cálculo.

### Bloque D — Layout con identidad (layout.tsx)

1. Mostrar el nombre real del barbero en el sidebar/header. El layout es client: resolver auth→profile→barber igual que la página (o extraer ese resolver a un helper compartido `src/lib/barber-session.ts` para no duplicar la cadena de queries — preferido) y mostrar nombre + "En servicio". Fallback "Barbero" si aún carga.
2. Agregar "Cerrar sesión" real (`supabase.auth.signOut()` + redirect a `/`) además de "Volver al inicio" — en sidebar desktop y header mobile.

## Parte manual (Mario)

- Nada.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Logueado como barbero (o vinculando un barbero de prueba): pills de días navegan y la agenda/título/ingresos reaccionan; "Ahora sigue" apunta a la próxima cita activa de hoy y desaparece en otros días; citas pasadas atenuadas.
- Tap en WhatsApp abre wa.me con mensaje prellenado correcto; `tel:` funciona.
- Confirmar/Completar/No vino siguen funcionando (con `features.contabilidad` on → ChargeDialog; off → completa directo).
- Sidebar muestra el nombre real y "Cerrar sesión" desloguea de verdad.
- Ambos temas (claro/oscuro) y 375px (pills scrolleables, botones táctiles, grid de stats 2×2).
- Si el dev server falla con "Failed to open database… invalid digit": `rm -rf .next` + `find . -name '._*' -not -path './node_modules/*' -delete`.

## Criterios de aceptación

- El barbero puede ver cualquiera de los próximos 7 días y volver a hoy en 1 tap.
- La próxima cita de hoy es visualmente inconfundible.
- Llamar o escribir por WhatsApp al cliente toma 1 tap desde la card.
- Cero colores hardcodeados ni literales de estado en el portal; sidebar con nombre real y logout.

## Restricciones

- Rama `feat/polish-portal-barbero`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime. (El guard existente de `page.tsx:161` ya lo cumple — mantenerlo así.)
- Estados/labels de citas viven en `src/lib/constants.ts` — no duplicar strings.
