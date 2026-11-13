-- Run after 001_initial.sql on a dedicated ServicioPro database only.
ALTER TABLE sp_users ADD COLUMN IF NOT EXISTS password_hash text;
-- Existing users (if any) must be migrated before enforcing NOT NULL.
ALTER TABLE sp_users ALTER COLUMN password_hash SET NOT NULL;
CREATE INDEX IF NOT EXISTS sp_users_company_email_idx ON sp_users(company_id,email);
