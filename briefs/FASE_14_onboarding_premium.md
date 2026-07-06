# FASE 14 — Onboarding premium + imágenes en los módulos · brief para Gemini

CONTEXTO: NB Barber (Next.js 16 + React 19 + Tailwind 4 + shadcn/ui + framer-motion + next-themes). Ya existe: tour data-driven (`src/components/tour/{TourOverlay,HelpFab}.tsx`, `src/lib/store/tour-store.ts`, `src/lib/tours-data.ts` con tours de cliente y admin) y dos asistentes por rol (`src/components/chat/AiAssistant.tsx`). GPT dejó nuevas imágenes en `public/images/{onboarding,tienda,modulos,empty}/` y `public/images/tienda/` (ver `GPT_imagenes_modulos_onboarding.md`). Objetivo de Mario: que el onboarding se sienta **premium y de alto nivel** y que los módulos se vean **más profesionales con imágenes coherentes con los textos**.

REGLAS: estética lujo minimalista (negro + dorado `#D4AF37`), español, framer-motion para animaciones sutiles y elegantes, **funcionar en tema claro y oscuro** (usar tokens `bg-background/bg-card/text-foreground`, no colores hardcodeados), responsive (probar 375px). Guard de features SIEMPRE después de todos los hooks. Verificar en navegador en ambos temas.

## TAREAS

### 1. Modal de bienvenida de primera visita (el "wow" inicial) — por rol
- Crear `src/components/onboarding/WelcomeModal.tsx`: modal elegante centrado (Dialog de shadcn o portal propio) que se muestra **solo la primera vez** (persistir en `localStorage`, claves distintas `nb-welcome-cliente` / `nb-welcome-admin`).
- Contenido CLIENTE: imagen `public/images/onboarding/welcome-cliente.webp`, título aspiracional ("Bienvenido a New Brothers — tu mejor versión empieza acá"), 3 bullets de valor (reservá en segundos, elegí tu barbero, tu estilo guardado), y 2 CTAs: "Hacer el tour" (dispara el tour de la ruta actual vía `useTourStore().startTour`) y "Explorar".
- Contenido ADMIN: imagen `welcome-admin.webp`, título ("Bienvenido a tu centro de mando"), 3 bullets (agenda y caja en vivo, clientes y fidelización, módulos configurables), CTAs "Recorrer el panel" / "Empezar".
- Montarlo: cliente en el layout `(main)`, admin en `src/app/admin/layout.tsx`. Animación de entrada suave (fade + scale con framer-motion), backdrop con blur. Botón "No volver a mostrar".

### 2. Elevar las tarjetas del tour (TourOverlay) a nivel premium
En `src/components/tour/TourOverlay.tsx` y el tipo `TourStep` (`tour-store.ts`):
- Agregar campo opcional `icon` (lucide) y/o `image` por paso; mostrarlo en la tarjeta.
- Barra de **progreso** (paso N/total) elegante en dorado; transiciones más suaves entre pasos.
- Paso final "celebratorio": mensaje de cierre + CTA contextual ("Reservá tu primer turno" en cliente / "Ir al dashboard" en admin).
- Micro-detalle: brillo dorado sutil en el spotlight (ya existe) + easing más premium. Mantener accesibilidad (foco, Esc para cerrar).
Actualizar `src/lib/tours-data.ts` para poblar `icon` en los pasos existentes (sin romper los `target` actuales).

### 3. Imágenes coherentes en los módulos (profesionalizar)
- **Tienda** (`src/app/(main)/tienda/page.tsx`): banner por categoría usando `public/images/tienda/cat-*.webp` (mapear categoría→imagen), como encabezado sutil al filtrar o como tira de categorías con imagen. `next/image`, `alt` descriptivo.
- **/admin/configuracion** (`src/app/admin/configuracion/page.tsx`): cada tarjeta de módulo muestra su miniatura `public/images/modulos/<modulo>.webp` (mapa key→imagen) junto al ícono/título, para que se entienda visualmente qué activa cada toggle.
- **Empty states**: en listas vacías (citas, clientes, productos) usar `public/images/empty/*.webp` en vez del ícono plano, con copy premium.
Si alguna imagen no existe aún, degradar con gracia (mostrar solo el ícono/título; no romper).

## CRITERIOS DE ACEPTACIÓN
- Primera visita (cliente y admin) muestra el modal premium una sola vez; "Hacer el tour" arranca el tour; se puede cerrar y no reaparece.
- Tarjetas del tour con progreso, ícono/imagen y cierre con CTA; se ve fluido y elegante.
- Tienda con banners de categoría, /admin/configuracion con miniatura por módulo, empty states ilustrados — todo coherente con los textos.
- Funciona en tema claro y oscuro, y en mobile (375px). `npm run build` verde. Verificado en navegador. Reportar archivos tocados.
