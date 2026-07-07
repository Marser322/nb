# FASE 18 — Acceso demo destacado + paso del tour al panel admin · brief para Gemini

> Leer primero briefs/README.md (reglas transversales). **PRIORIDAD MÁXIMA**: esta demo se presenta en vivo a dueños de barberías; el objetivo es que cualquier visitante descubra y entre al panel administrativo (mini-CRM) en un clic, sin tener que buscar el link escondido del footer.
>
> Tres bloques **independientes** (A–C), cada uno copiable a una sesión de Gemini/Sonnet por separado. Commits atómicos por bloque. `npm run build` y `npm run lint` deben pasar antes de cerrar cada bloque.

CONTEXTO GENERAL: Next.js 16 (App Router) + React 19 + TS estricto (alias `@/*`), Tailwind 4 + shadcn/ui + framer-motion + lucide-react. Repo en `/Volumes/1TB CACHE/Barberia`. La plataforma ya tiene un **modo demo** funcional (FASE 15): la env var `NEXT_PUBLIC_DEMO_MODE==='true'` habilita un quick-login "Entrar como Admin demo" en `/admin-login` y `/login` que hace `signInWithPassword` con `NEXT_PUBLIC_DEMO_ADMIN_EMAIL` / `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD` y redirige a `/admin/dashboard`. El problema: hoy el único acceso visible al panel es un link chiquito "Acceso staff" al final del footer (`src/components/layout/Footer.tsx:89-96`) y un candado sin texto en el header desktop (`src/components/layout/Header.tsx:136-140`, `hidden md:inline-flex`). Un dueño mirando la demo no lo encuentra. Esta fase lo arregla con un CTA destacado en la home y un paso del tour guiado que lleva directo al panel.

REGLAS: UI en español con **voseo uruguayo** ("entrá", "mirá", "tenés"). Usar **tokens de tema** (`primary`, `foreground`, `muted-foreground`, `card`, `border`, utilidades `.glass-card`/`.text-glow`), NUNCA colores hardcodeados; **probar tema claro Y oscuro**. Mobile-first (clase base = mobile), campos/CTA cómodos en 375px. **Cualquier guard/early-return en componentes va SIEMPRE después de todos los hooks** (el build no lo detecta; crashea en runtime — es el bug recurrente de este proyecto). Reusar `ROUTES` de `src/lib/constants.ts`. `next/image` para imágenes. Commits atómicos estilo historial (`feat:`/`fix:` en español). Si git falla con "non-monotonic index": `find .git -name '._*' -delete`.

---

## BLOQUE A — CTA demo destacado en la home (solo modo demo)

### Diagnóstico (verificado)
- `src/app/page.tsx` es un `"use client"` component (línea 1) que ya consume `useFeatures()` y `ROUTES`. La home tiene: hero (`<section>` hasta línea 139), sección Servicios (143), Antes/Después (241), WhyChooseUs (280), CTA final (285), `<Footer/>` (322).
- El acceso al panel hoy solo vive en `Footer.tsx:89-96` (link "Acceso staff" → `ROUTES.ADMIN_LOGIN`, `text-xs text-muted-foreground/70`) y `Header.tsx:136-140` (ícono Lock, `hidden md:inline-flex`, invisible en mobile). Demasiado discreto para una demo comercial.
- El flag se lee como `process.env.NEXT_PUBLIC_DEMO_MODE === 'true'` (es `NEXT_PUBLIC_`, legible en cliente; ver el patrón exacto en `src/app/(auth)/login/page.tsx:15` y `src/app/admin-login/page.tsx:15`).
- `ROUTES.ADMIN_LOGIN === '/admin-login'` (`constants.ts:225`). Esa página ya muestra el botón "Entrar como Admin demo" cuando el modo demo está activo → es el destino correcto (un clic más y entran al dashboard).

### Tareas
1. En `src/app/page.tsx`, dentro de `HomePage`, agregar (después de los hooks existentes, respetando la regla de early-returns):
   ```tsx
   const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
   ```
2. Insertar una **sección CTA demo** que se renderice SOLO si `isDemoMode`, ubicada **inmediatamente después del cierre del hero** (después de `</section>` de la línea 139, antes de la sección Servicios). Debe:
   - Ser una franja premium con `.glass-card` / borde dorado (`border-primary/30`), fondo sutil (`bg-primary/5` o `bg-card/60`), tokens de tema (se ve bien en claro y oscuro).
   - Llevar `id="demo-admin-cta"` en el contenedor principal (lo usa el tour del BLOQUE B — **no cambiar este id**).
   - Copy orientado a dueños de barbería. Ejemplo (ajustá redacción manteniendo voseo):
     - Badge/eyebrow: "Demo para dueños de barberías"
     - Título: "¿Gestionás una barbería? Mirá el panel por dentro"
     - Bajada: "Agenda, caja, clientes, stock y liquidaciones en un solo lugar. Entrá al panel de administración de demostración sin crear cuenta."
   - Botón primario `asChild` con `<Link href={ROUTES.ADMIN_LOGIN}>` y texto "Ver el panel de gestión" + ícono flecha (`ArrowRight`) o `LayoutDashboard` de lucide.
   - Entrada con framer-motion (`whileInView`, `viewport={{ once: true }}`) coherente con las otras secciones de la home.
