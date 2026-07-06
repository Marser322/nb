# FASE 15 — Pulido demo: imágenes de servicios, acceso admin demo, og-image y enfoque del tour

> Leer primero `briefs/README.md` (reglas transversales). Cuatro bloques **independientes** (A–D), cada uno copiable a una sesión de Gemini/Sonnet por separado. Commits atómicos por bloque. `npm run build` y `npm run lint` deben pasar antes de cerrar cada bloque.

CONTEXTO GENERAL: NB Barber (Next.js 16 + React 19 + Tailwind 4 + shadcn/ui + framer-motion + Supabase). El sitio funciona como **demo pública** en Vercel; el objetivo de esta fase es que cualquier visitante pueda ver todo (incluido el mini-CRM) sin fricción y que los detalles visuales (imágenes de servicios, tarjeta de compartir en redes, spotlight del tour) estén a la altura del resto.

REGLAS: UI en español (voseo), tokens de tema (`bg-background`, `text-foreground`, `primary`), nada de colores hardcodeados, funcionar en tema claro y oscuro, responsive (probar 375px). **Cualquier guard/early-return en componentes va SIEMPRE después de todos los hooks** (el build no lo detecta; crashea en runtime).

---

## BLOQUE A — Bug: las imágenes de los servicios dan 404 (extensión .png vs .jpg)

### Diagnóstico (verificado)
El seed inserta en `services.image_url` rutas con extensión **`.png`**:
- `supabase/migrations/001_initial_schema.sql:55-58` y `supabase/migrations/999_FULL_SETUP.sql:74-77`:
  `/images/hero/maquina-clippers.png`, `/images/hero/detalle-corte.png`, `/images/hero/detalle-barba.png`

Pero los archivos reales en `public/images/hero/` son **`.jpg`** (`maquina-clippers.jpg`, `detalle-corte.jpg`, `detalle-barba.jpg` — existen, verificado). Resultado: en el paso 2 del wizard (`src/app/(main)/reservar/page.tsx:669`) el panel de preview muestra el ícono de imagen rota.

### Tareas
1. **Nueva migración `supabase/migrations/017_fix_service_images.sql`** (correr a mano en el SQL Editor, convención del proyecto):
   ```sql
   -- 017: corrige extensiones de image_url en services (.png -> .jpg, los archivos reales son .jpg)
   UPDATE services
   SET image_url = replace(image_url, '.png', '.jpg')
   WHERE image_url LIKE '/images/hero/%.png';
   ```
2. Corregir el seed en origen para DBs frescas: `.png` → `.jpg` en los 3 INSERT de `001_initial_schema.sql`, `999_FULL_SETUP.sql` y en el espejo `src/lib/supabase_schema.sql` (si ahí también aparece).
3. **Mobile nunca ve la imagen**: el panel de preview es `hidden lg:block` (`reservar/page.tsx:658`). Agregar una miniatura del servicio en cada Card del listado (`next/image`, ~64px, rounded, a la izquierda del nombre), con degradación con gracia si `image_url` es null (no romper el layout). Mantener estética actual.
4. Detalle: `hoveredService` se setea `onMouseEnter` pero nunca se limpia. Agregar `onMouseLeave={() => setHoveredService(null)}` al Card para que el preview vuelva al servicio seleccionado.
5. Verificar en navegador: paso 2 del wizard muestra la foto correcta al hover y al seleccionar, en desktop y en 375px, ambos temas.

### Criterios de aceptación
- Ninguna request 404 a `/images/hero/*.png` en la pestaña Network.
- El preview del paso 2 muestra la foto del servicio en hover/selección; en mobile cada card tiene su miniatura.

---

## BLOQUE B — Acceso demo al mini-CRM (usuario admin genérico + entrada visible)

### Diagnóstico (verificado)
- Existe `/admin-login` (`src/app/admin-login/page.tsx`) y el middleware (`src/lib/supabase/middleware.ts:48-68`) protege `/admin/*` exigiendo perfil `role='admin'`. Todo funciona… pero **no hay ningún link a `/admin-login` en toda la UI pública** (verificado con grep en `src/components/layout/`). Y no existe ningún usuario demo documentado. Por eso "no se puede entrar fácilmente al CRM".

### Parte manual (Mario, 5 min, antes o después del código)
1. Supabase Dashboard → Authentication → Users → **Add user**: email `demo@nbbarber.uy`, password `DemoNB2026!`, marcar "Auto Confirm User".
2. SQL Editor (el trigger de perfiles debería haber creado la fila; esto la asegura y promueve):
   ```sql
   UPDATE profiles SET role = 'admin', full_name = 'Admin Demo'
   WHERE auth_user_id = (SELECT id FROM auth.users WHERE email = 'demo@nbbarber.uy')
      OR id = (SELECT id FROM auth.users WHERE email = 'demo@nbbarber.uy');
   ```
