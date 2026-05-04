# SQL para tu proyecto Supabase

Ejecuta los archivos en el SQL Editor de tu proyecto en este orden:

1. `01_schema.sql` — tablas `map_buildings`, `map_floors`, `map_rooms`, `map_entrances`, `map_parkings`, `map_paths`, `map_routes`, `map_route_steps`, `map_notifications`, `map_landmarks` + enums + triggers `updated_at`.
2. `02_functions.sql` — `get_user_effective_role(_user_id)`, `get_admin_users()`, etc.
3. `03_rls.sql` — políticas de seguridad por audiencia.
4. `04_seed.sql` — tipos de aula básicos y 2 edificios demo (opcional).
5. `05_campus_entrances.sql` — tabla `map_campus_entrances` con tipo peatonal/vehicular/mixta para las entradas a la universidad (no de edificio).
6. `06_landmarks.sql` — añade tipos `plaza`, `corridor`, `bar` al enum `map_landmark_kind` y habilita RLS para puntos de referencia (plazoletas, baños, cafeterías, etc.).
7. `07_status.sql` — **NUEVO**: agrega enum `map_feature_status` (`active`, `maintenance`, `closed`, `temporary_closed`) y columna `status` a bloques, calles, parqueaderos, entradas y puntos de referencia. Las notificaciones push se envían **solo al editar el estado** desde el panel admin (no al crear nuevos elementos).

## Promover a tu primer superadmin

```sql
-- 1. Obtén tu user_id en el panel de Supabase Auth → Users
-- 2. Ejecuta:
INSERT INTO public.user_roles (user_id, role)
VALUES ('TU_USER_ID', 'admin');
```

## Notas

- Las tablas `profiles`, `user_roles`, `email_logs`, `push_subscriptions` ya existen en tu BD; no se tocan.
- El enum `app_role` que usas (admin/operator/user) se mapea a roles de mapa así:
  - `admin` → superadmin
  - `operator` → admin (puede editar el mapa)
  - resto → usuario público / según `user_type`
- Las **calles no necesitan nombre**. El sistema considera intersecciones automáticamente: dos vértices a ≤6 m comparten el mismo nodo del grafo, así Dijkstra encuentra siempre la ruta más corta cruzando calles.
