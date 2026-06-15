-- ============================================================
-- Migración 007: Vistas para Dashboard Looker Studio
-- ============================================================

-- ── Vista 1: Dashboard principal (registros + respuestas) ────
CREATE OR REPLACE VIEW vw_dashboard_principal AS
SELECT
  r.id_registro,
  r.campana_id,
  r.tipo_atencion,
  r.centro_medico,
  r.estado,
  r.canal_completado,
  r.canal_actual,

  -- Fechas de envío por canal
  DATE(r.correo_enviado_at   AT TIME ZONE 'America/Costa_Rica') AS fecha_envio_correo,
  DATE(r.whatsapp_enviado_at AT TIME ZONE 'America/Costa_Rica') AS fecha_envio_whatsapp,
  DATE(r.llamada_enviada_at  AT TIME ZONE 'America/Costa_Rica') AS fecha_envio_llamada,
  DATE(r.created_at          AT TIME ZONE 'America/Costa_Rica') AS fecha_creacion,

  -- Estados de canal
  r.correo_estado,
  r.whatsapp_estado,
  r.llamada_estado,
  r.llamada_intentos,

  -- Engagement correo
  CASE WHEN r.correo_abierto_at IS NOT NULL THEN true ELSE false END AS correo_abierto,
  CASE WHEN r.correo_click_at   IS NOT NULL THEN true ELSE false END AS correo_clicked,

  -- Minutos entre envío y respuesta
  CASE
    WHEN resp.created_at IS NOT NULL AND r.correo_enviado_at IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (resp.created_at - r.correo_enviado_at)) / 60)
    ELSE NULL
  END AS minutos_hasta_respuesta,

  -- Datos de respuesta
  resp.canal                       AS canal_respuesta,
  resp.completado,
  resp.paso_abandono,
  resp.paso_1_consentimiento,
  resp.paso_2_verificacion,
  resp.paso_2_intentos,
  resp.paso_3_info_correcta,
  resp.paso_4_desea_continuar,
  resp.motivo_retiro,
  resp.paso_5a_flexibilidad_centro,
  resp.paso_5b_condiciones_asistir,
  resp.paso_5b_motivo_no_asistir,
  resp.paso_6_medio_contacto,

  -- Flags calculados
  CASE WHEN r.estado LIKE 'DEPURADO%' THEN true ELSE false END      AS es_depurado,
  CASE WHEN r.estado = 'ACTIVO'       THEN true ELSE false END      AS es_activo,
  CASE WHEN r.estado = 'NO_AUTORIZO'  THEN true ELSE false END      AS no_autorizo,
  CASE WHEN resp.completado = true    THEN true ELSE false END      AS completo_encuesta,

  r.created_at,
  r.updated_at

FROM registros r
LEFT JOIN respuestas resp ON resp.id_registro = r.id_registro;

-- ── Vista 2: Embudo de pasos ──────────────────────────────────
CREATE OR REPLACE VIEW vw_funnel_pasos AS
SELECT
  campana_id,
  tipo_atencion,
  COUNT(*)                                                    AS total_contactados,
  COUNT(CASE WHEN estado != 'PENDIENTE' THEN 1 END)          AS llegaron_paso_1,
  COUNT(CASE WHEN paso_2_verificacion = 'exitosa' THEN 1 END) AS pasaron_paso_2,
  COUNT(CASE WHEN paso_3_info_correcta = 'si' THEN 1 END)    AS pasaron_paso_3,
  COUNT(CASE WHEN paso_4_desea_continuar = 'si' THEN 1 END)  AS pasaron_paso_4,
  COUNT(CASE WHEN paso_5b_condiciones_asistir IS NOT NULL THEN 1 END) AS pasaron_paso_5,
  COUNT(CASE WHEN paso_6_medio_contacto IS NOT NULL THEN 1 END)       AS completaron_paso_6,
  COUNT(CASE WHEN completado = true THEN 1 END)              AS total_completados
