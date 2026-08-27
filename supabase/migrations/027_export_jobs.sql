-- Migración 027: trabajos de export en segundo plano
--
-- El export consolidado (103k+ filas) tarda demasiado para generarse
-- dentro de una sola función serverless síncrona. Este trabajo se dispara,
-- se procesa en una Netlify Background Function (sin límite de 10s), y el
-- resultado (CSV) se guarda aquí para que el cliente lo descargue cuando
-- esté listo.

CREATE TABLE IF NOT EXISTS export_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  csv_content   TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON export_jobs (created_at DESC);

ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE export_jobs IS 'Trabajos de generación de export consolidado en segundo plano';
