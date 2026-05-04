-- =====================================================================
-- Row Level Security para todas las tablas map_*
-- =====================================================================

ALTER TABLE public.map_buildings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_floors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_room_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_entrances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_parkings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_landmarks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_paths         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_routes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_route_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_notifications ENABLE ROW LEVEL SECURITY;

-- BUILDINGS
DROP POLICY IF EXISTS "buildings_select" ON public.map_buildings;
CREATE POLICY "buildings_select" ON public.map_buildings FOR SELECT
  USING (is_active AND public.map_audience_visible(target_audience, auth.uid()));
DROP POLICY IF EXISTS "buildings_admin_all" ON public.map_buildings;
CREATE POLICY "buildings_admin_all" ON public.map_buildings FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- FLOORS
DROP POLICY IF EXISTS "floors_select" ON public.map_floors;
CREATE POLICY "floors_select" ON public.map_floors FOR SELECT
  USING (is_active AND EXISTS (
    SELECT 1 FROM public.map_buildings b
    WHERE b.id = building_id AND b.is_active
      AND public.map_audience_visible(b.target_audience, auth.uid())
  ));
DROP POLICY IF EXISTS "floors_admin_all" ON public.map_floors;
CREATE POLICY "floors_admin_all" ON public.map_floors FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- ROOM TYPES
DROP POLICY IF EXISTS "room_types_select" ON public.map_room_types;
CREATE POLICY "room_types_select" ON public.map_room_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "room_types_admin_all" ON public.map_room_types;
CREATE POLICY "room_types_admin_all" ON public.map_room_types FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- ROOMS
DROP POLICY IF EXISTS "rooms_select" ON public.map_rooms;
CREATE POLICY "rooms_select" ON public.map_rooms FOR SELECT
  USING (is_active AND public.map_audience_visible(target_audience, auth.uid()));
DROP POLICY IF EXISTS "rooms_admin_all" ON public.map_rooms;
CREATE POLICY "rooms_admin_all" ON public.map_rooms FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- ENTRANCES
DROP POLICY IF EXISTS "entrances_select" ON public.map_entrances;
CREATE POLICY "entrances_select" ON public.map_entrances FOR SELECT
  USING (is_active AND EXISTS (
    SELECT 1 FROM public.map_buildings b WHERE b.id = building_id AND b.is_active
  ));
DROP POLICY IF EXISTS "entrances_admin_all" ON public.map_entrances;
CREATE POLICY "entrances_admin_all" ON public.map_entrances FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- PARKINGS
DROP POLICY IF EXISTS "parkings_select" ON public.map_parkings;
CREATE POLICY "parkings_select" ON public.map_parkings FOR SELECT
  USING (is_active AND public.map_audience_visible(target_audience, auth.uid()));
DROP POLICY IF EXISTS "parkings_admin_all" ON public.map_parkings;
CREATE POLICY "parkings_admin_all" ON public.map_parkings FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- LANDMARKS
DROP POLICY IF EXISTS "landmarks_select" ON public.map_landmarks;
CREATE POLICY "landmarks_select" ON public.map_landmarks FOR SELECT
  USING (is_active AND public.map_audience_visible(target_audience, auth.uid()));
DROP POLICY IF EXISTS "landmarks_admin_all" ON public.map_landmarks;
CREATE POLICY "landmarks_admin_all" ON public.map_landmarks FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- PATHS
DROP POLICY IF EXISTS "paths_select" ON public.map_paths;
CREATE POLICY "paths_select" ON public.map_paths FOR SELECT USING (is_active);
DROP POLICY IF EXISTS "paths_admin_all" ON public.map_paths;
CREATE POLICY "paths_admin_all" ON public.map_paths FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- ROUTES
DROP POLICY IF EXISTS "routes_select_own" ON public.map_routes;
CREATE POLICY "routes_select_own" ON public.map_routes FOR SELECT
  USING (user_id = auth.uid() OR public.map_is_admin(auth.uid()));
DROP POLICY IF EXISTS "routes_insert_own" ON public.map_routes;
CREATE POLICY "routes_insert_own" ON public.map_routes FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
DROP POLICY IF EXISTS "routes_admin_all" ON public.map_routes;
CREATE POLICY "routes_admin_all" ON public.map_routes FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));

-- ROUTE STEPS
DROP POLICY IF EXISTS "route_steps_select" ON public.map_route_steps;
CREATE POLICY "route_steps_select" ON public.map_route_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.map_routes r
    WHERE r.id = route_id AND (r.user_id = auth.uid() OR public.map_is_admin(auth.uid()))
  ));
DROP POLICY IF EXISTS "route_steps_insert" ON public.map_route_steps;
CREATE POLICY "route_steps_insert" ON public.map_route_steps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.map_routes r
    WHERE r.id = route_id AND (r.user_id = auth.uid() OR r.user_id IS NULL OR public.map_is_admin(auth.uid()))
  ));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notif_select_own" ON public.map_notifications;
CREATE POLICY "notif_select_own" ON public.map_notifications FOR SELECT
  USING (user_id = auth.uid() OR public.map_is_admin(auth.uid()));
DROP POLICY IF EXISTS "notif_admin_all" ON public.map_notifications;
CREATE POLICY "notif_admin_all" ON public.map_notifications FOR ALL
  USING (public.map_is_admin(auth.uid())) WITH CHECK (public.map_is_admin(auth.uid()));
