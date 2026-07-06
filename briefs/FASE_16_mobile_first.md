# FASE 16 — Auditoría mobile-first y full responsive · brief para GPT

CONTEXTO: NB Barber (Next.js 16 App Router + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase). Repo en `/Volumes/1TB CACHE/Barberia`. El sitio es una web-app que los clientes van a usar sobre todo DESDE EL CELULAR (reservar turno, chatear con el asesor IA, comprar). Mario detectó en uso móvil real: **zoom involuntario al tocar el input del chat de los asistentes IA**, paddings rotos, y en general falta de garantía mobile-first. Esta fase es una auditoría-y-arreglo integral: el objetivo es que la app sea genuinamente usable con una mano en un iPhone/Android de 360-390px.

Los bugs principales YA ESTÁN DIAGNOSTICADOS (secciones 1-4, con archivo y línea). Las secciones 5-9 son barridos sistemáticos con metodología incluida. Ejecutá en orden: primero lo diagnosticado, después los barridos.

## REGLAS OBLIGATORIAS (no negociables)

- Toda la UI en español con voseo uruguayo ("tenés", "reservá").
- Tokens de tema SIEMPRE (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `primary`, `border-border`); nada de colores hardcodeados. Probar cada cambio en tema claro Y oscuro.
- **En componentes React, cualquier guard/early-return va SIEMPRE DESPUÉS de todos los hooks** (useState/useEffect/useRef/custom hooks). El build NO detecta la violación; crashea en runtime con "Rendered fewer hooks than expected". Revisá cada componente que toques antes de moverte al siguiente.
- Mobile-first real: la clase base es la de mobile, los breakpoints (`sm:`, `md:`, `lg:`) agregan lo de pantallas grandes — no al revés.
- NO rediseñar nada: misma estética lujo minimalista, mismos layouts en desktop. Esta fase corrige comportamiento en viewports chicos, no cambia el diseño.
- NO hacer ningún commit ni `git add`. Todo el trabajo queda en el working tree; el orquestador audita y commitea.
- `npm run build` y `npm run lint` deben pasar limpios al final (hay ~44 warnings preexistentes; no agregar nuevos).
- Si git falla con "non-monotonic index": `find .git -name '._*' -delete` (repo en disco externo).

---

## 1. BUG CRÍTICO — Zoom de iOS al enfocar el input del chat (causa exacta encontrada)

iOS Safari hace **zoom automático de toda la página** cuando el usuario enfoca un `input`/`textarea`/`select` cuyo font-size computado es **menor a 16px**. Ese zoom además deja la página desplazada/recortada al cerrar el teclado — es exactamente lo que Mario vio "como bugs de paddings al conversar con los agentes".

### 1a. El input del chat
`src/components/chat/AiAssistant.tsx:409` — el `<Input>` del chat pisa la base con `text-xs sm:text-sm` (12px en mobile). El componente base `src/components/ui/input.tsx` ya hace lo correcto (`text-base md:text-sm` = 16px en mobile, 14px en desktop); el override lo rompe. **Fix**: quitar `text-xs sm:text-sm` de esa className y dejar que la base gobierne (si visualmente hace falta más chico en desktop, usar `md:text-sm`, nunca por debajo de 16px en <768px).

### 1b. Barrido de TODOS los campos enfocables
Regla del proyecto a partir de ahora: **ningún campo enfocable puede computar <16px por debajo de 768px**. Auditar:
- Todos los usos de `<Input`, `<Textarea`, `<SelectTrigger` con `text-xs` o `text-sm` en su className (ya detectados al menos: `src/app/admin/dashboard/page.tsx:261` y `:277` con `SelectTrigger className="w-[160px] h-9 text-xs"`). En estos casos usar `text-base md:text-xs` o quitar el override.
- Inputs raw (`<input`, `<textarea`, `<select` sin componente): hay en `src/app/(main)/reservar/page.tsx` y `src/components/admin/image-upload.tsx`. Verificar su font-size computado.
- El componente base `SelectTrigger` en `src/components/ui/select.tsx`: verificar que en mobile compute ≥16px como hace `input.tsx`; si no, aplicar el mismo patrón `text-base md:text-sm`.
- Comando útil: `grep -rn --include='*.tsx' 'text-xs\|text-sm' src/ | grep -i 'input\|textarea\|selecttrigger'` y revisar caso por caso.

