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
- `supabase/migrations/001_initial_schema.sql` — schema completo (espejo en `src/lib/supabase_schema.sql`)

## Reglas de negocio

- Duración variable de servicios: el calendario debe bloquear slots según `duration_minutes` (corte 30 min = 1 slot, corte+barba 60 min = 2 slots).
- Cancelación permitida hasta **2 horas antes** de la cita (`canCancelAppointment`).
- Roles: `cliente`, `barbero`, `admin` (enum `user_role` en profiles).
- Fidelización: objetivo "lo mismo de la vez pasada" usando `haircut_history`.
- Moneda: pesos uruguayos (UYU).

## Estilo visual

"Lujo minimalista": tema **oscuro únicamente** (html con `className="dark"`), negro profundo con acentos dorados/ámbar (`#D4AF37`, primary en OKLCH en `globals.css`). Utilidades propias: `.glass-card`, `.text-glow`, `.bg-noise`. Animaciones con framer-motion (entrance, `whileInView`, hover). Mantener esta estética en todo lo nuevo.

## Convenciones

- Usar `next/image` siempre; los assets van en `public/` (lookbook/, products/, images/).
- Los estados de citas/órdenes y sus labels/colores viven en `src/lib/constants.ts` — no duplicar strings.
- Integración lookbook→reserva vía query params (`/reservar?styleId=X&serviceId=Y`); reusar ese patrón para pre-cargar el wizard.
- Skills de agentes vendorizadas en `.agents/skills/` (lock: `skills-lock.json`).
- El repo vive en un disco externo: si git falla con "non-monotonic index", borrar los AppleDouble con `find .git -name '._*' -delete`.

## Roadmap y deuda conocida

Plan activo de mejoras (auditoría 2026-07): ver historial.

- **A1-A4** Resueltos (prevención de sobre-reservas, descuento de stock en checkout, filtro de agenda de barbero, RLS endurecido via migraciones 005 y 006).
- **B** Resuelto (reemplazo de imágenes por assets propios optimizados < 400KB, página contacto, metadatos, sitemap y robots.ts).
- **C** Resuelto (persistencia del chat en sessionStorage, skeletons en reserva/checkout, flujos de password reset con /recuperar y /actualizar-password).

### CRM y Próximas Fases

- **TODAS las fases (0-10) completadas en código** (auditadas 2026-07-05): mini-CRM, agendado sólido (RPCs `book_appointment`/`cancel_appointment`, anti-solapes), dashboard CRM, disponibilidad en vivo (`get_availability` como fuente única del wizard, `working_hours`, `schedule_blocks`, editor en admin), contabilidad (compensación por barbero, `ChargeDialog` con propina, `/admin/liquidaciones`) y feature flags (`src/lib/features.ts` + `/admin/configuracion`).
- **Drift resuelto**: `branches.is_active` es el nombre vigente (renombrado por la 011); CHECKs de `cash_movements` normalizados a códigos EN con labels ES en `constants.ts` (012); `cash_register` legacy migrada/eliminada (012).
- **Pendiente (operativo, no código)**: ejecutar la Fase 6 según `DEPLOY.md` — crear proyecto Supabase de producción (sa-east-1), pegar `999_FULL_SETUP.sql` (equivale a 001→013 en DB fresca; en DB existente correr 011→013 en orden), cron de backup en el VPS, deploy en Vercel/VPS.
- **Fases futuras**: Integración Mercado Pago, recordatorios automáticos por WhatsApp/Email (reminders_config / communication_logs).
