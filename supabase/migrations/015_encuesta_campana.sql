-- ============================================================
-- Migración 015: identificador de campaña encuesta independiente
-- ============================================================
-- Separa el seguimiento de la campaña warmup (campana_id) del
-- seguimiento de la campaña encuesta (encuesta_campana_id).
-- Ambos coexisten sin pisarse en el mismo registro.
-- ============================================================

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS encuesta_campana_id TEXT;

-- Índice para filtrar y agrupar por lote de encuesta
CREATE INDEX IF NOT EXISTS idx_registros_encuesta_campana_id
  ON registros (encuesta_campana_id)
  WHERE encuesta_campana_id IS NOT NULL;
