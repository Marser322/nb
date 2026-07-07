# FASE 21 — Fix del spotlight del tour: el elemento enfocado debe quedar NÍTIDO al instante · brief para Gemini/Sonnet

> Leer primero `briefs/README.md` (reglas transversales). **BUG A CORREGIR**: en el tour guiado, el recuadro que el paso está describiendo queda oscurecido/desenfocado (bajo el velo) en vez de quedar claro y resaltado, y el spotlight se ve "bugueado" (planea/tiembla). El objetivo de esta fase: **el elemento del paso actual queda 100% nítido y encuadrado con exactitud desde el primer frame en que se muestra el paso**, sin lag ni jitter.

## Archivo único a tocar
`src/components/tour/TourOverlay.tsx` (portal del tour). No hace falta tocar `tour-store.ts`, `tours-data.ts` ni `HelpFab.tsx`.

## Diagnóstico (verificado en el código)
El spotlight es un `motion.div` sobre el target con un `box-shadow` de spread gigante (`0 0 0 9999px …`) que oscurece TODO menos el rectángulo del recorte (técnica de "agujero real"). El interior del recorte queda transparente → el elemento se ve nítido. La técnica en sí es correcta; el problema son **dos animaciones que tapan/atrasan el recorte**:

1. **`layoutId="spotlight"` + resorte lento** (`TourOverlay.tsx:132-134`): al cambiar de paso, framer-motion hace una animación de layout (FLIP) que **desplaza el agujero lentamente** (~1s con `stiffness:160, damping:26, mass:0.9`) desde el elemento anterior hasta el nuevo. Durante ese glide, el elemento que el paso describe **está fuera del recorte → bajo el `box-shadow` oscuro → se ve desenfocado**. Además, el efecto que sigue al scroll suave reposiciona `targetRect` cada 16ms durante 900ms (`TourOverlay.tsx:76-83`); el resorte de layout pelea contra esas actualizaciones por frame → **jitter**. Esta es la causa principal del "recuadro desenfocado / bugueado".
2. **`transition-colors duration-500` en el velo padre** (`TourOverlay.tsx:122`): al pasar de un paso centrado (`target: 'body'`, con velo `bg-background/70`) a un paso con target (padre `bg-transparent`), el fondo del padre se desvanece a transparente en 500ms. Durante ese medio segundo, el **velo de pantalla completa todavía cubre el target** → dimmeo extra del elemento recién enfocado.

## Regla de oro
El elemento del paso actual **nunca** debe quedar cubierto por el velo del padre ni por un agujero mal ubicado — ni siquiera durante una transición. Exactitud del recorte > glide bonito. El recorte debe seguir al elemento con precisión también durante el scroll suave (el loop de 900ms ya lo actualiza; sin el resorte de layout, el agujero lo sigue en lockstep).

---

## CAMBIO 1 — Sacar la animación de layout del spotlight (posición directa y exacta)
En `TourOverlay.tsx`, el bloque `{targetRect && ( <motion.div layoutId="spotlight" … /> )}` (líneas ~130-147).

- **Eliminar** `layoutId="spotlight"` y el `transition={{ type: "spring", … }}`. Sin ellos, `top/left/width/height` se aplican directo desde `targetRect` en cada render → el agujero queda **exactamente** sobre el elemento de inmediato (y en cada frame del scroll-follow).
- Mantener el mismo `box-shadow`, `border`, `borderRadius`, padding de 10px y `zIndex`.
- Para una aparición prolija sin desplazar el recorte, usar un fade de opacidad corto **por paso** (respetando reduced-motion). `currentStepIndex` y `prefersReducedMotion` ya están en scope en `TourOverlay`.

