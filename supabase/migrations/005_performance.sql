-- ============================================================
-- Performance & integridad: índice y unicidad en token
-- ============================================================

-- Índice en registros.token (usado en todas las API routes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_token
  ON registros (token);

-- Índice en intentos_validacion para FK conceptual
CREATE INDEX IF NOT EXISTS idx_intentos_registro
  ON intentos_validacion (id_registro);
