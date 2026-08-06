-- ============================================================
-- Migración 020 — paso_3_error en respuestas
-- Captura el texto libre que reporta el paciente cuando indica
-- que la información de su caso es incorrecta (paso 3 del flujo
-- WhatsApp COCO). Equivale al campo paso_3_error del desarrollador.
-- ============================================================

ALTER TABLE respuestas
  ADD COLUMN IF NOT EXISTS paso_3_error TEXT DEFAULT NULL;
