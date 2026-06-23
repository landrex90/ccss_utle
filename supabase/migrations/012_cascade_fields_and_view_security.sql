-- ============================================================
-- Migración 012: campos de cascada multicanal + fix RLS en vistas
-- ============================================================

-- ── Nuevas columnas en registros ─────────────────────────────

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS cedula_raw          TEXT,         -- número sin guiones para match con Infobip
  ADD COLUMN IF NOT EXISTS whatsapp_campana_id  TEXT,         -- ID batch de Infobip WA
  ADD COLUMN IF NOT EXISTS llamada_campana_id   TEXT,         -- ID batch de Infobip IVR
  ADD COLUMN IF NOT EXISTS whatsapp_error       TEXT,         -- razón de fallo WA (número inactivo, bloqueado, etc.)
  ADD COLUMN IF NOT EXISTS llamada_error        TEXT;         -- razón de fallo llamada (no contesta, inválido, etc.)

-- Backfill cedula_raw desde numero_asegurado existentes (elimina guiones y espacios)
UPDATE registros
SET cedula_raw = REGEXP_REPLACE(numero_asegurado, '[^0-9]', '', 'g')
WHERE cedula_raw IS NULL AND numero_asegurado IS NOT NULL;

-- Índice para búsqueda rápida al importar CSV de Infobip (que usa cédula sin guiones)
CREATE INDEX IF NOT EXISTS idx_registros_cedula_raw ON registros (cedula_raw);

-- ── Fix SECURITY DEFINER implícito en vistas de dashboard ────
-- Las vistas creadas por el owner de Supabase corren con sus
-- privilegios (bypasean RLS). security_invoker=true las hace
-- ejecutar con los privilegios del rol que consulta, respetando RLS.
-- El admin panel usa service_role que bypasea RLS por diseño,
-- así que esto no afecta su funcionamiento.
ALTER VIEW vw_dashboard_principal SET (security_invoker = true);
ALTER VIEW vw_funnel_pasos        SET (security_invoker = true);
ALTER VIEW vw_canales             SET (security_invoker = true);
ALTER VIEW vw_resumen_campana     SET (security_invoker = true);
