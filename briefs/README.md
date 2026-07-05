# Briefs de implementación — Mini-CRM NB Barber

Plan aprobado el 2026-07-05 (auditoría post-integración de imágenes). Cada archivo es un brief **autocontenido** para ejecutar en una sesión independiente.

## Orden de ejecución

```
FASE_0 (independiente, puede ir en paralelo)
FASE_1 → FASE_2 → FASE_3 → FASE_4 → FASE_5
FASE_6 (despliegue, al final)
```

- **FASE_1 es prerequisito duro de 2–5**: sin sesión Supabase de admin real, el RLS (migración 006) devuelve datos vacíos en todo el panel.
- FASE_2 crea la migración `007_crm.sql` que consumen las fases 3 y 4.

## Reglas transversales (aplican a TODOS los briefs)

- Toda la UI en **español** (voseo uruguayo en textos al usuario: "tenés", "usá").
- Tema oscuro con acento dorado: usar tokens existentes (`primary`, `.glass-card`), nunca colores hardcodeados.
- Reusar: `formatPrice` y helpers de `src/lib/utils.ts`, labels/colores de estados de `src/lib/constants.ts`, toasts con `sonner`, patrón Dialog+Table+Switch de las páginas admin existentes (ver `src/app/admin/servicios/page.tsx` y `productos/page.tsx` como referencia).
- **`npm run build` y `npm run lint` deben pasar antes de dar por cerrada cada fase.**
- Nada de realtime, colas, ni APIs pagas.
- Migraciones SQL: se corren a mano en el SQL Editor de Supabase (convención del proyecto, ver headers de `005`/`006`). Todo cambio de schema se replica en el espejo `src/lib/supabase_schema.sql` y en `supabase/migrations/999_FULL_SETUP.sql`.
- Commits atómicos por tarea, mensajes en el estilo del historial (`feat:`, `fix:`, `chore:` en español).
