-- ============================================================
-- Migración 008: Trazabilidad de acceso y completitud
-- ============================================================

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS primer_acceso_at          timestamptz,
  ADD COLUMN IF NOT EXISTS primer_acceso_ip          text,
  ADD COLUMN IF NOT EXISTS primer_acceso_dispositivo text,
  ADD COLUMN IF NOT EXISTS primer_acceso_pais        text,
  ADD COLUMN IF NOT EXISTS primer_acceso_ciudad      text,
  ADD COLUMN IF NOT EXISTS encuesta_completada_at    timestamptz;
