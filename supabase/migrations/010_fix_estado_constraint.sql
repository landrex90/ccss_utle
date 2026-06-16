-- ============================================================
-- Migración 010: Corregir CHECK constraint de estado
-- Agrega DEPURADO_YA_ATENDIDO y DEPURADO_YA_PROGRAMADO que
-- estaban en tipos pero faltaban en BD.
-- DEPURADO (legacy) se mantiene para registros históricos.
-- ============================================================

ALTER TABLE registros DROP CONSTRAINT IF EXISTS registros_estado_check;

ALTER TABLE registros ADD CONSTRAINT registros_estado_check CHECK (
  estado IN (
    'PENDIENTE',
    'ACTIVO',
    'NO_AUTORIZO',
    'NO_VERIFICADO',
    'INFO_INCORRECTA',
    'DEPURADO_YA_ATENDIDO',
    'DEPURADO_YA_PROGRAMADO',
    'DEPURADO_RENUNCIA',
    'NO_ASEGURADO',
    'DEPURADO'  -- legacy: mantener para registros históricos
  )
);
