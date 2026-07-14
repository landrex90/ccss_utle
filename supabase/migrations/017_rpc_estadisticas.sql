-- ============================================================
-- Migración 017: funciones RPC para dashboard estadísticas
-- Reemplaza descarga masiva de filas con agregaciones SQL.
-- Soporta campañas de cualquier tamaño (1K o 100K pacientes)
-- con el mismo número de llamadas a la API (8 por carga).
-- ============================================================

-- Índice FK faltante en respuestas (crítico para los JOINs)
CREATE INDEX IF NOT EXISTS idx_respuestas_id_registro
  ON respuestas (id_registro);

-- ── 1. Lista de campañas con KPIs de resumen ───────────────
CREATE OR REPLACE FUNCTION get_campanas_list()
RETURNS TABLE(
  id           TEXT,
  total        BIGINT,
  enviado      BIGINT,
  accedieron   BIGINT,
  completado   BIGINT,
  fecha_inicio TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    encuesta_campana_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE correo_estado = 'enviado'),
    COUNT(*) FILTER (WHERE primer_acceso_at IS NOT NULL),
    COUNT(*) FILTER (WHERE encuesta_completada_at IS NOT NULL),
    MIN(correo_enviado_at) FILTER (WHERE correo_enviado_at IS NOT NULL)
  FROM registros
  WHERE encuesta_campana_id IS NOT NULL
  GROUP BY encuesta_campana_id
  ORDER BY MIN(correo_enviado_at) DESC NULLS LAST
$$;

-- ── 2. Estados por campaña ─────────────────────────────────
CREATE OR REPLACE FUNCTION get_campana_estados(p_campana_id TEXT)
RETURNS TABLE(estado TEXT, count BIGINT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(estado, 'DESCONOCIDO'), COUNT(*)
  FROM registros
  WHERE encuesta_campana_id = p_campana_id
  GROUP BY estado
  ORDER BY COUNT(*) DESC
$$;

-- ── 3. Métricas de eficiencia ──────────────────────────────
CREATE OR REPLACE FUNCTION get_campana_eficiencia(p_campana_id TEXT)
RETURNS TABLE(
  minutos_primer_respuesta NUMERIC,
  minutos_promedio         NUMERIC,
  pct_movil                NUMERIC
)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH completados AS (
    SELECT
      EXTRACT(EPOCH FROM (encuesta_completada_at - correo_enviado_at)) / 60.0 AS diff_min,
      primer_acceso_dispositivo
    FROM registros
    WHERE encuesta_campana_id = p_campana_id
      AND encuesta_completada_at IS NOT NULL
      AND correo_enviado_at IS NOT NULL
      AND encuesta_completada_at > correo_enviado_at
      AND EXTRACT(EPOCH FROM (encuesta_completada_at - correo_enviado_at)) <= 604800
  )
  SELECT
    ROUND(MIN(diff_min)),
    ROUND(AVG(diff_min)),
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE primer_acceso_dispositivo LIKE 'Móvil%')
      / NULLIF(COUNT(*), 0)
    )
  FROM completados
$$;

