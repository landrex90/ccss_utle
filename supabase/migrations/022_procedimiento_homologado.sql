-- 022: campo para nombre homologado de procedimiento
-- Preserva el valor SIAC original en `procedimiento`
-- y guarda la propuesta legible del catálogo aquí

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS procedimiento_homologado TEXT;
