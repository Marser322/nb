# FASE 29 — Polish: Contacto / auth / detalles (terminación premium)

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-08).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que contacto muestre el equipo real (no tres barberos inventados) y que el circuito de auth se sienta terminado: contraseñas visibles a demanda, teléfonos validados y errores que explican qué pasó.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens — los heros sobre foto negra (contacto) conservan sus overlays/gradientes oscuros intencionalmente (precedente FASE 25). Rama de trabajo: `feat/polish-contacto-auth` desde `refinamiento-pre-demo`.

## Estado actual (anclas verificadas 2026-07-08)

**Contacto** (`src/app/(main)/contacto/ContactoContent.tsx`, 376 líneas):
- **Equipo hardcodeado**: array `TEAM` con Carlos/Miguel/Diego, bios y fotos fijas (`ContactoContent.tsx:21-43`). La tabla `barbers` existe y el admin la gestiona (`/admin/barberos`, con avatares vía `image-upload`); si el CEO da de alta un barbero real, contacto sigue mostrando los inventados. Mismo anti-patrón que la home/lookbook antes de FASE 25.
- **Normalización de WhatsApp duplicada**: `normalizePhoneForWhatsApp` local (`ContactoContent.tsx:45-50`) replica lo que ya hacen `normalizeUyPhone`/`buildWaLink` de `src/lib/whatsapp.ts:6,47` (regla del proyecto: no duplicar).
- "Reservar en esta sede" (`ContactoContent.tsx:299-303`) lleva a `/reservar` pelado — no preselecciona la sucursal aunque el wizard ya lee query params (patrón FASE 21 con `serviceId`/`styleId`).
- Lo que está bien (no romper): heros sobre foto con overlays oscuros, botón WhatsApp con verde de marca `#25D366` (color de marca de WhatsApp, se queda), `tel:` links, gates de `features.reservas_online`, copy de "Nuestra Historia".

**Auth** (`src/app/(auth)/`):
- **Sin "mostrar contraseña"** en login (`login/page.tsx:119-130`), register (2 campos, `register/page.tsx:138-168`) y actualizar-password (2 campos, `actualizar-password/page.tsx:75-107`). En mobile es la fuente nº1 de "contraseña incorrecta".
- **Teléfono sin validar en registro**: `phone` se manda crudo a `signUp` (`register/page.tsx:48-57`); `normalizeUyPhone` (`src/lib/whatsapp.ts:6`) ya existe. Ese teléfono después alimenta el CRM y los wa.me del admin/barbero — un teléfono basura rompe la cadena.
- **Errores de login sin mapear**: solo se traduce "Invalid login credentials" (`login/page.tsx:43-47`); "Email not confirmed" (usuario que no confirmó el mail) cae en el genérico "Error al iniciar sesión" sin decirle qué hacer.
- **actualizar-password sin guard de sesión**: si alguien abre `/actualizar-password` sin venir del link de recuperación (sin sesión), `updateUser` falla con el mensaje crudo de Supabase concatenado (`actualizar-password/page.tsx:48-52`). Falta detectar "no hay sesión" al montar y mostrar un estado claro con link a `/recuperar`.
- Lo que está bien: redirect por rol tras login (69-76), guard anti open-redirect del `next` param (55), mensaje honesto de recuperar ("Si el email existe…", `recuperar/page.tsx:43`), quick-login demo gateado por `isDemoMode`.

## Análisis (máximo valor / qué NO se hace)

- **Valor a extraer**: contacto es la página de confianza (quién me corta, dónde) — mostrar el equipo real desde la DB la vuelve verdadera para siempre. En auth, tres micro-fixes (ojo de contraseña, teléfono validado, errores explicados) eliminan la fricción que más soporte genera.
- **Fuera de alcance (anti-monstruo)**:
  - NO login social (Google/Apple), NO magic links, NO captcha.
  - NO perfil social del barbero con portfolio (roadmap 3.6) — acá es solo la card de contacto.
  - NO formulario de contacto con backend (el patrón del sitio es WhatsApp directo, se respeta).
  - NO editor del copy "Nuestra Historia".

## Trabajo — Base de datos

Ninguna migración (la tabla `barbers` ya tiene `name`, `bio`, `image_url`, `is_active`).

