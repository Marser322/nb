# FASE 0 — Remates de la pasada actual

> Leer primero `briefs/README.md` (reglas transversales). Esta fase es independiente del CRM y puede ejecutarse en paralelo con la Fase 1.

## Contexto

La integración de imágenes propias ya está completa (0 referencias a Unsplash, 48 assets locales) y la deuda A1–A4 del CLAUDE.md ya está resuelta en el código. Quedan remates de calidad: peso de imágenes, SEO faltante, persistencia del chat, password reset y skeletons.

## Tareas

### 1. Optimizar imágenes (~80 MB → objetivo < 12 MB total)

Los PNG de `public/images/` (hero, branches, features, barbers, before/after), `public/lookbook/` y `public/products/` pesan 2–3 MB cada uno. Convertirlos a calidad web:

- Objetivo: **< 400 KB por imagen** (hero puede llegar a 500 KB), manteniendo dimensiones razonables (máx 1920px de ancho para hero, 1200px para el resto).
- Herramienta sugerida en macOS: `sips` (nativo) o `npx sharp-cli`. Ejemplo con sips: redimensionar + reexportar. Si se convierte a `.webp` o `.jpg`, **actualizar todas las referencias** en `src/lib/static-data.ts`, `src/lib/constants.ts` y componentes (`grep -rn "\.png" src/` para encontrarlas). Mantener `.png` recomprimido es aceptable si cumple el objetivo de peso.
- No tocar `og-image.png`, `logo.png`, `icon.png` salvo que superen 400 KB (hoy ~300 KB, están bien).
- Verificar visualmente en `npm run dev` que ninguna imagen quedó degradada.

### 2. SEO restante

- Crear `src/app/robots.ts` (App Router nativo): permitir todo salvo `/admin`, `/admin-login`, `/barbero`, `/api`; referenciar el sitemap.
- Crear `src/app/sitemap.ts`: rutas públicas (`/`, `/reservar`, `/tienda`, `/lookbook`, `/contacto`, `/login`, `/register`). Usar la misma constante de URL base que usa `src/app/layout.tsx` para el JSON-LD (buscar `SITE_URL`).
- Metadata faltante: agregar `export const metadata` para **checkout** y **mi-cuenta**. Como esas páginas son client components, crear `src/app/(main)/checkout/layout.tsx` y `src/app/(main)/mi-cuenta/layout.tsx` de segmento (mismo patrón que `src/app/(main)/reservar/layout.tsx`).

### 3. Chat persistente en sessionStorage

En `src/components/chat/AiAssistant.tsx`:
- Al montar, cargar mensajes desde `sessionStorage.getItem('nb-chat-messages')` (con try/catch por JSON corrupto); si no hay, mantener el mensaje de bienvenida actual.
- En un `useEffect` con dependencia `[messages]`, guardar el array serializado.
- Cuidado con SSR: acceder a `sessionStorage` solo en efectos, nunca en el initializer directo del `useState` sin guard.

### 4. Password reset

- Página `src/app/(auth)/recuperar/page.tsx`: formulario de email (react-hook-form + zod, patrón de login), llama `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL + '/actualizar-password' })`, toast de confirmación neutro ("Si el email existe, te enviamos un enlace").
- Página `src/app/(auth)/actualizar-password/page.tsx`: formulario de nueva contraseña (+confirmación), llama `supabase.auth.updateUser({ password })` y redirige a `/login` con toast.
- Link "¿Olvidaste tu contraseña?" en `src/app/(auth)/login/page.tsx`.
- Agregar `/actualizar-password` a las rutas que el middleware no bloquee (revisar `src/lib/supabase/middleware.ts` — la sesión de recovery de Supabase cuenta como user).

### 5. Skeletons de carga

- `src/app/(main)/reservar/page.tsx`: skeletons `animate-pulse` mientras cargan servicios, barberos y slots (patrón de `src/app/barbero/mi-agenda/page.tsx:192-196`). Ya existe un texto "Cargando servicios..." — reemplazarlo por skeletons de cards.
- `src/app/(main)/checkout/page.tsx`: skeleton del resumen del carrito mientras carga.

### 6. Actualizar CLAUDE.md

En la sección "Roadmap y deuda conocida":
- Marcar A1–A4 como **resueltos** (con referencia a migraciones 005/006).
- Marcar B (imágenes, OG, contacto, metadata) como resuelto; dejar solo lo que esta fase no cubra.
- Registrar el plan CRM activo: "Mini-CRM en curso, ver `briefs/`".

## Criterios de aceptación

- [ ] `du -sh public/` < 15 MB; ninguna imagen visiblemente degradada en dev.
- [ ] `curl localhost:3000/robots.txt` y `/sitemap.xml` responden correctamente en dev.
- [ ] Checkout y mi-cuenta tienen `<title>` propio (ver en el navegador).
- [ ] Cerrar y reabrir el chat en la misma pestaña conserva la conversación; nueva pestaña arranca limpia.
- [ ] Flujo completo de reset de contraseña funciona contra Supabase.
- [ ] `npm run build` y `npm run lint` pasan.
