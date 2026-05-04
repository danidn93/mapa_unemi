-- =====================================================================
-- PUNTOS DE REFERENCIA (plazoletas, baños, bares, corredores, etc.)
-- Reusa la tabla map_landmarks ya creada en 01_schema.sql.
-- Aquí solo añadimos:
--   - nuevo valor de enum 'corridor' (corredor) y 'plaza' (plazoleta)
--   - políticas RLS para lectura pública y escritura admin/operator
-- Ejecutar DESPUÉS de 01_schema.sql y 03_rls.sql
-- =====================================================================

DO $$ BEGIN
  ALTER TYPE public.map_landmark_kind ADD VALUE IF NOT EXISTS 'plaza';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.map_landmark_kind ADD VALUE IF NOT EXISTS 'corridor';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.map_landmark_kind ADD VALUE IF NOT EXISTS 'bar';
EXCEPTION WHEN others THEN NULL; END $$;

ALTER TABLE public.map_landmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landmarks_read_public" ON public.map_landmarks;
CREATE POLICY "landmarks_read_public"
  ON public.map_landmarks FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "landmarks_admin_write" ON public.map_landmarks;
CREATE POLICY "landmarks_admin_write"
  ON public.map_landmarks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
