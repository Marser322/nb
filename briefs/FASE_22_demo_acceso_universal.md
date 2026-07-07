# FASE 22 — Acceso al admin demo visible en todos lados · brief para Gemini/Sonnet

> Leer primero `briefs/README.md` (reglas transversales). **OBJETIVO**: que cualquier visitante de la demo descubra el acceso "Entrar como Admin demo" desde cualquier punto de entrada: hoy existe en home, header, footer, `/login`, `/admin-login` y el tour, pero **falta en `/register`, en el botón de ayuda flotante (HelpFab) y en el asistente IA**. Esta fase cierra esos tres huecos y de paso elimina la duplicación del login demo.

## Estado actual — YA HECHO, NO REHACER

Verificado en `main`:

- `/admin-login` (`src/app/admin-login/page.tsx`) y `/login` (`src/app/(auth)/login/page.tsx`, líneas 78-117 y 196-207) ya tienen el flujo demo completo: `signInWithPassword` con `NEXT_PUBLIC_DEMO_ADMIN_EMAIL`/`NEXT_PUBLIC_DEMO_ADMIN_PASSWORD`, verificación de `profile.role === 'admin'` (con `signOut` si no lo es) y redirect a `ROUTES.ADMIN_DASHBOARD`.
- Home (CTA destacado), Header (acceso staff), Footer ("Acceso staff" + 5 clicks ocultos) y paso del tour al panel — commits `8210a4c`, `6f5c59e`, `b09ae5b`. **NO tocar.**
- Seed del usuario demo: `scripts/seed-demo-admin.mjs` (FASE 20). No es parte de esta fase.

Gate global: **todo lo nuevo se renderiza solo si `process.env.NEXT_PUBLIC_DEMO_MODE === 'true'`** (leerlo a nivel módulo como hacen `login/page.tsx:15` y `Header.tsx:34`).

## REGLA CRÍTICA DE HOOKS (obligatoria)

En componentes cliente, **todo early-return (`if (...) return null`) va DESPUÉS de declarar todos los hooks** (`useState`, `usePathname`, stores de Zustand, etc.). El build NO detecta la violación; crashea en runtime con "Rendered fewer hooks than expected". `HelpFab.tsx` ya sigue este patrón (hooks en líneas 11-12, return en 17) — mantenerlo al modificarlo.

---

## TAREA 1 — Extraer el login demo a un hook compartido

Crear `src/hooks/useDemoAdminLogin.ts` (client). Exporta:

```ts
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
export function useDemoAdminLogin(): { loginAsDemoAdmin: () => Promise<void>; isDemoLoading: boolean }
```

- Mover ahí, tal cual, la lógica de `handleDemoLogin` de `src/app/(auth)/login/page.tsx:78-117` (toasts incluidos, mismos textos en español).
- Refactorizar `/login` y `/admin-login` para consumir el hook (sin cambio visual ni de comportamiento; ojo con el estado `isLoading` local de cada página: pueden derivarlo de `isDemoLoading` o combinarlo).
- Commit: `refactor(demo): extrae login de admin demo a hook compartido`.

## TAREA 2 — CTA demo en /register

En `src/app/(auth)/register/page.tsx`, dentro del `CardFooter`, replicar el botón ghost de `/login` (líneas 196-207): texto **"¿Querés ver el panel de administración? Entrá como admin demo"**, `onClick={loginAsDemoAdmin}`, deshabilitado mientras carga, visible solo con `isDemoMode`. Mismo estilo (`variant="ghost" size="sm"`, `text-muted-foreground hover:text-primary`).

Commit: `feat(demo): agrega acceso admin demo en registro`.

## TAREA 3 — HelpFab → menú de ayuda con acceso demo

Hoy `src/components/tour/HelpFab.tsx` solo lanza el tour y **desaparece en páginas sin tour** (`APP_TOURS` en `src/lib/tours-data.ts` cubre `/`, `/reservar`, `/tienda`, `/lookbook`, `/mi-cuenta` y las de admin). Cambiarlo así:

1. **Visibilidad**: en modo demo, mostrarlo en TODAS las páginas públicas (no solo las con tour). Fuera de modo demo, comportamiento actual (solo páginas con tour). Nunca mostrarlo si `isOpen` (tour activo) ni en rutas `/admin*` ni `/barbero*` (ahí ya hay UI propia).
2. **Interacción**: al click abre un mini-menú (usar `DropdownMenu` o `Popover` de shadcn ya vendorizados en `src/components/ui/`, estética `.glass-card`/tokens) con hasta 3 items:
   - **"Ver tour de esta página"** — solo si `APP_TOURS[pathname]` existe; llama `startTour` como hoy.
   - **"Entrar como Admin demo"** — solo con `isDemoMode`; usa `loginAsDemoAdmin` del hook de la Tarea 1. Si ya hay sesión admin, el flujo del hook funciona igual (re-login idempotente).
   - **"Contacto"** — link a `/contacto`.
3. Mantener el pulse hint y `aria-label`. Cuidado con la colisión con el FAB del chat (está en bottom-left; HelpFab queda bottom-right, no mover).
4. Respetar la REGLA DE HOOKS: los nuevos `useState`/hooks van antes de cualquier return condicional.

Commit: `feat(demo): convierte HelpFab en menú de ayuda con acceso admin demo`.

## TAREA 4 — El asistente IA conoce el demo

En `src/app/api/chat/route.ts` (motor de reglas local y system prompt que se manda a Gemini/OpenAI), modo **cliente**: agregar conocimiento de que existe una demo del panel de administración. Si el usuario pregunta por "panel", "admin", "gestión", "demo" o "CRM", responder (español, voseo) que puede entrar con el botón "Entrar como Admin demo" en `/admin-login` o desde el botón de ayuda. **Solo incluir esta regla/prompt cuando `NEXT_PUBLIC_DEMO_MODE === 'true'`** (en el route handler server-side leer `process.env.NEXT_PUBLIC_DEMO_MODE` directo). No revelar la contraseña en la respuesta del chat.

Commit: `feat(demo): el asistente sugiere el acceso admin demo`.

## Verificación (antes de cerrar la fase)

1. `npm run build` y `npm run lint` pasan.
2. Con `NEXT_PUBLIC_DEMO_MODE=true` en `.env.local`: `/register` muestra el CTA y loguea al admin demo; el HelpFab aparece en `/contacto` (página sin tour) y su menú tiene los 3 items; en `/reservar` el item de tour aparece y funciona.
3. Con la var en `false` o ausente: `/register` sin CTA, HelpFab solo en páginas con tour y sin item demo, chat sin mención al demo.
4. Chequear en tema claro y oscuro (tokens, nada hardcodeado) y en viewport móvil (~380px): el menú no tapa el FAB del chat.