3. En Vercel (y `.env.local`): `NEXT_PUBLIC_DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_ADMIN_EMAIL=demo@nbbarber.uy`, `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD=DemoNB2026!`.

### Tareas de código
1. **Quick-login demo en `/admin-login`** (`src/app/admin-login/page.tsx`): si `process.env.NEXT_PUBLIC_DEMO_MODE === 'true'`, mostrar bajo el form una tarjeta "Modo demo" (glass-card, borde dorado sutil) con un botón **"Entrar como Admin demo"** que hace `signInWithPassword` con las credenciales de las env vars y redirige a `/admin/dashboard`. Deshabilitado con spinner mientras loguea; toast de error si falla. Nota: exponer estas credenciales en el bundle es intencional — es una demo pública.
2. **Lo mismo en `/login`** (`src/app/(auth)/login/page.tsx`), versión compacta: link/botón secundario "¿Querés ver el panel de administración? Entrá como admin demo".
3. **Entrada visible al panel**: en el footer público (`src/components/layout/`), agregar link discreto "Acceso staff" → `/admin-login`. Si el footer tiene columnas de links, va en la última.
4. **Redirect por rol post-login en `/login`**: hoy siempre manda a HOME (`login/page.tsx:52`). Tras login exitoso y **solo si no hay `next` param**, consultar el rol del perfil (misma query `.or(auth_user_id.eq...,id.eq...)` que usa el middleware) y redirigir: `admin` → `/admin/dashboard`, `barbero` → `/barbero/mi-agenda`, resto → HOME.
5. Documentar las 3 env vars nuevas en `.env.example` con comentario "solo para deploys demo; no setear en producción real".
6. Opcional (si sobra tiempo): badge "DEMO" chico junto al logo del sidebar admin cuando `NEXT_PUBLIC_DEMO_MODE === 'true'`, para dejar claro que los datos son de juguete.

### Criterios de aceptación
- Desde el footer se llega a `/admin-login`; un click en "Entrar como Admin demo" deja al visitante en `/admin/dashboard` con todos los módulos visibles.
- Con `NEXT_PUBLIC_DEMO_MODE` sin setear, no aparece NINGÚN rastro del modo demo (ni tarjeta, ni credenciales).
- Login normal de un admin por `/login` cae en el dashboard (no en el home).

---

## BLOQUE C — og-image para compartir: logo claro y sin caja de fondo

### Diagnóstico (verificado)
- `public/logo.png` (1000px) tiene el logo circular blanco sobre **fondo oscuro sólido, no transparente**.
- `public/og-image.png` (1200×630) fue compuesto con ese asset: se ve la caja rectangular oscura detrás del círculo (la "caja gris" al compartir en WhatsApp/redes).
- La metadata (`src/app/layout.tsx:33-53`) apunta a `/og-image.png` estático.

### Estrategia recomendada: generar el og-image por código (sin GPT)
Regenerar la foto con IA arriesga deformar el texto del logo. Como el logo es un **círculo perfecto**, se recorta con máscara circular de forma determinística y se recompone el og-image con código:

1. **Asset `public/logo-transparent.png`**: script one-off (correr con `npx tsx` o node, usando `sharp` como devDependency, o Python/PIL si está disponible) que toma `public/logo.png`, aplica una máscara circular (círculo inscripto, centro = centro de la imagen, radio = borde exterior del aro dorado/blanco con ~2px de margen) y deja alfa transparente fuera del círculo. Guardar también una versión 512px para usos futuros. El script va en `scripts/` (ej. `scripts/make-logo-transparent.mjs`) por si hay que regenerar.
2. **`src/app/opengraph-image.tsx`** con `ImageResponse` de `next/og` (App Router lo sirve automáticamente y reemplaza al PNG estático):
   - 1200×630, `alt` = "New Brothers | Barbería Premium en Uruguay".
   - Fondo: `public/images/hero/ambiente-barberia.jpg` con overlay negro ~70% (mismo look que el og actual).
   - Izquierda: "NEW" en blanco marfil + "BROTHERS" en dorado `#D4AF37` (tipografía bold condensada; cargar Oswald como ArrayBuffer para ImageResponse), subtítulo "Salón de Estética Masculina", línea "Reservas online · Barbería premium en Uruguay", y "nbbarber.com" abajo.
   - Derecha: `logo-transparent.png` centrado dentro del aro dorado fino (el círculo decorativo del diseño actual) — **sin ninguna caja de fondo**.
   - En `layout.tsx`: quitar las entradas `images` hardcodeadas de `openGraph` y `twitter` (Next las resuelve solo con `opengraph-image.tsx`; verificar con view-source que el `og:image` final apunta a la ruta generada). Actualizar también `jsonLd.image`.
   - Borrar `public/og-image.png` cuando el nuevo esté verificado.
