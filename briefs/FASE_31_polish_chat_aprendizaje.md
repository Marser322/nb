# FASE 31 — Polish: Chat que aprende (auto-aprendizaje con guardrails)

> Ejecutor: Sonnet. Planificado por Fable (loop /polish, ciclo del 2026-07-09).
> Leer primero `briefs/README.md` (reglas transversales).
> **Objetivo**: que cada pregunta al chat quede registrada, que el asistente construya solo una base de conocimiento curable desde el admin, y que ese conocimiento se inyecte al prompt — sin que jamás pueda pisar los datos vivos de Supabase.

CONTEXTO GENERAL: Next.js 16 + React 19 + TypeScript estricto + Tailwind 4 + shadcn/ui + framer-motion + Supabase. UI en español (voseo uruguayo). Tema híbrido claro/oscuro con tokens (`bg-background`, `primary`, `.glass-card`) — nunca colores hardcodeados.

## Estado actual (anclas verificadas)

- `src/app/api/chat/route.ts` — cascada secuencial Gemini → OpenAI → motor de reglas local (`:555-566`); `callLLM` con timeout 10s que nunca lanza (`:136-190`). **No hay ni un INSERT en todo el archivo**: las preguntas de los usuarios no dejan rastro.
- Conocimiento del prompt: queries live a `app_settings`/`services`/`barbers`/`products`/`lookbook`/`branches` (`:290-350`) con fallback estático (`:356-359`); prompt cliente con "INFORMACIÓN OFICIAL" + políticas hardcodeadas (`:509-531`); instrucción de salida estructurada `{content, data}` (`:535-547`).
- Motor de reglas local inline (`:568-802`) sobre `normalizedUserQuery` (minúsculas sin tildes, `:198`). Ramas genéricas de "no supe responder": admin `:637-639`, cliente `:793-795` — hoy son indistinguibles de una respuesta buena; nadie se entera de qué preguntas caen ahí.
- `src/components/chat/AiAssistant.tsx` — persistencia solo en `sessionStorage` por pestaña (`:84`, `:145`); POST a `/api/chat` con `{ mode, messages }` (`:190-194`).
- `src/lib/features.ts` — `FeatureKey` con 8 flags (`:3`), `DEFAULTS` fail-open (`:6-15`); el editor visual está en `src/app/admin/configuracion/page.tsx` con `FEATURE_ICONS`/`FEATURE_TITLES`/`FEATURE_IMAGES` (`:19-49`) y query `like("key", "feature.%")` (`:99`).
- Flags seed via `supabase/migrations/013_app_settings.sql` (tabla `app_settings` + policies `Public read feature flags` / `Admins manage settings`) y `015_more_feature_flags.sql` (patrón `INSERT ... ON CONFLICT (key) DO NOTHING`).
- Nav admin en `src/app/admin/layout.tsx` (`:44-116`) con gating por feature (`:136-137`); rutas admin en `src/lib/constants.ts:250-268`.
- Next `16.1.4` (`package.json:34`) → `after()` de `next/server` disponible para trabajo post-respuesta sin sumar latencia al usuario.
- Numeración: la FASE 30 (pendiente de ejecución) reserva la migración `022_message_templates.sql` → esta fase usa la **023**.

## Análisis (máximo valor / qué NO se hace)

**Valor a extraer**: el chat ya tiene datos vivos y deep links, pero es amnésico en dos sentidos: (1) el negocio no sabe qué preguntan los clientes ni qué cae al fallback genérico — el insumo de mejora más barato que existe; (2) todo lo que no está en la "información oficial" (¿tienen estacionamiento? ¿atienden niños? ¿hacen cejas?) se responde con evasivas para siempre. Con una tabla de logs + una base de conocimiento que el propio LLM alimenta en background (elección de Mario: auto-aprendizaje) y un panel para verlo/editarlo/borrarlo, el chat mejora solo con el uso y el dueño conserva control editorial total.

