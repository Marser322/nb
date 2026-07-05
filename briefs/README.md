# Briefs de implementación — Mini-CRM NB Barber

Plan aprobado el 2026-07-05 (auditoría post-integración de imágenes). Segunda tanda (Fases 7–10, agendado sólido + disponibilidad + contabilidad + módulos) aprobada el 2026-07-05. Cada archivo es un brief **autocontenido** para ejecutar en una sesión independiente.

## Orden de ejecución

```
FASE_0 (independiente, puede ir en paralelo)
FASE_1 → FASE_2 → FASE_3 → FASE_4 → FASE_5
FASE_6 (despliegue, al final de la primera tanda)

Segunda tanda (requiere 1–4):
FASE_7 → FASE_8 → FASE_9 → FASE_10
```

- **FASE_1 es prerequisito duro de 2–5**: sin sesión Supabase de admin real, el RLS (migración 006) devuelve datos vacíos en todo el panel.
- FASE_2 crea la migración `007_crm.sql` que consumen las fases 3 y 4.
- **FASE_7 es prerequisito de 8 y 9** (extensión btree_gist y RPC `book_appointment` de la migración 009). FASE_9 es independiente de la 8. FASE_10 va última (gatea módulos de las anteriores).
- **Riesgo n.º 1 de la segunda tanda**: el EXCLUDE de 009 falla si hay citas solapadas en producción — correr SIEMPRE el query de diagnóstico incluido en el brief antes de migrar. Verificar además el schema real desplegado (drift conocido: `branches.active` vs `is_active`; CHECKs de `cash_movements` en inglés vs inserts en español).

## Reglas transversales (aplican a TODOS los briefs)

- Toda la UI en **español** (voseo uruguayo en textos al usuario: "tenés", "usá").
- Tema oscuro con acento dorado: usar tokens existentes (`primary`, `.glass-card`), nunca colores hardcodeados.
- Reusar: `formatPrice` y helpers de `src/lib/utils.ts`, labels/colores de estados de `src/lib/constants.ts`, toasts con `sonner`, patrón Dialog+Table+Switch de las páginas admin existentes (ver `src/app/admin/servicios/page.tsx` y `productos/page.tsx` como referencia).
- **`npm run build` y `npm run lint` deben pasar antes de dar por cerrada cada fase.**
- Nada de realtime, colas, ni APIs pagas.
- Migraciones SQL: se corren a mano en el SQL Editor de Supabase (convención del proyecto, ver headers de `005`/`006`). Todo cambio de schema se replica en el espejo `src/lib/supabase_schema.sql` y en `supabase/migrations/999_FULL_SETUP.sql`.
- Commits atómicos por tarea, mensajes en el estilo del historial (`feat:`, `fix:`, `chore:` en español).
