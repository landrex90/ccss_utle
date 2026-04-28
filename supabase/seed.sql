-- Datos de prueba para desarrollo
-- Ejecutar después de 001_initial.sql

INSERT INTO registros (
  id_registro, nombre_paciente, numero_asegurado, correo,
  especialidad, centro_medico, tipo_atencion, nombre_servicio,
  lateralidad, ultimos_4_asegurado, token, link_expires_at
) VALUES
(
  'REG-2026-00001',
  'María López Hernández',
  '1-2345-6789',
  'maria@ejemplo.com',
  'Ortopedia',
  'Hospital San Juan de Dios',
  'cirugia',
  'Artroscopia de rodilla',
  'Derecha',
  '6789',
  'test-token-cirugia-001',
  NOW() + INTERVAL '30 days'
),
(
  'REG-2026-00002',
  'Carlos Rodríguez Mora',
  '2-3456-7890',
  'carlos@ejemplo.com',
  'Cardiología',
  'Hospital México',
  'consulta',
  NULL,
  NULL,
  '7890',
  'test-token-consulta-002',
  NOW() + INTERVAL '30 days'
),
(
  'REG-2026-00003',
  'Ana Jiménez Castro',
  '3-4567-8901',
  'ana@ejemplo.com',
  'Gastroenterología',
  'Hospital Calderón Guardia',
  'procedimiento',
  'Colonoscopía diagnóstica',
  NULL,
  '8901',
  'test-token-proc-003',
  NOW() + INTERVAL '30 days'
);

-- URLs de prueba:
-- Cirugía:      /utle?id=REG-2026-00001&token=test-token-cirugia-001
-- Consulta:     /utle?id=REG-2026-00002&token=test-token-consulta-002
-- Procedimiento:/utle?id=REG-2026-00003&token=test-token-proc-003