FROM vw_dashboard_principal
GROUP BY campana_id, tipo_atencion;

-- ── Vista 3: Rendimiento por canal ────────────────────────────
CREATE OR REPLACE VIEW vw_canales AS
SELECT
  campana_id,
  -- Correo
  COUNT(CASE WHEN correo_estado != 'pendiente' THEN 1 END)   AS correo_enviados,
  COUNT(CASE WHEN correo_abierto = true THEN 1 END)          AS correo_abiertos,
  COUNT(CASE WHEN correo_clicked = true THEN 1 END)          AS correo_clicks,
  COUNT(CASE WHEN canal_respuesta = 'correo' AND completado THEN 1 END) AS correo_completados,

  -- WhatsApp
  COUNT(CASE WHEN whatsapp_estado != 'pendiente' THEN 1 END) AS whatsapp_enviados,
  COUNT(CASE WHEN whatsapp_estado IN ('leido','respondio','completado') THEN 1 END) AS whatsapp_leidos,
  COUNT(CASE WHEN canal_respuesta = 'whatsapp' AND completado THEN 1 END) AS whatsapp_completados,

  -- Llamada
  COUNT(CASE WHEN llamada_estado != 'pendiente' THEN 1 END)  AS llamada_enviadas,
  COUNT(CASE WHEN llamada_estado IN ('contestada','completado') THEN 1 END) AS llamada_contestadas,
  COUNT(CASE WHEN canal_respuesta = 'llamada' AND completado THEN 1 END) AS llamada_completadas,

  -- Totales
  COUNT(*)                                                   AS total,
  COUNT(CASE WHEN completado = true THEN 1 END)             AS total_completados,
  ROUND(COUNT(CASE WHEN completado = true THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS tasa_completacion_pct

FROM vw_dashboard_principal
GROUP BY campana_id;

-- ── Vista 4: Resumen por campaña (scorecard) ─────────────────
CREATE OR REPLACE VIEW vw_resumen_campana AS
SELECT
  campana_id,
  tipo_atencion,
  centro_medico,
  COUNT(*)                                                           AS total,
  COUNT(CASE WHEN es_activo       THEN 1 END)                       AS activos,
  COUNT(CASE WHEN es_depurado     THEN 1 END)                       AS depurados,
  COUNT(CASE WHEN no_autorizo     THEN 1 END)                       AS no_autorizaron,
  COUNT(CASE WHEN estado = 'NO_VERIFICADO'   THEN 1 END)            AS no_verificados,
  COUNT(CASE WHEN estado = 'INFO_INCORRECTA' THEN 1 END)            AS info_incorrecta,
  COUNT(CASE WHEN completo_encuesta          THEN 1 END)            AS completaron,
  COUNT(CASE WHEN estado = 'PENDIENTE'       THEN 1 END)            AS pendientes,
  ROUND(COUNT(CASE WHEN completo_encuesta THEN 1 END)::numeric
        / NULLIF(COUNT(*), 0) * 100, 1)                             AS tasa_respuesta_pct,
  ROUND(COUNT(CASE WHEN es_activo THEN 1 END)::numeric
        / NULLIF(COUNT(CASE WHEN completo_encuesta THEN 1 END), 0) * 100, 1) AS tasa_activos_pct,
  MIN(fecha_creacion)                                               AS fecha_inicio,
  MAX(fecha_creacion)                                               AS fecha_ultimo
FROM vw_dashboard_principal
GROUP BY campana_id, tipo_atencion, centro_medico;

-- ── Permisos explícitos ───────────────────────────────────────
GRANT SELECT ON vw_dashboard_principal TO anon, authenticated;
GRANT SELECT ON vw_funnel_pasos        TO anon, authenticated;
GRANT SELECT ON vw_canales             TO anon, authenticated;
GRANT SELECT ON vw_resumen_campana     TO anon, authenticated;
