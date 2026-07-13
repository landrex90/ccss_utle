-- ============================================================
-- Migración 014: campos warmup para trazabilidad campaña aviso previo
-- ============================================================
-- Permite identificar qué registros recibieron el email de aviso
-- previo (warmup) de CLEO antes del envío de la encuesta.
-- ============================================================

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS warmup_enviado_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warmup_estado      TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (warmup_estado IN ('pendiente', 'enviado', 'rebotado'));

-- Índice para filtrar rápido en el script de envío y en dashboards
CREATE INDEX IF NOT EXISTS idx_registros_warmup_estado
  ON registros (warmup_estado);