**Guardrails obligatorios del auto-aprendizaje** (innegociables, van en código y en prompt):
1. Lo aprendido se inyecta SIEMPRE después de la información oficial y con la etiqueta "si contradice los datos oficiales, los datos oficiales ganan".
2. El extractor tiene prohibido aprender precios, horarios, disponibilidad o datos personales (eso vive en Supabase y cambia).
3. Todo entra por RPCs `SECURITY DEFINER` con límites duros (longitud, cap de filas) — nunca INSERT directo del rol anon.
4. Flag `feature.chat_aprendizaje` apaga la extracción automática entera (el logging de preguntas es analytics y queda siempre activo).

**Reutilización**: `callLLM` ya existe para la llamada de extracción; `parseAssistantText` ya parsea JSON con fences; el patrón de flags (migración 015 + `features.ts` + configuración) se copia tal cual; el panel usa los mismos Tabs/Table/Dialog/Switch de `/admin/mensajes`.

**Fuera de alcance en este ciclo (anti-monstruo)**:
- NO embeddings/pgvector ni búsqueda semántica (matching por keywords alcanza para decenas de entradas) — anotado en roadmap.
- NO aprendizaje de conversaciones completas ni de contexto multi-turno: solo pares pregunta→respuesta.
- NO auto-aprendizaje en modo admin (el coach del CRM no inventa procedimientos del negocio).
- NO function calling ni reserva desde el chat (ya está en roadmap, ítem 14).
- NO dashboard de analytics con gráficas: tabla + contadores simples.
- NO retención/purga automática de logs (se anota como tarea manual futura).

## Trabajo — Base de datos

1. Nueva migración `supabase/migrations/023_chat_learning.sql`, **idempotente**. NO aplicarla a la DB (la corre Mario en el SQL Editor). Replicar en `src/lib/supabase_schema.sql` y `supabase/migrations/999_FULL_SETUP.sql` (ojo: la FASE 30 también toca esos espejos — si ya está mergeada, agregar debajo; si no, cuidar el orden al mergear).

```sql
CREATE TABLE IF NOT EXISTS chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode TEXT NOT NULL CHECK (mode IN ('client','admin')),
    question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    answer TEXT,
    provider TEXT NOT NULL CHECK (provider IN ('gemini','openai','rules')),
    was_fallback BOOLEAN NOT NULL DEFAULT false, -- cayó en la rama genérica "no supe responder"
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS chat_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_knowledge_normalized ON chat_knowledge (normalized_question);
```

2. RLS: `chat_logs` → SELECT/DELETE solo `is_admin()`, sin policy de INSERT (entra solo por RPC). `chat_knowledge` → SELECT público de filas `is_active = true` (el route corre como anon y necesita leerlas), ALL para `is_admin()`. Patrón de policies con `DROP POLICY IF EXISTS` como en `013_app_settings.sql`.

3. RPCs `SECURITY DEFINER` (mismo estilo que las RPC de booking en `src/lib/supabase_schema.sql`):
   - `log_chat_message(p_mode, p_question, p_answer, p_provider, p_was_fallback)` — valida longitudes (question ≤ 500 chars, answer ≤ 4000; trunca, no falla), normaliza (lower + sin tildes, con `translate`) e inserta. `GRANT EXECUTE` a `anon, authenticated`.
   - `learn_chat_knowledge(p_question, p_answer)` — valida longitudes (question ≤ 300, answer ≤ 1000), normaliza, y hace `INSERT ... ON CONFLICT (normalized_question) DO NOTHING`; **cap duro**: si ya hay ≥ 200 filas con `source='auto'`, no inserta (RETURN sin error). `GRANT EXECUTE` a `anon, authenticated`.

4. Flag: `INSERT INTO app_settings ... ('feature.chat_aprendizaje', 'true'::jsonb, 'Auto-aprendizaje del asistente IA (base de conocimiento)') ON CONFLICT (key) DO NOTHING` (patrón de `015_more_feature_flags.sql`).

## Trabajo — App

### Bloque A — Flag y tipos

