-- ============================================================
-- Migración 019 — dia_envio para envíos escalonados
-- Aplica cuando un paciente tiene múltiples registros en lista
-- de espera: cada registro se envía en un día diferente para
-- evitar que el paciente reciba varios correos el mismo día.
-- ============================================================

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS dia_envio INTEGER DEFAULT NULL;

-- Índice para que el script de envío filtre rápido por campaña + día
CREATE INDEX IF NOT EXISTS idx_registros_dia_envio
  ON registros (encuesta_campana_id, dia_envio)
  WHERE correo_enviado_at IS NULL;