Resultado esperado del bloque:
```tsx
{targetRect && (
    <motion.div
        key={currentStepIndex}
        initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: 'easeOut' }}
        style={{
            position: 'absolute',
            top: targetRect.top - 10,
            left: targetRect.left - 10,
            width: targetRect.width + 20,
            height: targetRect.height + 20,
            borderRadius: '16px',
            boxShadow: '0 0 0 9999px color-mix(in oklab, var(--background) 85%, transparent), 0 0 44px color-mix(in oklab, var(--primary) 45%, transparent), inset 0 0 0 1px color-mix(in oklab, var(--primary) 30%, transparent)',
            border: '1px solid color-mix(in oklab, var(--primary) 62%, transparent)',
            zIndex: 10,
        }}
    />
)}
```
> El `key={currentStepIndex}` re-monta el div solo al cambiar de paso (dentro de un mismo paso el índice no cambia, así que el scroll-follow NO re-monta cada frame). El fade toca solo la opacidad, nunca la posición.

## CAMBIO 2 — Que el velo del padre no tiña el target durante la transición
En `TourOverlay.tsx:122`, quitar `transition-colors duration-500` del `className` del `motion.div` padre. Debe quedar algo como:
```tsx
className={cn(
    "pointer-events-auto absolute inset-0",
    targetRect ? "bg-transparent" : "bg-background/70 backdrop-blur-[3px]"
)}
```
Así, apenas hay target el padre es transparente al instante (sin desvanecido de 500ms encima del elemento). El fade-in general del overlay al abrir (`initial/animate opacity` del padre, líneas 117-119) se conserva. Los pasos centrados (`target: 'body'`) siguen mostrando velo + blur completos (correcto: ahí no hay elemento que resaltar).

---

## Reglas del proyecto (respetar)
- Es un componente cliente: **cualquier early-return va DESPUÉS de todos los hooks** (ya está bien: `if (!isOpen || !currentStep) return null;` en la línea 110, tras los `useEffect`). No introducir returns antes de los hooks.
- Colores solo con **tokens de tema** (ya usa `var(--background)` / `var(--primary)` vía `color-mix`) — no hardcodear. Probar tema **claro y oscuro**.
- Respetar `prefersReducedMotion` (ya disponible en el componente).
- Mobile-first: verificar en 375px y en desktop.
- No cambiar la lógica de salto de pasos con target invisible, ni el seguimiento por scroll/resize, ni el `finishTour`/CTA `href`.
- Si git falla con "non-monotonic index": `find .git -name '._*' -delete`.

## Verificación end-to-end (documentar en el reporte)
1. `npm run dev`. Abrir `/` y disparar el tour con el FAB de ayuda (abajo a la derecha).
2. Avanzar con **Siguiente/Anterior** por todos los pasos. En cada paso, el elemento referenciado (nav, hero-cta, franja demo, etc.) debe quedar **claro y encuadrado desde el primer instante**, sin quedar oscuro mientras "llega" el recuadro y sin temblor.
3. Probar un salto entre elementos lejanos (que obligan a scroll): el agujero debe seguir al elemento y terminar exacto, sin dejarlo bajo el velo.
4. Repetir en el tour del panel admin (`/admin/dashboard`, FAB de ayuda) que tiene varios pasos.
5. Probar en **tema claro y oscuro**, en **375px y desktop**, y con **reduce-motion** activo (no debe romperse; sin animación pero igual de nítido).
6. `npm run build` y `npm run lint` limpios (no sumar warnings; hay ~44 preexistentes).

## Criterios de aceptación
- Al mostrarse un paso, su elemento queda **nítido y exactamente encuadrado de inmediato** (sin ~1s de glide que lo deje oscuro).
- Sin jitter/tembleque del recorte durante el scroll suave ni entre pasos.
- Ningún velo/blur de pantalla completa cubre el elemento enfocado en ningún momento.
- Los pasos centrados (`body`) siguen con velo + blur; el resto del tour intacto.
- Claro/oscuro, mobile/desktop y reduce-motion OK. Build y lint limpios.

Commit sugerido: `fix(tour): el elemento del paso queda nítido al instante (sin glide del spotlight)`
