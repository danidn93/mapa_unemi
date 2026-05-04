-- ============================================================
-- 09_push_app_name.sql
-- Añade columna app_name a push_subscriptions para distinguir
-- suscripciones de distintas aplicaciones que comparten la DB.
-- ============================================================

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS app_name text NOT NULL DEFAULT 'mapa_unemi';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_app_name
  ON public.push_subscriptions(app_name);

-- Marca las suscripciones existentes (las que aún no tienen app_name) como mapa_unemi.
UPDATE public.push_subscriptions
   SET app_name = 'mapa_unemi'
 WHERE app_name IS NULL;