1. `src/lib/features.ts`: agregar `'chat_aprendizaje'` a `FeatureKey` (`:3`) y a `DEFAULTS` (`:6-15`, en `true`).
2. `src/app/admin/configuracion/page.tsx`: agregar `feature.chat_aprendizaje` a `FEATURE_ICONS` (icono `Bot` de lucide), `FEATURE_TITLES` ("Auto-aprendizaje del Asistente IA") y `FEATURE_IMAGES` (reusar `/images/modulos/mensajes.webp` — no hay asset propio y el componente no tiene fallback de imagen).
3. `src/types/database.types.ts`: tipos `ChatLog` y `ChatKnowledge` espejo de las tablas.

### Bloque B — route.ts: inyección + logging + extracción en background

Todo en `src/app/api/chat/route.ts`; ninguna parte puede romper el chat si falla (try/catch + omitir, mismo criterio que availability `:389-445`).

1. **Leer conocimiento**: junto a los fetch live (`:290-350`), traer hasta 40 filas de `chat_knowledge` activas (más recientes primero). Si la query falla → lista vacía.
2. **Inyectar al prompt cliente** (después de `userAppointmentPrompt`, `:496-507`): bloque
   `CONOCIMIENTO APRENDIDO (generado automáticamente a partir de conversaciones; puede contener errores): [...pares P/R...]. REGLA: si algo de este bloque contradice la INFORMACIÓN OFICIAL o los datos en vivo, la información oficial SIEMPRE gana. Nunca uses este bloque para precios, horarios o disponibilidad.`
   Solo en modo cliente.
3. **Conocimiento en el motor de reglas**: en la rama genérica del cliente (`:793-795`), antes de rendirse, buscar la entrada de `chat_knowledge` cuya `normalized_question` comparta ≥ 2 tokens (palabras de 4+ letras) con `normalizedUserQuery`; si hay match, responder con su `answer`. Así el fallback local también aprende.
4. **Registrar el intercambio**: detectar `wasFallback` (la respuesta salió de una rama genérica `:637-639` / `:793-795`) y `provider` (`"gemini" | "openai" | "rules"`). Tras armar la respuesta, usar `after()` de `next/server` para llamar la RPC `log_chat_message` — fire-and-forget con catch. Registrar solo el último mensaje del usuario, no el historial.
5. **Extracción automática (el aprendizaje)**: dentro del mismo `after()`, SOLO si: modo cliente, `feature.chat_aprendizaje` activo (ya se leen los flags en `:292-302`; agregar la key al objeto `activeFeatures` `:361-370`), la respuesta vino de un LLM, y la pregunta no matchea conocimiento existente. Entonces una llamada extra a `callLLM` (Gemini; si no hay key, OpenAI; si ninguna, no se aprende) con un prompt extractor estricto:
   - Decide si el par P/R contiene información **general y reutilizable** sobre la barbería que NO esté en la información oficial.
   - PROHIBIDO aprender: precios, horarios, disponibilidad, promociones con fecha, datos personales del usuario, citas puntuales, nada inventado por el asistente sin base.
   - Responde SOLO JSON: `{ "learn": boolean, "question": "...", "answer": "..." }` (pregunta reformulada genérica, respuesta ≤ 2 frases).
   Parsear con la misma limpieza de fences que `parseAssistantText` (`:118-121`); si `learn === true`, llamar RPC `learn_chat_knowledge`. Todo con try/catch silencioso.

### Bloque C — Panel `/admin/asistente`

