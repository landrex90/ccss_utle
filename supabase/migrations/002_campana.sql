-- ============================================================
-- Migración 002: Identificador de campaña
-- Permite correlacionar respuestas por envío de correo
-- ============================================================

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS campana_id TEXT;

-- Índice para filtrar y agrupar por campaña
CREATE INDEX IF NOT EXISTS idx_registros_campana
  ON registros (campana_id);

-- Comentario: el formato recomendado es YYYY-MM-DD_Hospital_Especialidad
-- Ejemplo: 2026-05-01_HospMexico_Cardiologia
