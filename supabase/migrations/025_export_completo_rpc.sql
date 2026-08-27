-- Migración 025: función RPC para el export consolidado
--
-- El export consolidado (~103k registros, 30 columnas) tardaba ~139s
-- paginando de 1000 en 1000 vía PostgREST — muy por encima del límite
-- de ejecución de las funciones serverless (Netlify corta a los 10s).
-- Esta función trae todo en una sola llamada, sin el límite de 1000
-- filas por página que aplica a los GET normales sobre /rest/v1/registros.
--
-- Excluye explícitamente los registros "fantasma" (encuesta_campana_id
-- IS NULL) — nunca deben aparecer en reportes.

CREATE OR REPLACE FUNCTION get_export_completo()
RETURNS TABLE (
  id_registro TEXT,
  nombre_paciente TEXT,
  numero_asegurado TEXT,
  correo TEXT,
  telefono TEXT,
  especialidad TEXT,
  centro_medico TEXT,
  tipo_atencion TEXT,
  nombre_servicio TEXT,
  lateralidad TEXT,
  procedimiento TEXT,
  tipo_consulta TEXT,
  fecha_cita TEXT,
  hora_cita TEXT,
  campana_id TEXT,
  warmup_estado TEXT,
  warmup_enviado_at TIMESTAMPTZ,
  encuesta_campana_id TEXT,
  correo_estado TEXT,
  correo_enviado_at TIMESTAMPTZ,
  correo_abierto_at TIMESTAMPTZ,
  correo_click_at TIMESTAMPTZ,
  whatsapp_estado TEXT,
  llamada_estado TEXT,
  recordatorio_campana_id TEXT,
  recordatorio_correo_enviado_at TIMESTAMPTZ,
  segundo_contacto_canal TEXT,
  estado TEXT,
  encuesta_completada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
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
  WHERE r.encuesta_campana_id IS NOT NULL  -- nunca incluir fantasmas
  ORDER BY r.id_registro;
$$;

GRANT EXECUTE ON FUNCTION get_export_completo() TO service_role;
