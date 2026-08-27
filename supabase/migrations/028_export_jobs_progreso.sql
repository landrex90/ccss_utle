-- Migración 028: progreso incremental para export_jobs
--
-- Las funciones programadas de Netlify tienen un límite de 30 segundos,
-- insuficiente para traer ~103k registros de una vez. Se agrega
-- next_offset para que cada ejecución de la función procese un pedazo
-- y continúe donde quedó en la siguiente ejecución (cada minuto).

ALTER TABLE export_jobs
  ADD COLUMN IF NOT EXISTS next_offset INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_filas INT;
