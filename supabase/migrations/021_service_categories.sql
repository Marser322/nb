-- FASE 26: Categorías de servicios (códigos EN, labels ES en constants.ts — patrón de la 012)
-- Correr a mano en el SQL Editor de Supabase (convención del proyecto).

ALTER TABLE services ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'corte';
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_category_check;
ALTER TABLE services ADD CONSTRAINT services_category_check
  CHECK (category IN ('corte', 'barba', 'combo', 'tratamiento', 'color', 'otro'));

-- Backfill de seeds existentes
UPDATE services SET category = 'combo' WHERE name ILIKE '%+%' OR name ILIKE '%combo%';
UPDATE services SET category = 'barba' WHERE name ILIKE '%barba%' AND category = 'corte';