3. Icono: importar de `lucide-react` (`LayoutDashboard`, `ShieldCheck` o similar) — reusar imports ya presentes cuando se pueda.
4. NO tocar el Footer ni el Header en este bloque (el link "Acceso staff" queda como acceso secundario permanente).

### Criterios de aceptación
- Con `NEXT_PUBLIC_DEMO_MODE=true` en `.env.local`: al abrir `/` aparece la franja demo entre el hero y Servicios, con el botón que navega a `/admin-login`; ahí el visitante ve "Entrar como Admin demo" y llega al dashboard en un clic más.
- Con el flag ausente/`false`: la franja **no** se renderiza (ni un rastro en el DOM); la home queda idéntica a hoy.
- El bloque se ve correcto en 375px y en desktop, en tema claro y oscuro (sin colores hardcodeados).
- `npm run build` y `npm run lint` limpios (no agregar warnings; hay ~44 preexistentes).

Commit sugerido: `feat(demo): agrega CTA destacado al panel de gestión en la home`

---

## BLOQUE B — Paso del tour guiado hacia el panel admin

### Diagnóstico (verificado)
- El tour es **por página**: `APP_TOURS` en `src/lib/tours-data.ts` es un `Record<string, TourStep[]>`; `HelpFab` (`src/components/tour/HelpFab.tsx`) arranca `APP_TOURS[pathname]` con el FAB de ayuda. El tour de `/` tiene 5 pasos (líneas 32-68): body → `#nav-reservar` → `#nav-tienda` → `#nav-lookbook` → `#hero-cta`.
- El tipo `TourStep` (`src/lib/store/tour-store.ts:4-12`) es: `{ target, title, content, position?, icon?, image?, imageAlt? }`. **No** tiene forma de navegar ni de disparar acciones; los pasos solo enfocan un elemento del DOM.
- Comportamiento clave ya existente (`src/components/tour/TourOverlay.tsx:46-63`): **si el `target` de un paso no existe o no es visible en ese breakpoint, el tour salta automáticamente al paso vecino** en la dirección de navegación. Esto nos deja incluir el paso admin siempre en el array: cuando el modo demo esté apagado, `#demo-admin-cta` no existirá y el paso se auto-saltará. No hace falta condicionar el array.
- El botón principal del tooltip (`TourOverlay.tsx:302-320`) hoy hace `onNext` o, en el paso final, `finishTour()` que redirige a `/reservar` (público) o `/admin/dashboard` (admin). No hay soporte para un CTA que navegue a una ruta arbitraria desde un paso intermedio.

### Tareas
1. **Extender el tipo `TourStep`** en `src/lib/store/tour-store.ts` con dos campos opcionales:
   ```ts
   href?: string;      // si está presente, el paso muestra un CTA que navega a esta ruta
   ctaLabel?: string;  // texto del CTA (default: 'Ir')
   ```
2. En `src/components/tour/TourOverlay.tsx`, dentro de `Tooltip`, cuando `step.href` esté presente, renderizar un **botón CTA adicional** debajo de la fila "Anterior/Siguiente" (no reemplazar la navegación existente). Al hacer clic: `onClose()` y `router.push(step.href!)`. Ya existe `const router = useRouter()` en el componente (línea 180). El CTA debe usar tokens (`bg-primary text-primary-foreground`, rounded-full) y mostrar el `step.ctaLabel ?? 'Ir'` + `ArrowRight`. Mantener el patrón de accesibilidad y animación del card.
3. **Agregar un paso** al tour de `/` en `src/lib/tours-data.ts` (dentro del array de `'/'`), ubicado **antes** del paso final `#hero-cta` para que el cierre siga siendo "Comenzá Ahora":
   ```ts
   {
       target: '#demo-admin-cta',
       title: 'Panel de gestión (demo)',
       content: 'Detrás de la vidriera hay un CRM completo: agenda, caja, clientes, stock y liquidaciones. Entrá y recorré el panel de administración de demostración.',
       position: 'top',
       icon: LayoutDashboard,
       href: '/admin-login',
       ctaLabel: 'Ver el panel'
   },
   ```
   Importar `LayoutDashboard` de `lucide-react` en `tours-data.ts` (ya se importan muchos íconos ahí; `LayoutDashboard` ya está en el import — verificá y reusá).
