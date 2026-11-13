-- ServicioPro only: extend role constraints for platform-wide administrators.
-- Apply after 001_initial.sql and 002_auth.sql.
ALTER TABLE sp_users DROP CONSTRAINT IF EXISTS sp_users_role_check;
ALTER TABLE sp_users ADD CONSTRAINT sp_users_role_check CHECK (role IN ('super_admin','admin','supervisor','technician'));
CREATE UNIQUE INDEX IF NOT EXISTS sp_single_super_admin_email ON sp_users (lower(email)) WHERE role = 'super_admin';
-- Never insert a default password or a plaintext credential in SQL migrations.