### 1c. Cinturón de seguridad en el viewport
En `src/app/layout.tsx` agregar el export `viewport` de Next (hoy NO existe — verificado):
```ts
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // habilita env(safe-area-inset-*) en iPhone — lo usa la sección 3
  // NO usar maximumScale:1 ni userScalable:false — bloquear el pinch-zoom es un problema de accesibilidad;
  // el zoom por focus se elimina con los 16px de 1a/1b, no bloqueando el zoom.
};
```

---

## 2. Panel del chat IA: altura y teclado en mobile (diagnosticado)

`src/components/chat/AiAssistant.tsx:237` — el panel usa `fixed bottom-24 left-4 right-4 ... h-[70vh] max-h-[600px]`.

Problemas:
- `vh` en Safari/Chrome móvil incluye la zona de la barra de URL colapsable: `70vh` puede quedar más alto que el viewport visible y el input de abajo queda tapado o fuera de pantalla. **Fix**: `h-[70dvh] max-h-[600px]` (unidad dinámica; Tailwind 4 la soporta con corchetes) y agregar `max-h-[calc(100dvh-8rem)]` para que nunca se pase del viewport real menos el offset del FAB.
- Con el teclado abierto en iOS el panel NO se redimensiona (iOS no reduce el layout viewport). Mitigación estándar: en el export `viewport` del layout agregar `interactiveWidget: "resizes-content"` (Android/Chrome lo respeta) y en el `onFocus` del input del chat hacer `setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: 'nearest' }), 300)` para que la conversación quede visible sobre el teclado.
- El historial (`div` de línea ~280, `overflow-y-auto`) debe tener `overscroll-behavior: contain` (`overscroll-contain` de Tailwind) para que el scroll del chat no arrastre el scroll de la página de fondo (scroll chaining — otro clásico que se siente "buggy" en mobile).
- El mismo `overscroll-contain` aplica a la tira de quick-actions (`overflow-x-auto`, línea ~265).

---

## 3. FABs y safe-area del iPhone (diagnosticado)

No hay NINGÚN uso de `env(safe-area-inset-*)` en el proyecto (verificado con grep). En iPhone con notch/home-indicator, los botones flotantes quedan pegados o debajo de la barra del sistema.

- `src/components/chat/AiAssistant.tsx:213` — FAB del chat: `fixed bottom-6 left-6`.
- `src/components/tour/HelpFab.tsx:23` — FAB de ayuda: `fixed bottom-6 right-6`.
- El panel del chat: `bottom-24`.

**Fix**: reemplazar por posicionamiento que sume el safe-area, p. ej. `style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}` (o clases arbitrarias Tailwind `bottom-[calc(1.5rem+env(safe-area-inset-bottom))]`). Requiere el `viewportFit: "cover"` de la sección 1c. Aplicar el mismo criterio a cualquier otro elemento `fixed bottom-*` que encuentres (buscar con `grep -rn "fixed bottom" src/`): CartDrawer, barras de acciones sticky del wizard/checkout si las hay, toasts de sonner (verificar su offset).

Además, en pantallas <380px verificar que los DOS FABs (chat abajo-izquierda, ayuda abajo-derecha) no tapen CTAs importantes (ej. el botón "Siguiente" del wizard de reserva, el botón de checkout). Si tapan: subir el z-index del contenido no alcanza — agregar `padding-bottom` extra (`pb-24`) al contenedor de la página en mobile para que el último contenido siempre pueda scrollearse por encima de los FABs.

---

## 4. Dialogs de admin más altos que el viewport (diagnosticado)

`src/components/ui/dialog.tsx` — `DialogContent` NO tiene `max-h` ni `overflow` (verificado). Los formularios largos de admin (barberos con horarios, servicios, sucursales, ChargeDialog) se desbordan en mobile y el contenido de abajo queda inaccesible.

