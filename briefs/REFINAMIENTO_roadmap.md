# Roadmap de Refinamiento — NB Barber (post-CRM)

> Estado a 2026-07-06. Todas las fases 0-10 + los briefs de flujos rotos + modularidad + asistentes + correcciones están **hechos y auditados**. Este documento es el backlog vivo de pulido y nuevas funciones. Flujo: **Opus planifica → Gemini ejecuta código → GPT genera imágenes** (ver [[multi-model-workflow]]).

## Estado de auditoría (lo ya cerrado)
- ✅ Tienda lee productos reales de la BD; `haircut_history` se puebla al cobrar (migración 014); reprogramar citas en admin; modo dummy eliminado.
- ✅ Modularidad: 8 feature flags (`tienda, suscripciones, contabilidad, propinas, mensajes_crm, lookbook, reservas_online, portal_barbero`), guards de ruta, toggles en `/admin/configuracion`, migración 015.
- ✅ Dos asistentes (cliente/admin) por ruta, `/api/chat` lee datos reales de la BD + sucursales reales + chequeo de rol admin + historial de conversación. Tours de cliente y admin con anclas dinámicas (`nav-*`, `sidebar-*`, `step-indicator-*`).
- ✅ **Bug crítico corregido por Opus**: guards de feature-flag que rompían Reglas de Hooks en `/reservar` y `/barbero/mi-agenda` (crash en runtime que el build no detecta). Lección registrada en [[gemini-brief-hooks-guard]].

## Backlog priorizado

### A. Imágenes de tarjetas (GPT) — ver `GPT_imagenes_tarjetas.md`
Prompts listos para generar/mejorar las imágenes de: tarjetas de sucursal, productos, lookbook, barberos y servicios. Mantener rutas exactas de `public/` (el manifiesto está en `public/images/IMAGES_TODO.md`).

### B. Modo claro/oscuro (Gemini) — ✅ HECHO (con cabos sueltos) — `FASE_11_modo_claro_oscuro.md`
Toggle funcionando: ThemeProvider, `theme-toggle.tsx`, paleta `:root` crema/dorada branded, toggle en Header y admin, default dark. **Pendiente (→ FASE 13):** quedaron ~17 archivos con colores dark hardcodeados → parches negros en modo claro.

### C. Pulido UI lote 1 (Gemini) — ✅ HECHO — `FASE_12_pulido_ui.md`
`ImageUpload` con Supabase Storage (bucket `media`) wired en barberos/productos; paginación (clientes) y búsqueda (citas) agregadas. **Pendiente (→ FASE 13):** crear el bucket `media` en Supabase (si no, los uploads fallan) y optimizar imágenes.

### B2/C2. Cierre de tema + assets + Storage (Gemini) — ver `FASE_13_tema_cleanup_y_assets.md`
Terminar limpieza de colores (modo claro sin parches), optimizar imágenes (<400 KB; hoy productos 512 KB), y crear/documentar el bucket `media`.

### A✅. Imágenes de tarjetas (GPT) — HECHO
GPT regeneró barberos, sucursales, lookbook y 8 productos; FASE 13 las pasó a WebP <400 KB.

### E. Onboarding premium + imágenes en módulos — EN CURSO
- **GPT** — `GPT_imagenes_modulos_onboarding.md`: héroes de bienvenida, banners de categoría de tienda, miniaturas por módulo y empty states (WebP).
- **Gemini** — `FASE_14_onboarding_premium.md`: modal de bienvenida por rol (1ª visita), tarjetas de tour con progreso/ícono/CTA, e integración de las imágenes en tienda, /admin/configuracion y empty states. Objetivo: que el onboarding "marque la diferencia".

### D. Nuevas funciones / operativa (próximas fases, aprovechando bajo costo)
Prioridad sugerida (cada una = un brief cuando se active):
1. **Subida de imágenes a Supabase Storage** (bucket + RLS) — habilita B y quita las URLs de texto. *(base para todo lo visual)*
2. **Reportes exportables** (CSV/PDF) de caja, liquidaciones y clientes desde el admin.
3. **Dashboard analítico**: series temporales de ingresos, ranking de servicios/barberos, tasa de no-show, retención.
4. **No-show y recordatorio 24h** (estado `no_show` ya existe en el enum; recordatorio previo a la cita, canal manual wa.me).
5. **Reseñas/valoración post-cita** del cliente al barbero (alimenta fidelización y marketing).
6. **Portal barbero ampliado**: que el barbero gestione sus bloqueos/horarios y vea su liquidación.
7. **Mercado Pago** (pagos online en checkout + webhook) — diferido; retomar cuando se decida.
8. **Recordatorios automáticos con proveedor real** (email Resend o WhatsApp Cloud API) — hoy es manual; la Edge Function `send-reminders` quedó en solo-lectura.

## Puerta de deploy (checklist antes de ir a producción)
Repo conectado a GitHub (`github.com/Marser322/nb`) con integración Vercel: **push = deploy** (push a rama → preview; merge a `main` → producción). No hace falta el token de Vercel para esto.
Antes de mergear a `main`:
1. [ ] FASE 13 cerrada y verificada en navegador (modo claro sin parches, imágenes < 400 KB, upload funcionando).
2. [ ] Migraciones **014, 015, 016** aplicadas a la Supabase de producción (+ verificación: haircut_history se puebla, flags existen, bucket `media` operativo).
3. [ ] Env vars en Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (dominio real). Opcional IA: `GEMINI_API_KEY`/`OPENAI_API_KEY`.
4. [ ] `npm run build` verde + smoke test en URL de **preview** (push de la rama) antes del merge.
5. [ ] Merge `fix/crm-flujos-funcionales` → `main` → deploy de producción.
**Seguridad:** revocar/rotar el token de Vercel que se compartió en chat. No se guarda en el repo ni en memoria.

## Convenciones para todos los briefs
- Estética "lujo minimalista" (negro + dorado `#D4AF37`), español en todo lo visible, shadcn/ui + framer-motion.
- **Regla de oro (aprendida)**: cualquier guard `if (!isLoaded || !features.X) return <loader/>` va **después de todos los hooks**, nunca entre `useState`.
- Usar tokens de tema (`bg-background`, `text-foreground`, `bg-card`…) en lugar de colores hardcodeados.
- No duplicar strings de estado: viven en `src/lib/constants.ts`.
- Verificar SIEMPRE en el navegador (no solo `npm run build`; el build no detecta errores de hooks ni de theming).