1. `src/lib/constants.ts`: `ADMIN_ASISTENTE: '/admin/asistente'` junto a las demás (`:250-268`). Entrada "Asistente IA" en el nav de `src/app/admin/layout.tsx` (icono `Bot`), sin gating de feature (el panel siempre es visible; lo que se apaga es la extracción).
2. Nueva página `src/app/admin/asistente/page.tsx` siguiendo la estructura de `/admin/mensajes` (Tabs + Table + Dialog + Switch, `src/app/admin/mensajes/page.tsx:244-509`):
   - **Tab "Preguntas"**: tabla de `chat_logs` (fecha, modo, pregunta, proveedor, badge "Sin respuesta" si `was_fallback`), filtro toggle "Solo sin respuesta", buscador en memoria (patrón `:216-223`). Arriba, card compacta con las 5 `normalized_question` más repetidas (agregación en memoria sobre los últimos 500 logs). Cada fila con acción "Enseñar respuesta" → abre diálogo con la pregunta precargada y textarea de respuesta → inserta en `chat_knowledge` con `source: 'manual'` (insert directo, el admin pasa RLS).
   - **Tab "Conocimiento"**: tabla de `chat_knowledge` (pregunta, respuesta, badge `Auto`/`Manual`, switch activo, editar, eliminar) reusando el patrón CRUD de plantillas (`:358-507`). Banner superior: estado del flag `chat_aprendizaje` con link a `/admin/configuracion`, y aviso "Las entradas automáticas pueden contener errores: revisalas y desactivá lo que no corresponda".

## Parte manual (Mario)

- Correr `supabase/migrations/023_chat_learning.sql` en el SQL Editor (después de la 022 si ejecutaste la FASE 30).
- Verificar que `GEMINI_API_KEY` (o `OPENAI_API_KEY`) esté seteada en Vercel — sin key no hay extracción automática (el logging y el panel funcionan igual).
- A la semana de uso: entrar a `/admin/asistente` → Conocimiento y depurar lo aprendido.

## Verificación (obligatoria antes de reportar)

- `npm run build` y `npm run lint` en verde.
- Prueba manual en navegador, ambos temas, y a 375px:
  1. Preguntar algo al chat cliente → aparece en `/admin/asistente` → Preguntas con proveedor correcto.
  2. Preguntar algo sin cobertura (ej. "¿tienen estacionamiento?") con LLM activo → responde, y en unos segundos aparece una entrada `Auto` en Conocimiento (o no aparece, si el extractor decidió `learn: false` — verificar el log del server).
  3. Repetir la misma pregunta → la respuesta ahora usa el conocimiento (y con las keys de LLM quitadas en local, el motor de reglas también la responde por keyword match).
  4. Desactivar una entrada desde el panel → deja de inyectarse (siguiente pregunta ya no la usa).
  5. Apagar `feature.chat_aprendizaje` en Configuración → se siguen registrando preguntas pero no aparecen entradas `Auto` nuevas.
  6. "Enseñar respuesta" desde una pregunta sin respuesta → entrada `Manual` activa y usable por el chat.
  7. Preguntar un precio → la respuesta sale de la información oficial live, nunca del conocimiento aprendido.
  8. Simular fallo de DB (sin envs) → el chat responde igual (fallback estático intacto).

## Criterios de aceptación

- Toda pregunta al chat queda en `chat_logs` con proveedor y marca de fallback; el panel las muestra con frecuencias y filtro "sin respuesta".
- El chat aprende solo (flag activo + LLM): pares P/R generales entran a `chat_knowledge` como `Auto`, visibles, editables, desactivables y borrables desde `/admin/asistente`.
- El conocimiento aprendido se inyecta al prompt con prioridad explícita de los datos oficiales; precios/horarios/disponibilidad jamás salen del conocimiento aprendido.
- Cap de 200 entradas auto y dedupe por pregunta normalizada a nivel DB; escrituras del chat solo vía RPC `SECURITY DEFINER`.
- `feature.chat_aprendizaje` apaga la extracción sin afectar logging ni panel; con todo apagado el chat funciona exactamente como hoy.

## Restricciones

- Rama `feat/polish-chat-aprendizaje`; no tocar `main`. Commits atómicos con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Regla de oro de hooks**: cualquier early-return/guard (`if (!features.X) return`, `if (loading) return`) va DESPUÉS de todos los hooks del componente. El build no lo detecta; crashea en runtime.
- Estados/labels viven en `src/lib/constants.ts` — no duplicar strings.
- Nada de lo nuevo puede agregar latencia perceptible al chat (logging y extracción SIEMPRE dentro de `after()`) ni romperlo si la DB/LLM fallan (try/catch + degradación silenciosa, como availability).
- La migración 023 debe ser idempotente y NO aplicarse desde código.
