# FASE 11 — Modo claro/oscuro (toggle de tema) · brief para Gemini

CONTEXTO: NB Barber (Next.js 16 + React 19 + Tailwind 4 + shadcn/ui). Hoy la app es **dark-only**: `src/app/layout.tsx` fija `<html className="dark">`. `next-themes` YA está instalado (lo usa `src/components/ui/sonner.tsx`). `src/app/globals.css` YA define tokens `:root` (claro) y `.dark` (oscuro branded gold/black), con `@custom-variant dark (&:is(.dark *))`. Falta: el proveedor de tema, el botón toggle, una paleta clara con identidad, y limpiar colores dark hardcodeados.

IMPORTANTE: la marca es "lujo minimalista oscuro". **El default sigue siendo oscuro**; el modo claro es una alternativa elegante, no el principal. Actualizar la nota de estética en CLAUDE.md al final.

## TAREAS

### 1. ThemeProvider (next-themes)
- Crear `src/components/theme-provider.tsx` que reexporte el `ThemeProvider` de `next-themes` (client component).
- En `src/app/layout.tsx`: quitar el `className="dark"` fijo del `<html>`, agregar `suppressHydrationWarning` al `<html>`, y envolver `{children}` (y los overlays) con `<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>`.

### 2. Botón toggle (sol/luna)
- Crear `src/components/theme-toggle.tsx`: botón `variant="ghost" size="icon"` con ícono `Sun`/`Moon` (lucide) según el tema, usando `useTheme()` de next-themes. Prevenir hydration mismatch con un estado `mounted` (renderizar un placeholder hasta montar).
- Montarlo en: (a) `src/components/layout/Header.tsx` (junto al carrito/usuario, desktop y en el Sheet mobile) y (b) el header/topbar del layout admin `src/app/admin/layout.tsx`.

### 3. Paleta clara con identidad (no gris shadcn plano)
En `globals.css`, redefinir los tokens de `:root` para un **claro cálido premium** en vez del gris por defecto. Sugerencia OKLCH (ajustable): fondo marfil/crema `oklch(0.97 0.008 85)`, texto carbón `oklch(0.20 0 0)`, `--card` blanco cálido, y **mantener el dorado como `--primary`** (`oklch(0.68 0.12 85)` para buen contraste sobre claro). Bordes suaves cálidos. Objetivo: que en claro se sienta "boutique elegante", coherente con el dorado.

### 4. Limpiar colores dark hardcodeados (lo más laborioso)
Hay ~30 archivos en `src/app` y `src/components` con clases fijas que NO responden al tema: `bg-zinc-950`, `bg-black`, `bg-zinc-900`, `text-white`, etc. Reemplazarlas por tokens de tema para que ambos modos funcionen:
- `bg-zinc-950` / `bg-black` → `bg-background`
- `bg-zinc-900` / `bg-zinc-900/90` → `bg-card` (o `bg-card/90`)
- `text-white` → `text-foreground`
- `text-zinc-300/400` → `text-muted-foreground`
- `border-white/10` → `border-border`
Detectar con: `grep -rlE "bg-zinc-950|bg-black|bg-zinc-900|text-white|border-white/" src/app src/components --include="*.tsx"`. Priorizar: guards de loader (reservar, tienda, mi-agenda), `AiAssistant.tsx`, `TourOverlay.tsx`, `Header`/`Footer`, layouts. Donde un color oscuro sea intencional en ambos temas (ej. FAB dorado), dejarlo.

## CRITERIOS DE ACEPTACIÓN
- El toggle cambia el tema al instante y **persiste** (next-themes usa localStorage) sin flash al recargar.
- En claro: todo legible, sin bloques negros "pegados", dorado preservado como acento; en oscuro: idéntico a hoy.
- Verificar en el navegador (preview) home, /reservar, /tienda, /admin/dashboard y el chat en ambos temas — NO alcanza con `npm run build`.
- Reportar archivos tocados. Actualizar la sección "Estilo visual" de CLAUDE.md (dark = default, claro disponible).
