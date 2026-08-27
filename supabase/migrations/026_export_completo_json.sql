-- Migración 026: corrige get_export_completo — RETURNS TABLE seguía
-- topado por el límite de 1000 filas de PostgREST (aplica también a RPCs
-- que devuelven un rowset). Se cambia a RETURNS JSON con json_agg, que
-- para PostgREST es "una sola fila" y por lo tanto no se pagina.

DROP FUNCTION IF EXISTS get_export_completo();

CREATE OR REPLACE FUNCTION get_export_completo()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT
      r.id_registro, r.nombre_paciente, r.numero_asegurado, r.correo, r.telefono,
      r.especialidad, r.centro_medico, r.tipo_atencion, r.nombre_servicio,
      r.lateralidad, r.procedimiento, r.tipo_consulta, r.fecha_cita, r.hora_cita,
      r.campana_id, r.warmup_estado, r.warmup_enviado_at,
      r.encuesta_campana_id, r.correo_estado, r.correo_enviado_at, r.correo_abierto_at, r.correo_click_at,
      r.whatsapp_estado, r.llamada_estado,
      r.recordatorio_campana_id, r.recordatorio_correo_enviado_at, r.segundo_contacto_canal,
      r.estado, r.encuesta_completada_at, r.created_at
    FROM registros r
    WHERE r.encuesta_campana_id IS NOT NULL
    ORDER BY r.id_registro
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_export_completo() TO service_role;
