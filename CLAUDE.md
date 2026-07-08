# NB Barber (New Brothers) — Guía del proyecto

Plataforma web para NB Barber, barbería en Uruguay: reservas online, tienda de productos y fidelización de clientes. Todo el contenido de cara al usuario está en **español**.

## Comandos

```bash
npm run dev     # servidor de desarrollo (localhost:3000)
npm run build   # build de producción (verificar siempre antes de commitear features)
npm run lint    # eslint
```

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (estricto, alias `@/*` → `./src/*`)
- **Tailwind CSS 4** + **shadcn/ui** (Radix) + **framer-motion** + **lucide-react**
- **Supabase**: Auth, PostgreSQL con RLS, storage. Cliente browser en `src/lib/supabase/client.ts`, middleware de sesión en `src/middleware.ts`
- **Zustand** para el carrito (`src/stores/cartStore.ts`, con persistencia)
- **react-hook-form + zod** para formularios; **sonner** para toasts; **date-fns** con locale `es`

## Estructura

- `src/app/page.tsx` — home (hero, servicios, before/after, why-choose-us)
- `src/app/(main)/` — páginas públicas: `reservar` (wizard 6 pasos, núcleo del negocio), `tienda`, `lookbook`, `checkout`
- `src/app/(auth)/` — login/register de clientes
- `src/app/admin/` — panel admin: dashboard, citas, servicios, productos, barberos, sucursales, caja
- `src/app/barbero/mi-agenda` — portal del barbero
- `src/app/api/chat/route.ts` — asistente IA (fallback: Gemini → OpenAI → motor de reglas local; keys via `GEMINI_API_KEY`/`OPENAI_API_KEY`)
- `src/components/` — `ui/` (shadcn), `chat/AiAssistant.tsx`, `shop/CartDrawer.tsx`, `layout/`, `home/`, `tour/`
- `src/lib/constants.ts` — config del negocio, labels de estados, rutas
- `src/lib/utils.ts` — `formatPrice` (UYU), `generateTimeSlots`, `calculateEndTime`, `canCancelAppointment` (ventana 2 h)
- `supabase/migrations/999_FULL_SETUP.sql` — script maestro para DB fresca 001→018, excepto 017; espejo en `src/lib/supabase_schema.sql`

## Reglas de negocio

- Duración variable de servicios: el calendario debe bloquear slots según `duration_minutes` (corte 30 min = 1 slot, corte+barba 60 min = 2 slots).
- Cancelación permitida hasta **2 horas antes** de la cita (`canCancelAppointment`).
- Roles: `cliente`, `barbero`, `admin` (enum `user_role` en profiles).
- Fidelización: objetivo "lo mismo de la vez pasada" usando `haircut_history`.
- Moneda: pesos uruguayos (UYU).

## Estilo visual

"Lujo minimalista": tema **híbrido claro/oscuro** (por defecto oscuro branded gold/black de lujo minimalista, con opción a tema claro premium boutique en tonos marfil, crema y acentos dorados). Utilidades propias: `.glass-card`, `.text-glow`, `.bg-noise` que reaccionan de forma nativa al tema activo. Animaciones con framer-motion (entrance, `whileInView`, hover). Mantener esta estética en todo lo nuevo.

## Convenciones

- Usar `next/image` siempre; los assets van en `public/` (lookbook/, products/, images/).
- Los estados de citas/órdenes y sus labels/colores viven en `src/lib/constants.ts` — no duplicar strings.
- Integración lookbook→reserva vía query params (`/reservar?styleId=X&serviceId=Y`); reusar ese patrón para pre-cargar el wizard.
- Skills de agentes vendorizadas en `.agents/skills/` (lock: `skills-lock.json`).
- Loop de pulido vía `/polish` (skill en `.claude/skills/polish/`): cola, estados e historial en `briefs/POLISH_BACKLOG.md`; los briefs de polish siguen la numeración `FASE_NN` normal.
- El repo vive en un disco externo: si git falla con "non-monotonic index", borrar los AppleDouble con `find .git -name '._*' -delete`.

## Roadmap y deuda conocida

Plan activo de mejoras (auditoría 2026-07): ver historial.

- **A1-A4** Resueltos (prevención de sobre-reservas, descuento de stock en checkout, filtro de agenda de barbero, RLS endurecido via migraciones 005 y 006).
- **B** Resuelto (reemplazo de imágenes por assets propios optimizados < 400KB, página contacto, metadatos, sitemap y robots.ts).
- **C** Resuelto (persistencia del chat en sessionStorage, skeletons en reserva/checkout, flujos de password reset con /recuperar y /actualizar-password).

### CRM y Próximas Fases

- **TODAS las fases (0-10) completadas en código** (auditadas 2026-07-05): mini-CRM, agendado sólido (RPCs `book_appointment`/`cancel_appointment`, anti-solapes), dashboard CRM, disponibilidad en vivo (`get_availability` como fuente única del wizard, `working_hours`, `schedule_blocks`, editor en admin), contabilidad (compensación por barbero, `ChargeDialog` con propina, `/admin/liquidaciones`) y feature flags (`src/lib/features.ts` + `/admin/configuracion`).
- **Drift resuelto**: `branches.is_active` es el nombre vigente (renombrado por la 011); CHECKs de `cash_movements` normalizados a códigos EN con labels ES en `constants.ts` (012); `cash_register` legacy migrada/eliminada (012).
- **FASE 15 (demo polish, 2026-07-06)** completada en código: fix de imágenes de servicios (migración 017, seeds .png→.jpg), modo demo (`NEXT_PUBLIC_DEMO_MODE` + quick-login admin en `/admin-login` y `/login`, link "Acceso staff" en footer), og-image generado por código (`src/app/opengraph-image.tsx` + `public/logo-transparent.png` vía `scripts/make-logo-transparent.mjs`), spotlight del tour con agujero real.
- **Drift resuelto**: `999_FULL_SETUP.sql` está sincronizado hasta la 018 (incluye 015 flags, 016 storage y 018 hardening CRM; la 017 sigue siendo corrección operativa para DBs existentes). En DB existente correr 011→018 en orden si aún no se aplicaron.
- **Pendiente (operativo, no código)**: ejecutar la Fase 6 según `DEPLOY.md` (proyecto Supabase sa-east-1, cron de backup en el VPS, deploy en Vercel/VPS); correr la migración 017 en la DB de desarrollo; crear el usuario demo `demo@nbbarber.uy` y promoverlo a admin (pasos en `briefs/FASE_15_demo_polish.md`, bloque B); setear las 3 vars `NEXT_PUBLIC_DEMO_*` en Vercel.
- **Fases futuras**: Integración Mercado Pago, recordatorios automáticos por WhatsApp/Email (reminders_config / communication_logs).
