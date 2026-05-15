-- ============================================================
-- v3.1 – Nuevos campos clínicos y estado NO_ASEGURADO
-- ============================================================

-- Nuevos campos clínicos en registros
ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS procedimiento TEXT,
  ADD COLUMN IF NOT EXISTS tipo_consulta TEXT,
  ADD COLUMN IF NOT EXISTS fecha_cita    TEXT,
  ADD COLUMN IF NOT EXISTS hora_cita     TEXT;

-- Ampliar el CHECK de estado para incluir NO_ASEGURADO
ALTER TABLE registros
  DROP CONSTRAINT IF EXISTS registros_estado_check;

ALTER TABLE registros
  ADD CONSTRAINT registros_estado_check
  CHECK (estado IN (
    'PENDIENTE', 'NO_AUTORIZO', 'NO_VERIFICADO',
    'INFO_INCORRECTA', 'DEPURADO_YA_ATENDIDO',
    'DEPURADO_YA_PROGRAMADO', 'DEPURADO_RENUNCIA',
    'NO_ASEGURADO', 'ACTIVO'
  ));
