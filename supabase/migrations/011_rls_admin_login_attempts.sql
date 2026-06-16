-- ============================================================
-- Migración 011: RLS en admin_login_attempts
-- Activado inicialmente vía Supabase dashboard (2026-06-16).
-- Esta migración lo versiona para que el esquema sea reproducible.
-- ============================================================

ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;
