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

Plan activo de mejoras (auditoría 2026-07): ver historial. Pendientes clave:

- **A1** Prevención de sobre-reservas en `reservar` (validar solapes + duración al generar slots)
- **A2** Checkout: poblar `order_items` y descontar stock (hoy la orden se crea sin ítems)
- **A3** `barbero/mi-agenda`: filtrar por barbero autenticado (hoy muestra todas las citas)
- **A4** Endurecer RLS para producción (hoy es permisivo, solo apto para desarrollo)
- **B** Reemplazar ~23 imágenes de Unsplash por assets propios en `public/images/{hero,branches,features,barbers}/`; OG image 1200×630; página `contacto`; metadata por página + JSON-LD
- **C** Persistencia del chat en sessionStorage; página `mi-cuenta` con "lo mismo de la vez pasada"; password reset; skeletons

Fases futuras (no empezar sin pedido explícito): Mercado Pago Checkout Pro, recordatorios WhatsApp/email (schema `reminders_config`/`communication_logs` ya existe, falta Edge Function + cron), OAuth Google.
