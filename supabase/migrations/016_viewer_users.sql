-- Migration 016: Tabla de usuarios viewer (acceso solo lectura UTLE)
-- Ejecutar en: Supabase SQL Editor → producción Y preprod
-- Fecha: 2026-07-13

CREATE TABLE IF NOT EXISTS viewer_users (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  username    text    UNIQUE NOT NULL,   -- parte antes del @ del correo institucional
  cedula_hash text    NOT NULL,          -- SHA-256(cédula en texto, sin espacios ni guiones)
  nombre      text    NOT NULL,
  activo      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- Seed: equipo UTLE (cédulas hasheadas con SHA-256)
-- Para agregar un usuario nuevo: SELECT encode(sha256(convert_to('123456789', 'UTF8')), 'hex');
INSERT INTO viewer_users (username, cedula_hash, nombre) VALUES
  ('jcchacov',  'fee0f6e35d1012cb7b4d4fd3ab7d7d3e3e15f6898f60316c63460366d436456a', 'Jeancarlo Chacón Villalobos'),
  ('mcastillc', '77da7e5a9a151f8e3bdf478d06933da5e1da519f083da1e7074ac765b497d4b4', 'Mariam Castillo Carvajal'),
  ('erarriet',  '7bf42a3480b9f4b86f7f9c49b5b74e22bd2ddeedccdce40900913595df439ccd', 'Enué Rodrigo Arrieta Espinoza'),
  ('kcolby',    '389e2c2d44867f469b46e5b98be723d7eecd3ed22dd663e6afbcdd87fd550935', 'Katherine Colby Jiménez')
ON CONFLICT (username) DO NOTHING;

-- Cómo agregar un usuario futuro:
-- 1. Obtener el hash: SELECT encode(sha256(convert_to('NUMERO_CEDULA', 'UTF8')), 'hex');
-- 2. INSERT INTO viewer_users (username, cedula_hash, nombre)
--    VALUES ('nuevo.usuario', '<hash>', 'Nombre Completo');
