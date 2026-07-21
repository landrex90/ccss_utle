-- Migración 018: Enriquecimiento demográfico
-- Agrega columnas de la BD fuente (BD_BOT_Borrador_QA) que no fueron importadas inicialmente.
-- Se pueblan via script _enriquecimiento-demografico.js usando doble llave: id_registro + numero_asegurado

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS edad              NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS anio_registro     INTEGER,
  ADD COLUMN IF NOT EXISTS modalidad_asegurado TEXT,
  ADD COLUMN IF NOT EXISTS sexo              TEXT,
  ADD COLUMN IF NOT EXISTS provincia         TEXT,
  ADD COLUMN IF NOT EXISTS canton            TEXT,
  ADD COLUMN IF NOT EXISTS grado_priorizacion TEXT,
  ADD COLUMN IF NOT EXISTS complejidad       TEXT,
  ADD COLUMN IF NOT EXISTS plazo_espera      INTEGER,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento  DATE;
