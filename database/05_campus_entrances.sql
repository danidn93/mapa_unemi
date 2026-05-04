-- =====================================================================
-- Entradas a la UNIVERSIDAD (no a edificios). Peatonal / vehicular / mixta.
-- Ejecutar DESPUÉS de 01_schema.sql
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE public.map_campus_entry_type AS ENUM ('pedestrian','vehicle','mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sentido del acceso: solo entrada, solo salida, o ambas
DO $$ BEGIN
  CREATE TYPE public.map_campus_direction AS ENUM ('entry','exit','both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.map_campus_entrances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  entry_type public.map_campus_entry_type NOT NULL DEFAULT 'mixed',
  direction public.map_campus_direction NOT NULL DEFAULT 'both',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Si la tabla ya existía, añadir la columna direction
ALTER TABLE public.map_campus_entrances
  ADD COLUMN IF NOT EXISTS direction public.map_campus_direction NOT NULL DEFAULT 'both';

CREATE INDEX IF NOT EXISTS idx_map_campus_entrances_type ON public.map_campus_entrances(entry_type);
CREATE INDEX IF NOT EXISTS idx_map_campus_entrances_direction ON public.map_campus_entrances(direction);

DROP TRIGGER IF EXISTS trg_map_campus_entrances_updated ON public.map_campus_entrances;
CREATE TRIGGER trg_map_campus_entrances_updated BEFORE UPDATE ON public.map_campus_entrances
  FOR EACH ROW EXECUTE FUNCTION public.map_set_updated_at();

-- RLS: lectura pública, escritura solo admin/operator
ALTER TABLE public.map_campus_entrances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campus_entrances_read_public" ON public.map_campus_entrances;
CREATE POLICY "campus_entrances_read_public"
  ON public.map_campus_entrances FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "campus_entrances_admin_write" ON public.map_campus_entrances;
CREATE POLICY "campus_entrances_admin_write"
  ON public.map_campus_entrances FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