-- ── 4. Especialidades con tasa de respuesta ────────────────
CREATE OR REPLACE FUNCTION get_campana_especialidades(p_campana_id TEXT)
RETURNS TABLE(especialidad TEXT, total_piloto BIGINT, respondieron BIGINT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(especialidad, 'Sin datos'),
    COUNT(*),
    COUNT(*) FILTER (WHERE encuesta_completada_at IS NOT NULL)
  FROM registros
  WHERE encuesta_campana_id = p_campana_id
  GROUP BY especialidad
  ORDER BY COUNT(*) DESC
$$;

-- ── 5. Dispositivos de acceso ──────────────────────────────
-- Devuelve combinaciones únicas de "Tipo / OS / Browser" con su conteo.
-- El cliente JS parsea el string y suma los totales por categoría.
CREATE OR REPLACE FUNCTION get_campana_dispositivos(p_campana_id TEXT)
RETURNS TABLE(dispositivo TEXT, total BIGINT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT primer_acceso_dispositivo, COUNT(*)
  FROM registros
  WHERE encuesta_campana_id = p_campana_id
    AND primer_acceso_dispositivo IS NOT NULL
  GROUP BY primer_acceso_dispositivo
  ORDER BY COUNT(*) DESC
$$;

-- ── 6. Pasos del formulario (JOIN respuestas → registros) ──
-- Devuelve JSONB con todos los conteos y distribuciones.
-- Un solo query reemplaza cientos de llamadas de paginación.
CREATE OR REPLACE FUNCTION get_campana_form_steps(p_campana_id TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'total',              COUNT(*),
    'paso1_si',           COUNT(*) FILTER (WHERE paso_1_consentimiento = 'si_autorizo'),
    'paso2_si',           COUNT(*) FILTER (WHERE paso_2_verificacion   = 'exitosa'),
    'paso3_si',           COUNT(*) FILTER (WHERE paso_3_info_correcta  = 'si'),
    'paso3_no',           COUNT(*) FILTER (WHERE paso_3_info_correcta  = 'no'),
    'paso4_si',           COUNT(*) FILTER (WHERE paso_4_desea_continuar = 'si'),
    'paso4_no',           COUNT(*) FILTER (WHERE paso_4_desea_continuar IN ('no_ya_no_deseo','no_asegurado')),
    'flexible_total',     COUNT(*) FILTER (WHERE paso_4_desea_continuar = 'si' AND paso_5a_flexibilidad_centro IS NOT NULL),
    'paso5_flexible',     COUNT(*) FILTER (WHERE paso_4_desea_continuar = 'si' AND paso_5a_flexibilidad_centro = 'si'),
    'paso5_no_flexible',  COUNT(*) FILTER (WHERE paso_4_desea_continuar = 'si' AND paso_5a_flexibilidad_centro = 'no'),
    'puede_total',        COUNT(*) FILTER (WHERE paso_4_desea_continuar = 'si' AND paso_5b_condiciones_asistir IS NOT NULL),
    'paso5_puede',        COUNT(*) FILTER (WHERE paso_4_desea_continuar = 'si' AND paso_5b_condiciones_asistir = 'si'),
    'paso5_no_puede',     COUNT(*) FILTER (WHERE paso_4_desea_continuar = 'si' AND paso_5b_condiciones_asistir = 'no'),
    'paso6', (
      SELECT COALESCE(jsonb_object_agg(paso_6_medio_contacto, cnt), '{}')
      FROM (
        SELECT r2.paso_6_medio_contacto, COUNT(*) AS cnt
        FROM respuestas r2
        JOIN registros reg2 ON reg2.id_registro = r2.id_registro
        WHERE reg2.encuesta_campana_id = p_campana_id
          AND r2.paso_6_medio_contacto IS NOT NULL
        GROUP BY r2.paso_6_medio_contacto
      ) sub
    ),
    'motivo_retiro', (
      SELECT COALESCE(jsonb_object_agg(motivo_retiro, cnt), '{}')
      FROM (
        SELECT r2.motivo_retiro, COUNT(*) AS cnt
        FROM respuestas r2
        JOIN registros reg2 ON reg2.id_registro = r2.id_registro
        WHERE reg2.encuesta_campana_id = p_campana_id
          AND r2.motivo_retiro IS NOT NULL
          AND r2.paso_4_desea_continuar IN ('no_ya_no_deseo','no_asegurado')
        GROUP BY r2.motivo_retiro
      ) sub
    ),
    'motivo_no_asistir', (
      SELECT COALESCE(jsonb_object_agg(paso_5b_motivo_no_asistir, cnt), '{}')
      FROM (
        SELECT r2.paso_5b_motivo_no_asistir, COUNT(*) AS cnt
        FROM respuestas r2
        JOIN registros reg2 ON reg2.id_registro = r2.id_registro
        WHERE reg2.encuesta_campana_id = p_campana_id
          AND r2.paso_5b_motivo_no_asistir IS NOT NULL
        GROUP BY r2.paso_5b_motivo_no_asistir
      ) sub
    )
  )
  FROM respuestas r
  JOIN registros reg ON reg.id_registro = r.id_registro
  WHERE reg.encuesta_campana_id = p_campana_id
$$;
