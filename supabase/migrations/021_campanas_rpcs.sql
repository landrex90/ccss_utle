-- 021: RPCs para agregación de campañas sin límite de filas en cliente

-- Agrupa registros por campana_id + estado en la BD (para admin/campanas)
-- Evita traer 100k+ filas al cliente
CREATE OR REPLACE FUNCTION get_campanas_by_campana_id()
RETURNS TABLE(campana_id text, estado text, cnt bigint)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COALESCE(r.campana_id, '(sin campaña)')::text,
    COALESCE(r.estado, 'PENDIENTE')::text,
    COUNT(*)
  FROM registros r
  GROUP BY r.campana_id, r.estado
  ORDER BY r.campana_id DESC, r.estado
$$;

-- Deriva el mapeo encuesta_campana_id → whatsapp_campana_id desde los datos reales
-- Elimina la necesidad de un mapa hardcodeado en el código
CREATE OR REPLACE FUNCTION get_wa_encuesta_map()
RETURNS TABLE(encuesta_campana_id text, whatsapp_campana_id text)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT DISTINCT
    encuesta_campana_id::text,
    whatsapp_campana_id::text
  FROM registros
  WHERE encuesta_campana_id IS NOT NULL
    AND whatsapp_campana_id IS NOT NULL
  ORDER BY encuesta_campana_id
$$;
