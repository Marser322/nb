# Briefs de implementación — Mini-CRM NB Barber

Plan aprobado el 2026-07-05 (auditoría post-integración de imágenes). Segunda tanda (Fases 7–10, agendado sólido + disponibilidad + contabilidad + módulos) aprobada el 2026-07-05. Cada archivo es un brief **autocontenido** para ejecutar en una sesión independiente.

## Estado (actualizado 2026-07-05, post-auditoría)

- **Hechas**: FASE_0, 1, 2, 3, 4 y **7** (commiteadas; remates de auditoría aplicados por Fable: fix `branches.active` en admin/citas y `999_FULL_SETUP.sql` consolidado 001→010).
- **Pista GPT-5.5** (paralela): `GPT_assets_fase5_fase6.md` — retratos de barberos faltantes → FASE_5 → FASE_6.
- **Pista Gemini** (secuencial): FASE_8 → FASE_9 → FASE_10.

## Orden de ejecución

```
Pista GPT-5.5:  assets → FASE_5 → FASE_6
Pista Gemini:   FASE_8 → FASE_9 → FASE_10
```

- Las pistas no comparten archivos (territorios delimitados en cada brief). Si Gemini llega a FASE_10 antes de que GPT termine la 5, FASE_10 gatea los módulos existentes y no espera.
- **FASE_9 es independiente de la 8**; FASE_10 va última (gatea módulos de las anteriores).
- **Riesgo n.º 1 de la segunda tanda**: el EXCLUDE de 009 (ya aplicado) falla si hay citas solapadas en producción — correr SIEMPRE el query de diagnóstico del brief F7 antes de migrar una DB con datos. Verificar además el schema real desplegado (drift conocido: `branches.active` es el nombre real — la 011 de F8 lo renombra a `is_active`; CHECKs de `cash_movements` en inglés vs inserts en español — lo normaliza la 012 de F9).

## Reglas transversales (aplican a TODOS los briefs)

- Toda la UI en **español** (voseo uruguayo en textos al usuario: "tenés", "usá").
- Tema oscuro con acento dorado: usar tokens existentes (`primary`, `.glass-card`), nunca colores hardcodeados.
- Reusar: `formatPrice` y helpers de `src/lib/utils.ts`, labels/colores de estados de `src/lib/constants.ts`, toasts con `sonner`, patrón Dialog+Table+Switch de las páginas admin existentes (ver `src/app/admin/servicios/page.tsx` y `productos/page.tsx` como referencia).
- **`npm run build` y `npm run lint` deben pasar antes de dar por cerrada cada fase.**
- Nada de realtime, colas, ni APIs pagas.
- Migraciones SQL: se corren a mano en el SQL Editor de Supabase (convención del proyecto, ver headers de `005`/`006`). Todo cambio de schema se replica en el espejo `src/lib/supabase_schema.sql` y en `supabase/migrations/999_FULL_SETUP.sql`.
- Commits atómicos por tarea, mensajes en el estilo del historial (`feat:`, `fix:`, `chore:` en español).
