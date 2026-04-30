ALTER TABLE registros ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