3. **Verificar `public/icon.png`** (favicon): si también tiene fondo oscuro cuadrado, reemplazarlo por un export de `logo-transparent.png` a 512px (los favicons con alfa se ven bien en tabs claras y oscuras).
4. Verificación: `npm run build`, abrir `/opengraph-image` en el navegador, y validar con https://www.opengraph.xyz o el debugger de WhatsApp/Telegram (ojo: cachean; agregar `?v=2` al probar).

### Plan B (si `next/og` diera problemas con las fuentes)
Componer el PNG estático con el mismo script de `sharp`: fondo `ambiente-barberia.jpg` 1200×630 + overlay + textos como SVG embebido + `logo-transparent.png`. Mismo layout, mismo criterio de aceptación.

### Criterios de aceptación
- La tarjeta al compartir muestra el logo circular flotando sobre la foto, sin ningún rectángulo de fondo.
- El logo se ve claro (blanco/marfil) y legible sobre el fondo oscuro.

---

## BLOQUE D — Tour: el spotlight no "enfoca" (el target queda tan apagado como el resto)

### Diagnóstico (verificado — este es el bug real del enfoque)
En `src/components/tour/TourOverlay.tsx:98-123`, el backdrop es un `motion.div` con `bg-background/70 backdrop-blur-[3px]` que cubre **toda** la pantalla. El "spotlight" hijo solo dibuja un borde + `box-shadow` de 9999px hacia afuera. Consecuencia: el velo y el blur del padre caen TAMBIÉN sobre el elemento destacado — el interior del spotlight nunca se ve nítido ni brillante, y encima la zona exterior queda doblemente oscurecida (velo del padre + shadow del hijo). Por eso "no mejoró el enfoque": el seguimiento del scroll se arregló en el commit anterior, pero el velo nunca dejó de tapar el target.

### Tareas
1. **Hacer el agujero de verdad.** En el `motion.div` del backdrop (línea ~103): cuando hay `targetRect`, quitar el velo y el blur del padre y dejar que el `box-shadow` del spotlight haga el oscurecido exterior; cuando NO hay `targetRect` (pasos centrados tipo modal), mantener velo + blur completos:
   ```tsx
   className={cn(
     "pointer-events-auto absolute inset-0",
     targetRect ? "bg-transparent" : "bg-background/70 backdrop-blur-[3px]"
   )}
   ```
2. **Subir el contraste del oscurecido exterior** en el style del spotlight (línea ~117): pasar el primer shadow de `78%` a **`85%`** para compensar el velo que se quita: `0 0 0 9999px color-mix(in oklab, var(--background) 85%, transparent)`. Mantener el glow dorado y el borde.
3. **Realce del interior**: agregar al spotlight un segundo box-shadow interior sutil `inset 0 0 0 1px color-mix(in oklab, var(--primary) 30%, transparent)` o un `outline` suave — el objetivo es que el elemento enfocado se lea claramente más brillante que el resto. No poner ningún fondo dentro del spotlight (taparía el elemento).
4. **Opcional premium (solo si lo anterior queda bien)**: recuperar el blur exterior con máscara CSS en un div hermano: `backdrop-blur` + `mask-image: linear-gradient(#000,#000), linear-gradient(#000,#000)` con `mask-composite: exclude` posicionando la segunda capa sobre el rect del spotlight (`mask-position/mask-size` en px del rect inflado). Probar en Safari (`-webkit-mask-composite: source-out`). Si Safari molesta, abandonar esta parte: el punto 1-3 ya resuelve el enfoque.
5. Verificar: tour de cliente (home) y tour de admin (dashboard), en ambos temas, desktop y 375px. El elemento destacado debe verse **100% nítido y a brillo completo**, el resto claramente atenuado. Esc cierra, pasos centrados (target `body`) siguen mostrando velo completo.

### Criterios de aceptación
- Dentro del recorte del spotlight el elemento se ve igual de nítido que sin tour (cero velo, cero blur encima).
- Fuera del recorte, la página queda claramente atenuada (≥85%) y el aro dorado marca el target.
- Los pasos sin target (`body`) conservan el backdrop completo con blur.
