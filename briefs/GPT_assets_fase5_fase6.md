# Brief GPT-5.5 — Assets de barberos + Fase 5 (Dashboard CRM) + Fase 6 (Producción)

> Proyecto: NB Barber (New Brothers), plataforma web de barbería en Uruguay. Next.js 16 (App Router) + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + Supabase. Tema oscuro únicamente, negro profundo con acentos dorados `#D4AF37`. Toda la UI en español (voseo uruguayo).
>
> Leer primero `briefs/README.md` (reglas transversales). Este brief tiene **tres bloques en orden**: assets → Fase 5 → Fase 6. Los bloques 2 y 3 ejecutan briefs que ya existen en el repo (`briefs/FASE_5_dashboard_crm.md` y `briefs/FASE_6_produccion_supabase.md`); acá van solo las correcciones y el contexto actualizado.
>
> **Coordinación**: en paralelo otro agente ejecuta las Fases 8–10 (disponibilidad, contabilidad, módulos). NO tocar: el wizard de `src/app/(main)/reservar/`, `src/app/admin/barberos/`, `src/app/admin/sucursales/`, ni crear migraciones `011`+. Tu territorio es: `public/images/`, `src/lib/static-data.ts`, `src/app/admin/dashboard/`, `src/components/admin/`, `scripts/`, `DEPLOY.md`, `.env.example`.

## Bloque 1 — Retratos de barberos faltantes

Hoy hay 6 barberos y solo 3 fotos: en `src/lib/static-data.ts` Martín reusa `carlos.jpg` (línea ~91), Lucas reusa `miguel.jpg` (~103) y Facundo reusa `diego.jpg`. Generar 3 retratos nuevos consistentes con el set existente (ver `public/images/ASSET_PRODUCTION_BRIEF.md` para el estilo de los originales).

| Ruta destino | Personaje (bio en static-data.ts) | Prompt guía |
|---|---|---|
| `public/images/barbers/martin.jpg` | Martín: fades impecables y diseños geométricos, competidor nacional 2024. Veintipico, energía competitiva. | Retrato de barbero joven uruguayo, pecho arriba, apron negro, mirada segura, fondo oscuro de barbería premium, luz ámbar cálida de espejo, acentos dorados sutiles. |
| `public/images/barbers/lucas.jpg` | Lucas: cortes surferos y estilos relajados, onda costera. Pelo con ondas, look relajado. | Retrato de barbero 25-30 con pelo ondulado estilo surfer, apron negro, sonrisa relajada, mismo fondo oscuro y luz cálida del set. |
| `public/images/barbers/facundo.jpg` | Facundo: especialista en barbas largas y tratamientos capilares, 8 años de experiencia. | Retrato de barbero 30s con barba prolija abundante, apron negro, presencia calma, mismo fondo oscuro y luz ámbar del set. |

**Specs obligatorias** (idénticas a los retratos existentes):
- 1:1, mínimo 800×800 (ideal 1600×1600), **JPG < 400 KB** (el set actual quedó en .jpg, no .png — mantener .jpg).
- Fotografía realista, sin texto, sin logos, sin marcas, manos correctas, reconocible en miniatura, legible bajo overlays oscuros.
- Que los 3 rostros sean claramente distintos entre sí y distintos de Carlos/Miguel/Diego.

**Después de generar**: actualizar `avatar_url` de Martín, Lucas y Facundo en `src/lib/static-data.ts` para que cada uno apunte a su archivo.

**Opcional (si sobra sesión)**: recomprimir los 7 JPG de `public/images/hero/` de ~400-490 KB a ~300 KB sin pérdida visible (misma ruta, mismas dimensiones).

## Bloque 2 — Fase 5: Dashboard CRM

Ejecutar `briefs/FASE_5_dashboard_crm.md` **tal cual**. Contexto actualizado desde que se escribió:

- Las Fases 1–4 y 7 ya están hechas: existen `supabase.rpc('get_clients_overview')` (migración 007), `SendWhatsappDialog` en `src/components/admin/send-whatsapp-dialog.tsx`, `INACTIVE_DAYS` en `src/lib/constants.ts`, y `/admin/clientes?filtro=inactivos` funciona.
- El dashboard (`src/app/admin/dashboard/page.tsx`) ya tiene una invocación fire-and-forget de `generate_subscription_appointments()` — no tocarla.
- Ojo con `branches`: la columna real en DB es `active` (NO `is_active`); el dashboard ya la usa bien.
- Patrón de referencia para cards/tablas: `src/app/admin/servicios/page.tsx`.

## Bloque 3 — Fase 6: Producción

Ejecutar `briefs/FASE_6_produccion_supabase.md` con **una corrección importante**:

- Para levantar la DB de producción, el camino recomendado ya NO es "correr 001 → 007 en orden": ahora **`supabase/migrations/999_FULL_SETUP.sql` está consolidado y equivale a 001 → 010 sobre una DB fresca** (incluye branches, cash_movements, communication_logs, reminders_config, los RPCs de checkout/booking y el RLS endurecido). Un solo pegado en el SQL Editor. Requisito previo: habilitar la extensión `pg_cron` en Dashboard > Database > Extensions (la parte final del script la usa).
- Entregables de **código** de tu sesión: `scripts/backup-supabase.sh` (el script está completo dentro del brief F6), `.env.example` documentado, y `DEPLOY.md` actualizado con el runbook completo (región sa-east-1, Auth URL Configuration con `/actualizar-password`, backup + restore, Vercel vs VPS, camino de migración futuro).
- Los pasos que requieren consola de Supabase o el VPS (crear proyecto, cargar datos reales, cron del backup) quedan **documentados como runbook para Mario**, no los ejecutás vos.

## Cierre

- `npm run build` y `npm run lint` deben pasar.
- Commits atómicos en español (`feat:`, `chore:`, `docs:`) siguiendo el estilo del historial.
