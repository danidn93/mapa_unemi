-- =====================================================================
-- MAPA INSTITUCIONAL UNEMI - Schema completo
-- Prefijo: map_  |  Reutiliza: profiles, user_roles, push_subscriptions, email_logs
-- Ejecutar en el SQL Editor de tu proyecto Supabase.
-- =====================================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.map_access_mode AS ENUM ('pedestrian','vehicle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.map_target_audience AS ENUM ('public','student','teacher','staff','admin','superadmin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.map_parking_type AS ENUM ('car','motorcycle','bicycle','bus','authority','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.map_landmark_kind AS ENUM ('entrance','exit','gate','reference','emergency','restroom','cafeteria','atm','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- TIMESTAMP TRIGGER ----------
CREATE OR REPLACE FUNCTION public.map_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =====================================================================
-- TABLAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.map_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  description text,
  faculty text,
  geom jsonb NOT NULL,
  centroid_lat double precision NOT NULL,
  centroid_lng double precision NOT NULL,
  floors_count int NOT NULL DEFAULT 1,
  image_url text,
  target_audience public.map_target_audience NOT NULL DEFAULT 'public',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_buildings_active ON public.map_buildings(is_active);
DROP TRIGGER IF EXISTS trg_map_buildings_updated ON public.map_buildings;
CREATE TRIGGER trg_map_buildings_updated BEFORE UPDATE ON public.map_buildings
  FOR EACH ROW EXECUTE FUNCTION public.map_set_updated_at();

CREATE TABLE IF NOT EXISTS public.map_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.map_buildings(id) ON DELETE CASCADE,
  level int NOT NULL,
  name text,
  map_image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(building_id, level)
);
CREATE INDEX IF NOT EXISTS idx_map_floors_building ON public.map_floors(building_id);
DROP TRIGGER IF EXISTS trg_map_floors_updated ON public.map_floors;
CREATE TRIGGER trg_map_floors_updated BEFORE UPDATE ON public.map_floors
  FOR EACH ROW EXECUTE FUNCTION public.map_set_updated_at();

CREATE TABLE IF NOT EXISTS public.map_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  icon text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.map_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.map_buildings(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES public.map_floors(id) ON DELETE SET NULL,
  room_type_id uuid REFERENCES public.map_room_types(id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  description text,
  directions text,
  image_url text,
  keywords text[] DEFAULT '{}',
  target_audience public.map_target_audience NOT NULL DEFAULT 'public',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_rooms_building ON public.map_rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_map_rooms_floor    ON public.map_rooms(floor_id);
CREATE INDEX IF NOT EXISTS idx_map_rooms_audience ON public.map_rooms(target_audience);
CREATE INDEX IF NOT EXISTS idx_map_rooms_keywords ON public.map_rooms USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_map_rooms_search   ON public.map_rooms
  USING GIN (to_tsvector('spanish', coalesce(name,'')||' '||coalesce(code,'')||' '||coalesce(description,'')));
DROP TRIGGER IF EXISTS trg_map_rooms_updated ON public.map_rooms;
CREATE TRIGGER trg_map_rooms_updated BEFORE UPDATE ON public.map_rooms
  FOR EACH ROW EXECUTE FUNCTION public.map_set_updated_at();

CREATE TABLE IF NOT EXISTS public.map_entrances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.map_buildings(id) ON DELETE CASCADE,
  name text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  is_main boolean NOT NULL DEFAULT false,
  access_modes public.map_access_mode[] NOT NULL DEFAULT ARRAY['pedestrian']::public.map_access_mode[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_entrances_building ON public.map_entrances(building_id);

CREATE TABLE IF NOT EXISTS public.map_parkings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  type public.map_parking_type NOT NULL,
  geom jsonb NOT NULL,
  centroid_lat double precision NOT NULL,
  centroid_lng double precision NOT NULL,
  capacity int,
  target_audience public.map_target_audience NOT NULL DEFAULT 'public',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_parkings_type ON public.map_parkings(type);
DROP TRIGGER IF EXISTS trg_map_parkings_updated ON public.map_parkings;
CREATE TRIGGER trg_map_parkings_updated BEFORE UPDATE ON public.map_parkings
  FOR EACH ROW EXECUTE FUNCTION public.map_set_updated_at();

CREATE TABLE IF NOT EXISTS public.map_landmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind public.map_landmark_kind NOT NULL DEFAULT 'reference',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  description text,
  icon text,
  target_audience public.map_target_audience NOT NULL DEFAULT 'public',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_landmarks_kind ON public.map_landmarks(kind);

CREATE TABLE IF NOT EXISTS public.map_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  geom jsonb NOT NULL,
  access_modes public.map_access_mode[] NOT NULL DEFAULT ARRAY['pedestrian']::public.map_access_mode[],
  bidirectional boolean NOT NULL DEFAULT true,
  speed_kmh double precision,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_paths_modes ON public.map_paths USING GIN(access_modes);
DROP TRIGGER IF EXISTS trg_map_paths_updated ON public.map_paths;
CREATE TRIGGER trg_map_paths_updated BEFORE UPDATE ON public.map_paths
  FOR EACH ROW EXECUTE FUNCTION public.map_set_updated_at();

CREATE TABLE IF NOT EXISTS public.map_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origin_lat double precision NOT NULL,
  origin_lng double precision NOT NULL,
  destination_room_id uuid REFERENCES public.map_rooms(id) ON DELETE SET NULL,
  destination_building_id uuid REFERENCES public.map_buildings(id) ON DELETE SET NULL,
  access_mode public.map_access_mode NOT NULL DEFAULT 'pedestrian',
  distance_meters double precision,
  duration_seconds double precision,
  geometry jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_routes_user ON public.map_routes(user_id);

CREATE TABLE IF NOT EXISTS public.map_route_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.map_routes(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  instruction text NOT NULL,
  distance_meters double precision,
  lat double precision,
  lng double precision,
  UNIQUE(route_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_map_route_steps_route ON public.map_route_steps(route_id);

CREATE TABLE IF NOT EXISTS public.map_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  data jsonb,
  channel text NOT NULL DEFAULT 'push',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_notifications_user ON public.map_notifications(user_id);
