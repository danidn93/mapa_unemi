-- =====================================================================
-- ESTADOS para todas las entidades del mapa
-- Se notifica vía push SOLO cuando se EDITA el estado, no al crear.
-- (La notificación se dispara desde el frontend al detectar cambio de status.)
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE public.map_feature_status AS ENUM (
    'active',            -- Operativo
    'maintenance',       -- En mantenimiento
    'closed',            -- Cerrado permanentemente
    'temporary_closed'   -- Cerrado temporalmente
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Agregar columna status a todas las tablas relevantes
ALTER TABLE public.map_buildings
  ADD COLUMN IF NOT EXISTS status public.map_feature_status NOT NULL DEFAULT 'active';

ALTER TABLE public.map_paths
  ADD COLUMN IF NOT EXISTS status public.map_feature_status NOT NULL DEFAULT 'active';

ALTER TABLE public.map_parkings
  ADD COLUMN IF NOT EXISTS status public.map_feature_status NOT NULL DEFAULT 'active';

ALTER TABLE public.map_entrances
  ADD COLUMN IF NOT EXISTS status public.map_feature_status NOT NULL DEFAULT 'active';

ALTER TABLE public.map_campus_entrances
  ADD COLUMN IF NOT EXISTS status public.map_feature_status NOT NULL DEFAULT 'active';

ALTER TABLE public.map_landmarks
  ADD COLUMN IF NOT EXISTS status public.map_feature_status NOT NULL DEFAULT 'active';

-- Índices opcionales para filtrar por estado
CREATE INDEX IF NOT EXISTS idx_map_buildings_status        ON public.map_buildings(status);
CREATE INDEX IF NOT EXISTS idx_map_paths_status            ON public.map_paths(status);
CREATE INDEX IF NOT EXISTS idx_map_parkings_status         ON public.map_parkings(status);
CREATE INDEX IF NOT EXISTS idx_map_entrances_status        ON public.map_entrances(status);
CREATE INDEX IF NOT EXISTS idx_map_campus_entrances_status ON public.map_campus_entrances(status);
CREATE INDEX IF NOT EXISTS idx_map_landmarks_status        ON public.map_landmarks(status);
