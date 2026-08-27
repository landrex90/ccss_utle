-- Migración 023: trazabilidad del correo de recordatorio como 2do contacto
--
-- El correo de recordatorio (con link personal + detalle del caso pendiente)
-- fue aprobado por UTLE como sustituto del WhatsApp para el 2do contacto,
-- en los casos donde aplica. primer_acceso_at ya sirve como evidencia de
-- apertura/clic (esta población nunca había dado clic antes del recordatorio),
-- por lo que no se requiere una columna de clic separada.

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS recordatorio_campana_id        TEXT,
  ADD COLUMN IF NOT EXISTS recordatorio_correo_enviado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS segundo_contacto_canal         TEXT DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS segundo_contacto_justificacion TEXT;

COMMENT ON COLUMN registros.recordatorio_campana_id IS 'ID de la oleada de recordatorio (ej. RECORDATORIO-2CONTACTO-FASE1) — separado de campana_id (campaña original) igual que whatsapp_campana_id/llamada_campana_id, para no pisar la clasificación original en reportes';
COMMENT ON COLUMN registros.recordatorio_correo_enviado_at IS 'Fecha de envío del correo de recordatorio (2do contacto)';
COMMENT ON COLUMN registros.segundo_contacto_canal IS 'Canal real que sirvió como 2do contacto: whatsapp (default) o correo_recordatorio cuando fue aprobado como sustituto';
COMMENT ON COLUMN registros.segundo_contacto_justificacion IS 'Justificación/aprobación documentada de la sustitución del 2do contacto (quién aprobó, fecha, motivo) — respaldo para auditoría';