**Fix en la base** (un solo lugar, beneficia a todos): agregar a `DialogContent` `max-h-[85dvh] overflow-y-auto` (u `overflow-hidden` + zona interna scrolleable si el footer debe quedar fijo — elegir lo más simple que funcione con los dialogs existentes). Verificar después los dialogs más largos: `/admin/barberos` (editor de horarios), `/admin/servicios`, `/admin/sucursales`, `ChargeDialog` (cobro con propina), y el `WelcomeModal` de onboarding.

---

## 5. BARRIDO — Overflow horizontal (paddings "rotos" y scroll lateral fantasma)

Metodología, ruta por ruta (lista completa en sección 8):
1. Con el dev server corriendo, en viewport 375×812 y también 320×568, correr en la consola del navegador:
   ```js
   document.scrollingElement.scrollWidth > window.innerWidth
   ```
   Si da `true` hay overflow horizontal. Para encontrar al culpable:
   ```js
   [...document.querySelectorAll('*')].filter(el => el.scrollWidth > document.documentElement.clientWidth)
     .map(el => ({ el, w: el.scrollWidth, cls: el.className }))
   ```
2. Culpables típicos a buscar también por grep: anchos fijos (`w-[160px]`, `w-[400px]`, `min-w-[...]`) sin `max-w-full`; grids con columnas fijas sin `sm:`; `whitespace-nowrap` en textos largos; negative margins; imágenes sin `max-w-full`; el stepper del wizard de reserva (6 pasos en fila).
3. Fix preferido: hacer el elemento fluido (`w-full max-w-[400px]`, `flex-wrap`, `grid-cols-1 sm:grid-cols-2`), no esconder el overflow. `overflow-x-hidden` en el body es el último recurso y hay que justificarlo en el reporte.

Casos ya sospechados (verificarlos primero):
- `/admin/dashboard`: los dos `SelectTrigger` con `w-[160px]` fijos en la toolbar — en 360px la toolbar debe hacer wrap (`flex-wrap gap-2`).
- Wizard `/reservar`: el stepper de 6 pasos (hoy rompe a 2 filas en desktop, revisar cómo colapsa en 375px — si es ilegible, versión mobile compacta: solo números + check, o "Paso 2 de 6" textual).
- Grid de horarios del paso 5 del wizard (botones de slots): que use `grid-cols-3`/`grid-cols-4` fluido y no fuerce ancho.
- Tablas admin: la base `table.tsx` ya envuelve con `overflow-x-auto` (verificado, OK) — pero confirmar que ningún contenedor padre lo anule y que en 375px la tabla scrollee horizontal en vez de romper la página.

## 6. BARRIDO — Touch targets y ergonomía táctil

- Mínimo 44×44px efectivos (con padding cuenta) para todo control interactivo en mobile. Revisar: botones `size="icon"` de `h-8 w-8` (header del chat, acciones de tablas admin), links del footer, iconos de cerrar de dialogs, quick-actions del chat (`h-8` — aceptable si el padding horizontal da área táctil, pero verificar que la tira scrollee bien).
- Donde un `h-8 w-8` sea parte del diseño, agregar área táctil con padding negativo-visual: `p-2 -m-2` o `before:absolute before:inset-[-8px]`.
- Inputs y botones principales de formularios: mínimo `h-10` (ya suele cumplirse). Los botones de acción del wizard ("Siguiente", "Atrás") y del checkout deben ser cómodos de alcanzar con el pulgar: verificar que en mobile estén a ancho generoso (`w-full sm:w-auto` donde aplique el patrón existente).
- Hover-only: todo lo que dependa de `hover` para verse (ej. la preview de servicios del wizard usa `onMouseEnter`) debe tener equivalente por tap/selección en mobile. Verificar que la selección (no solo hover) dispare el mismo feedback visual.

## 7. BARRIDO — Alturas de viewport y unidades dinámicas

