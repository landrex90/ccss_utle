-- Migración 024: log de descargas de Excel (auditoría)
--
-- Cada vez que alguien descarga un Excel (consolidado, registros de campaña,
-- o respuestas de campaña) queda registrado quién y cuándo.

CREATE TABLE IF NOT EXISTS descargas_log (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  tipo_export   TEXT NOT NULL,          -- 'consolidado' | 'registros' | 'respuestas'
  campana_id    TEXT,                    -- NULL para el consolidado
  descargado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_descargas_log_descargado_at ON descargas_log (descargado_at DESC);

ALTER TABLE descargas_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE descargas_log IS 'Auditoría: quién descargó qué Excel y cuándo';
