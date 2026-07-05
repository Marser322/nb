# FASE 5 — Dashboard CRM

> Leer primero `briefs/README.md`. **Requiere Fases 1–4** (RPC `get_clients_overview`, `send-whatsapp-dialog`, filtros de agenda).

## Contexto

El dashboard actual (`src/app/admin/dashboard/page.tsx`) muestra KPIs operativos (citas hoy/mes, ingresos, stock bajo). Falta la mirada CRM: captación, retención y qué/quién rinde más. Cero SQL nuevo: todo sale del RPC de la Fase 2 y queries simples — el volumen de una barbería local no justifica agregaciones server-side extra.

## Tareas

Todas en `src/app/admin/dashboard/page.tsx`. Si el archivo supera ~350 líneas, extraer las secciones nuevas a `src/components/admin/crm-cards.tsx`.

### 1. Clientes nuevos del mes

- Card de stat junto a las existentes: `select count` de `profiles` con `role = 'cliente'` y `created_at >= startOfMonth(new Date())` (date-fns).

### 2. Clientes inactivos — reactivación en un click

- Card/lista: reusar `supabase.rpc('get_clients_overview')` y filtrar en memoria los que tienen `last_visit` null o mayor a `INACTIVE_DAYS` (constante de Fase 2).
- Mostrar los 5–10 más valiosos u ordenados por `last_visit` más reciente (los que se están enfriando ahora son los más recuperables). Cada fila: nombre, días desde la última visita, total gastado, y botón `MessageCircle` que abre `send-whatsapp-dialog` (Fase 3) con el cliente precargado — el loop de reactivación completo sin salir del dashboard.
- Link "Ver todos" → `/admin/clientes?filtro=inactivos` (la lista ya respeta ese param desde la Fase 2).

### 3. Top servicios y top barberos (últimos 90 días)

- Una query: `appointments` con `status = 'completed'` y `appointment_date >= hoy - 90 días`, con `service:services(name, price), barber:barbers(name)`.
- Agregación en JS: por servicio (cantidad + ingresos) y por barbero (cantidad + ingresos).
- Render: dos Cards con listas rankeadas; barras horizontales hechas con divs y `bg-primary` proporcional al máximo — **sin librería de charts** (consistente con el estilo del panel).

### 4. Limpieza

- La card "Citas Hoy" y la lista "Agenda de Hoy" hoy duplican información — reordenar la grilla para que las stats nuevas (clientes nuevos, inactivos) tengan lugar sin duplicados.

## Criterios de aceptación

- [ ] Clientes nuevos del mes coincide con un count manual en la DB.
- [ ] La lista de inactivos coincide con `/admin/clientes?filtro=inactivos`; el botón abre el dialog de WhatsApp con nombre y teléfono precargados y registra el log.
- [ ] Top servicios/barberos coincide con una verificación manual (al menos un caso).
- [ ] Dashboard sigue cargando con skeletons y sin layout shift notable.
- [ ] `npm run build` y `npm run lint` pasan.
