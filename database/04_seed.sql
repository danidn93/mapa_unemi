-- =====================================================================
-- Seed mínimo: tipos de aulas + 2 edificios demo en UNEMI Milagro
-- =====================================================================

INSERT INTO public.map_room_types(code, name, icon, color) VALUES
  ('classroom','Aula','school','#FF7A1A'),
  ('lab','Laboratorio','flask','#1F6FEB'),
  ('office','Oficina','briefcase','#6B7280'),
  ('auditorium','Auditorio','mic','#9333EA'),
  ('library','Biblioteca','book','#0EA5E9'),
  ('restroom','Baño','bath','#10B981')
ON CONFLICT (code) DO NOTHING;

-- Bloque demo (centro aprox UNEMI: -2.1509, -79.6011)
INSERT INTO public.map_buildings(code, name, description, geom, centroid_lat, centroid_lng, floors_count)
VALUES
('B-A','Bloque A','Edificio principal de aulas',
  '{"type":"Polygon","coordinates":[[[-79.6014,-2.1507],[-79.6010,-2.1507],[-79.6010,-2.1511],[-79.6014,-2.1511],[-79.6014,-2.1507]]]}'::jsonb,
  -2.1509, -79.6012, 3),
('B-B','Bloque B','Laboratorios y oficinas',
  '{"type":"Polygon","coordinates":[[[-79.6005,-2.1507],[-79.6001,-2.1507],[-79.6001,-2.1511],[-79.6005,-2.1511],[-79.6005,-2.1507]]]}'::jsonb,
  -2.1509, -79.6003, 2)
ON CONFLICT (code) DO NOTHING;