4. NO cambiar la lógica de `finishTour` ni el resto de los tours.

### Criterios de aceptación
- Con modo demo activo, en `/`: al correr el tour (FAB de ayuda abajo a la derecha), tras el paso de Lookbook aparece el paso "Panel de gestión (demo)" enfocando la franja del BLOQUE A, con un CTA "Ver el panel" que navega a `/admin-login`. El paso final sigue siendo "Comenzá Ahora" (`#hero-cta`).
- Con modo demo apagado (o si el BLOQUE A no está desplegado): el paso se **auto-salta** sin romper el tour (comportamiento nativo de `TourOverlay`), y el resto de los tours de la app siguen funcionando igual.
- El CTA del tour funciona en mobile y desktop, ambos temas.
- `npm run build` y `npm run lint` limpios.

Commit sugerido: `feat(tour): agrega paso al panel admin con CTA navegable en modo demo`

---

## BLOQUE C — Descubribilidad del acceso staff + verificación end-to-end (pulido)

### Diagnóstico (verificado)
- `Header.tsx:136-140`: el acceso staff es solo un ícono `Lock` con `aria-label`, `hidden md:inline-flex` → invisible en mobile y sin texto en desktop.
- El quick-login de `/login` (`src/app/(auth)/login/page.tsx:78-103`) hace `signInWithPassword` demo **sin verificar el rol** tras el login (el de `/admin-login` sí lo verifica, `admin-login/page.tsx:37-66`). Inocuo (el middleware rebota), pero conviene alinear la UX.

### Tareas
1. En `src/components/layout/Header.tsx`, cuando `process.env.NEXT_PUBLIC_DEMO_MODE === 'true'`, reemplazar el candado mudo por un botón con **texto visible** "Panel demo" (o "Acceso staff") + ícono, y hacerlo visible también en el menú mobile del header (revisá cómo se arma el menú mobile del Header para agregar el item ahí). Fuera de modo demo, dejar el comportamiento actual (candado discreto). No romper el layout del header en 375px.
2. (Opcional, si el tiempo lo permite) En `login/page.tsx:78-103`, tras el `signInWithPassword` demo, verificar `profile.role === 'admin'` antes del `router.push` (clonar el chequeo de `admin-login/page.tsx`) para unificar el comportamiento. Si preferís no tocarlo, dejarlo — es cosmético.
3. **Verificación end-to-end del recorrido del dueño** (documentar en el reporte, no requiere código): con modo demo activo, desde `/` → CTA home (BLOQUE A) o paso del tour (BLOQUE B) → `/admin-login` → "Entrar como Admin demo" → `/admin/dashboard` → el `WelcomeModal role="admin"` (montado en `src/app/admin/layout.tsx:206`) y el FAB de ayuda ofrecen el tour del panel. Confirmar que la cadena completa funciona sin fricción.

### Criterios de aceptación
- En modo demo, el acceso al panel es visible desde el header en mobile y desktop (con texto, no solo ícono).
- La cadena home → admin-login → dashboard funciona en un par de clics, ambos temas.
- `npm run build` y `npm run lint` limpios.

Commit sugerido: `feat(demo): hace visible el acceso al panel en el header (mobile + desktop)`

---

## Parte manual (Mario, ~5 min — NO es tarea de los agentes)

Para que el botón "Entrar como Admin demo" funcione en la demo desplegada (ver también `briefs/FASE_15_demo_polish.md`, BLOQUE B):
1. **Supabase → Authentication → Users → Add user**: `demo@nbbarber.uy` / `DemoNB2026!` con **Auto Confirm User** activado.
2. **Supabase → SQL Editor**: promover a admin:
   ```sql
   UPDATE profiles SET role = 'admin', full_name = 'Admin Demo'
   WHERE auth_user_id = (SELECT id FROM auth.users WHERE email = 'demo@nbbarber.uy')
      OR id = (SELECT id FROM auth.users WHERE email = 'demo@nbbarber.uy');
   ```
3. **Vercel → Environment Variables** (son build-time, requieren redeploy): `NEXT_PUBLIC_DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_ADMIN_EMAIL=demo@nbbarber.uy`, `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD=DemoNB2026!`.

Sin estos pasos, el CTA/tour llegan a `/admin-login` pero el botón demo falla con "No se pudo iniciar la demo (¿el usuario demo existe en Supabase?)".

## Reporte final (obligatorio al cerrar la fase)
- Archivos tocados por bloque.
- Screenshots (o descripción) del CTA home y del paso del tour en claro y oscuro, mobile y desktop.
- Confirmación de la cadena end-to-end.
- Lo NO hecho y por qué. Los desvíos del brief se anotan explícitamente.
