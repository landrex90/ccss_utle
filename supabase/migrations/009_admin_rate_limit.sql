-- ============================================================
-- Migración 009: Rate limiting para login admin
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_address  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_ip_at
  ON admin_login_attempts (ip_address, created_at);
