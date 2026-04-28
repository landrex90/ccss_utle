-- ============================================================
-- UTLE / CCSS – Depuración de Listas de Espera
-- Schema inicial
-- ============================================================

-- Registros de pacientes (cargados por COCO desde CSV de UTLE)
CREATE TABLE IF NOT EXISTS registros (
  id_registro          TEXT PRIMARY KEY,
  nombre_paciente      TEXT NOT NULL,
  numero_asegurado     TEXT NOT NULL,
  telefono             TEXT,
  correo               TEXT,
  especialidad         TEXT,
  centro_medico        TEXT NOT NULL,
  tipo_atencion        TEXT NOT NULL CHECK (tipo_atencion IN ('consulta', 'cirugia', 'procedimiento')),
  nombre_servicio      TEXT,
  lateralidad          TEXT,          -- solo cirugia
  ultimos_4_asegurado  TEXT NOT NULL, -- nunca se expone al frontend
  token                TEXT NOT NULL, -- UUID único por enlace
  link_expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  estado               TEXT NOT NULL DEFAULT 'PENDIENTE'
                         CHECK (estado IN (
                           'PENDIENTE', 'NO_AUTORIZO', 'NO_VERIFICADO',
                           'INFO_INCORRECTA', 'DEPURADO_YA_ATENDIDO',
                           'DEPURADO_YA_PROGRAMADO', 'DEPURADO_RENUNCIA', 'ACTIVO'
                         )),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Respuestas del formulario
CREATE TABLE IF NOT EXISTS respuestas (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_registro                 TEXT NOT NULL REFERENCES registros(id_registro),
  canal                       TEXT NOT NULL DEFAULT 'correo',
  paso_1_consentimiento       TEXT,
  paso_2_verificacion         TEXT,
  paso_2_intentos             INTEGER DEFAULT 0,
  paso_3_info_correcta        TEXT,
  paso_4_desea_continuar      TEXT,
  motivo_retiro               TEXT,
  paso_5a_flexibilidad_centro TEXT,
  paso_5b_condiciones_asistir TEXT,
  paso_5b_motivo_no_asistir   TEXT,
  paso_6_medio_contacto       TEXT,
  estado_final                TEXT,
  completado                  BOOLEAN DEFAULT FALSE,
  paso_abandono               INTEGER,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Intentos de validación de identidad (para rate limiting – máx 3 por registro)
CREATE TABLE IF NOT EXISTS intentos_validacion (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_registro  TEXT NOT NULL,
  exitoso      BOOLEAN DEFAULT FALSE,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intentos_id_registro
  ON intentos_validacion (id_registro, created_at DESC);

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_registros_updated_at
  BEFORE UPDATE ON registros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_respuestas_updated_at
  BEFORE UPDATE ON respuestas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security)
ALTER TABLE registros          ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE intentos_validacion ENABLE ROW LEVEL SECURITY;

-- El service_role bypassa RLS. Todos los accesos van por API Routes con service key.
-- No se exponen políticas públicas para ninguna tabla.
