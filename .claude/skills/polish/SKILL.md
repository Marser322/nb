---
name: polish
description: Ejecuta un ciclo del loop de perfeccionamiento — toma el siguiente ítem de briefs/POLISH_BACKLOG.md (o el área pasada como argumento), analiza el código a fondo con pensamiento lateral y escribe un brief FASE_NN_polish_*.md listo para que Sonnet lo ejecute. Usar cuando Mario pida "/polish", pulir/perfeccionar un área existente de la app, o continuar el loop de pulido.
---

# /polish — un ciclo del loop de perfeccionamiento

Ejecutás UN ciclo: seleccionar área → explorar código real → análisis profundo → escribir brief para Sonnet → actualizar backlog. El entregable es el brief; **no implementás los cambios** en este ciclo.

Principio rector: **simple pero profundo**. Llevar la función existente al máximo de su valor sin agregar superficie. Si una idea es una feature nueva, va como nota a `briefs/ROADMAP_CRECIMIENTO.md`, no al brief.

## Paso 1 — Selección y cierre del ciclo anterior

1. Leé `briefs/POLISH_BACKLOG.md`.
2. Cierre del ciclo anterior: si algún ítem está en `brief listo (FASE_NN)`, buscá en `git log --oneline --all` commits que referencien esa fase; si existen, pasalo a `ejecutado` y completá su fila del historial.
3. Elegí el ítem: el que pasó Mario como argumento, o el primer `pendiente` de la cola. Marcálo `en análisis`.

## Paso 2 — Exploración real

- Leé el código del área ahora; no confíes en memoria, docs ni en descripciones del backlog (salvo pre-análisis fechados, que igual se verifican por muestreo).
- Toda afirmación que vaya al brief lleva ancla `archivo:línea` verificada en este ciclo.
- Si el área es amplia, lanzá agentes Explore en paralelo con focos concretos.
- Buscá activamente ganchos reutilizables: `src/lib/constants.ts`, `src/lib/booking.ts`, `src/lib/features.ts`, `src/lib/utils.ts`, RPCs en `src/lib/supabase_schema.sql`, stores, componentes ui/ existentes.

## Paso 3 — Análisis profundo + pensamiento lateral (el corazón del ciclo)

Respondé por escrito, antes de redactar el brief:

- **(a) Máximo valor**: ¿cuál es el techo de esta función con su alcance actual? ¿Qué pregunta/necesidad real del usuario (cliente uruguayo, dueño, barbero) queda hoy sin resolver que esta misma función podría resolver?
- **(b) Reutilización**: ¿qué ganchos existentes lo resuelven sin código nuevo o con mínimo código? Preferir siempre extender un mecanismo existente a inventar uno.
- **(c) Qué NO se hace (anti-monstruo)**: lista explícita de exclusiones del ciclo. Todo lo que huela a feature nueva se anota en `ROADMAP_CRECIMIENTO.md` y se excluye del brief.

## Paso 4 — Escribir el brief

Archivo: `briefs/FASE_NN_polish_<área>.md`. NN continúa la numeración vigente de `briefs/` (verificá el máximo actual; la 19 ya existe). Seguí este esqueleto (formato de la casa):

```markdown
# FASE NN — Polish: <área>

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del <fecha>).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: <una frase>

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas)
- <hecho> (`ruta/archivo.tsx:línea`)

## Análisis (máximo valor / qué NO se hace)
- Valor a extraer: <...>
- Fuera de alcance en este ciclo: <lista anti-monstruo>

## Trabajo — Base de datos (si aplica)
1. Nueva migración `supabase/migrations/0NN_*.sql` idempotente. NO aplicarla a la DB (la corre Mario en el SQL Editor). Replicar en `src/lib/supabase_schema.sql` y `supabase/migrations/999_FULL_SETUP.sql`.

## Trabajo — App
### Bloque A — <independiente, copiable a una sesión propia>
### Bloque B — ...

## Parte manual (Mario)
- <pasos en Supabase Dashboard / Vercel / env vars, si los hay>

## Verificación (obligatoria antes de reportar)
- `npm run build` y `npm run lint` en verde.
- Prueba manual paso a paso en navegador, ambos temas, y a 375px.

## Criterios de aceptación
- <observables y chequeables>

## Restricciones
- Rama `feat/*`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard (`if (!features.X) return`, `if (loading) return`) va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels de citas y órdenes viven en `src/lib/constants.ts` — no duplicar strings.
```

## Paso 5 — Actualizar backlog y reportar

1. En `briefs/POLISH_BACKLOG.md`: ítem → `brief listo (FASE_NN)` y agregá la fila al historial (fecha, ítem, brief, ejecución pendiente).
2. Si surgieron ideas de features nuevas, agregálas a `ROADMAP_CRECIMIENTO.md` con una línea cada una.
3. Reportale a Mario: resumen del análisis (valor, exclusiones) + ruta del brief listo para copiar a Sonnet.
