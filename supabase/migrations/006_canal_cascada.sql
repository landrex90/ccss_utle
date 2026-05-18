-- Migración 006: trazabilidad completa de cascada multicanal
-- Canal order y timestamps para WhatsApp → Llamada → Correo

ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS canal_orden        TEXT DEFAULT 'whatsapp,llamada,correo',
  ADD COLUMN IF NOT EXISTS canal_actual       TEXT DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS canal_completado   TEXT,

  -- WhatsApp
  ADD COLUMN IF NOT EXISTS whatsapp_enviado_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_entregado_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_leido_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_respondio_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_estado        TEXT DEFAULT 'pendiente',

  -- Llamada voicebot
  ADD COLUMN IF NOT EXISTS llamada_enviada_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS llamada_contestada_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS llamada_completada_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS llamada_estado         TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS llamada_intentos       SMALLINT DEFAULT 0,

  -- Correo electrónico
  ADD COLUMN IF NOT EXISTS correo_enviado_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correo_abierto_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correo_click_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correo_estado          TEXT DEFAULT 'pendiente';

-- Estado de cada canal: pendiente | enviado | entregado | leido | respondio | no_respondio | fallido | completado
-- canal_orden: orden de canales separado por coma, configurable por campaña
-- canal_completado: canal por el que el paciente finalmente completó el flujo