`grep -rln "100vh\|h-screen\|min-h-screen" src/` da 12 archivos (page.tsx del home, layouts de auth/admin/barbero, reservar, checkout, lookbook, tienda, contacto, mi-cuenta, admin-login, mi-agenda). Para cada uno:
- `min-h-screen` como fondo de página está BIEN en general (no causa bugs), dejarlo.
- Lo que hay que cambiar es todo elemento **interactivo o con scroll interno** dimensionado con `vh`/`h-screen` que deba caber en el viewport visible: el panel del chat (sección 2), sidebars/drawers de admin en mobile (`admin/layout.tsx` — verificar que el sheet mobile use `h-dvh` o `h-full`), cualquier modal fullscreen. Criterio: si el usuario interactúa con el borde inferior del elemento, usa `dvh`; si es solo un fondo decorativo, `vh`/`min-h-screen` está bien.

## 8. RUTAS A VERIFICAR (checklist completa, en 375px y 320px, ambos temas)

Público: `/` (home completa: hero, servicios, before/after slider — probar el drag táctil del slider —, why-us, footer), `/reservar` (los 6 pasos completos del wizard, incluido calendario y grid de horarios), `/tienda` (+ abrir CartDrawer), `/checkout`, `/lookbook` (grid y filtros), `/contacto`, `/login`, `/register`, `/recuperar`, `/mi-cuenta`, `/admin-login` (con la tarjeta demo visible si `NEXT_PUBLIC_DEMO_MODE=true` está en `.env.local`).
Chat IA: abrir en `/` y conversar (mandar 2-3 mensajes, verificar quick-actions scrolleables, cards ricas de servicios/estilos dentro del chat, y que el foco del input NO haga zoom — DevTools no emula el zoom de iOS, así que la garantía es el font-size computado ≥16px: verificarlo con `getComputedStyle`).
Admin (con sesión admin o navegando el layout si no hay usuario aún): `/admin/dashboard`, `/admin/citas`, `/admin/clientes`, `/admin/servicios`, `/admin/productos`, `/admin/barberos` (abrir el dialog de horarios), `/admin/sucursales`, `/admin/caja`, `/admin/liquidaciones`, `/admin/mensajes`, `/admin/configuracion` — en mobile el sidebar debe colapsar a drawer y las tablas scrollear horizontal sin romper la página.
Barbero: `/barbero/mi-agenda`.
Tour: correr el tour de la home en 375px — la card debe quedar `fixed bottom` (ya implementado), el spotlight no debe generar overflow.

Para cada ruta reportar: overflow horizontal sí/no (y fix aplicado), font-size de campos enfocables, touch targets problemáticos, y cualquier padding/margen roto con su fix.

## 9. Detalles finales de calidad mobile

- `tap-highlight`: si al tocar botones aparece el flash gris de WebKit, agregar `-webkit-tap-highlight-color: transparent` en `globals.css` sobre `button, a` (solo si se observa el problema).
- Verificar que `sonner` (toasts) no quede debajo del teclado ni del safe-area al confirmar acciones en mobile.
- Imágenes: todas con `next/image` y `sizes` razonable en las que usan `fill` dentro de contenedores fluidos (evita servir 1200px a un card de 64px). No hace falta barrido exhaustivo: corregir las que toques.
- `scrollbar-none` en la tira de quick-actions del chat: verificar que la utilidad exista en `globals.css` (si no existe, la tira muestra scrollbar fea — agregarla).

## VERIFICACIÓN FINAL (obligatoria)

1. `npm run build` y `npm run lint` limpios.
2. Pasada completa de la checklist de la sección 8 en 375px; pasada rápida en 320px y 768px (tablet) de las rutas core (`/`, `/reservar`, `/tienda`, chat, `/admin/dashboard`).
3. Chequeo programático en cada ruta core: `document.scrollingElement.scrollWidth <= window.innerWidth` y `[...document.querySelectorAll('input,textarea,select')].every(el => parseFloat(getComputedStyle(el).fontSize) >= 16)` (en viewport <768px).
4. Screenshots de: chat abierto en 375px, wizard paso 2 y paso 5 en 375px, un dialog largo de admin scrolleando en 375px.

## REPORTE FINAL

Listar por sección: archivos tocados, qué se cambió y por qué, resultados del chequeo programático por ruta, screenshots, y cualquier problema encontrado que NO se arregló (con justificación y propuesta). Los desvíos del brief se anotan explícitamente.
