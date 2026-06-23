-- ============================================================
-- Migración 013: UNIQUE constraint en respuestas(id_registro, canal)
-- ============================================================
-- Previene duplicados si se importa dos veces el mismo archivo Infobip.
-- La ruta import-infobip ya hace skip de registros ya completados,
-- pero esta constraint es la red de seguridad en la BD.
--
-- Ejecutar PRIMERO la query de verificación de duplicados.
-- Si devuelve filas, resolverlas antes de aplicar el ALTER TABLE.
-- ============================================================

ALTER TABLE respuestas
  ADD CONSTRAINT respuestas_id_registro_canal_key UNIQUE (id_registro, canal);
