-- ============================================================
-- 08_otp_auth.sql
-- OTP de verificación de cuenta y reseteo de contraseña.
-- Asume que existen: public.profiles (id uuid PK = auth.users.id),
-- public.email_logs, public.user_roles.
-- ============================================================

-- 1) Columnas extra en profiles (idempotente)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text,
  ADD COLUMN IF NOT EXISTS cedula     text,
  ADD COLUMN IF NOT EXISTS doc_type   text CHECK (doc_type IN ('cedula','pasaporte')),
  ADD COLUMN IF NOT EXISTS user_type  text,
  ADD COLUMN IF NOT EXISTS phone      text,
  ADD COLUMN IF NOT EXISTS faculty    text,
  ADD COLUMN IF NOT EXISTS career     text,
  ADD COLUMN IF NOT EXISTS semester   text,
  ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'pending';

-- 2) Tabla de códigos OTP
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('email_verification','password_reset')),
  expires_at  timestamptz NOT NULL,
  used        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verif_user_type
  ON public.verification_codes(user_id, type, used);

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- Solo service role accede (las edge functions usan service role).
DROP POLICY IF EXISTS "deny all" ON public.verification_codes;
CREATE POLICY "deny all" ON public.verification_codes
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