## Trabajo — App

### Bloque A — Equipo real en contacto

1. En `ContactoContent.tsx`: cargar barberos activos de Supabase (`barbers`, `is_active = true`, campos `id, name, bio, image_url`) con fallback al array `TEAM` actual si la query falla o viene vacía — patrón exacto de home/lookbook (FASE 25, `src/app/page.tsx:50-54`).
2. Card: `ImageWithFallback` (ya existe en `src/components/shared/`) para avatares nulos; `bio` con fallback a un rol genérico en voseo ("Barbero de la casa") si viene null. Mantener la estética actual de las cards (hover, gradientes).
3. Skeleton de 3 cards pulse mientras carga (patrón del resto del sitio) — sin saltos de layout.

### Bloque B — WhatsApp sin duplicados en contacto

1. Reemplazar `normalizePhoneForWhatsApp` local (45-50) por `normalizeUyPhone`/`buildWaLink` de `src/lib/whatsapp.ts`. El `tel:` usa el mismo normalizado. Borrar la función local.

### Bloque C — Ojo de contraseña (auth)

1. Toggle mostrar/ocultar (icono `Eye`/`EyeOff`, `aria-label` en español, `type="button"`) en TODOS los campos password: login (1), register (2), actualizar-password (2). Extraer un componente pequeño `PasswordInput` en `src/components/shared/` para no duplicar 5 veces (mismos estilos `pl-10` + icono `Lock` actuales).

### Bloque D — Validación y errores (auth)

1. **Register**: si `phone` no está vacío y `normalizeUyPhone(phone)` da null → toast "Ingresá un teléfono uruguayo válido (ej: 099 123 456)" y no enviar. Vacío sigue siendo válido (es opcional).
2. **Login**: mapear también "Email not confirmed" → "Tenés que confirmar tu email antes de entrar. Revisá tu casilla (y el spam)."
3. **actualizar-password**: al montar, chequear `supabase.auth.getSession()`; sin sesión → en lugar del form, card con "El enlace de recuperación expiró o no es válido" + botón a `/recuperar` para pedir uno nuevo. (Guard DESPUÉS de los hooks.) Además, quitar el `error.message` crudo concatenado del toast (49) — mensaje propio en español.

### Bloque E — Deep link de sucursal: OMITIDO (verificado por Fable)

Verificado 2026-07-08: el wizard lee `styleId/serviceId/barberId` de query params (`reservar/page.tsx:51-53`) pero NO `branchId`, y contacto usa `BRANCHES` estático (ids numéricos) mientras el wizard trabaja con sucursales de DB (uuid, merge por nombre en `reservar/page.tsx:106-117`). Agregar el deep link requeriría tocar el wizard + cargar sucursales de DB en contacto = scope nuevo. **No hacer nada en este bloque**; la idea queda anotada en `ROADMAP_CRECIMIENTO.md`.

## Parte manual (Mario)

- Cargar `bio` y foto a los barberos reales en `/admin/barberos` para que contacto luzca completo (hasta entonces, fallbacks).

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Contacto con tabla `barbers` poblada muestra el equipo real (con y sin foto/bio); con DB caída/vacía muestra los 3 estáticos.
- Botones de WhatsApp de sucursales siguen abriendo wa.me correcto.
- Ojo de contraseña funciona en las 5 instancias, con foco accesible.
- Register con teléfono "abc" → bloqueado; con "099 123 456" o vacío → pasa.
- `/actualizar-password` abierto directo (sin link de mail) → card de enlace inválido con CTA a recuperar.
- Ambos temas y 375px (contacto: cards de equipo; auth: forms con el toggle).
- Si el dev server falla con "Failed to open database… invalid digit": `rm -rf .next` + `find . -name '._*' -not -path './node_modules/*' -delete`.

## Criterios de aceptación

- Un barbero dado de alta en el admin aparece en contacto sin tocar código.
- Cero funciones de normalización de teléfono duplicadas en el codebase.
- Ningún flujo de auth muestra errores crudos de Supabase ni deja al usuario sin saber qué hacer.

## Restricciones

- Rama `feat/polish-contacto-auth`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels viven en `src/lib/constants.ts` — no duplicar strings.
