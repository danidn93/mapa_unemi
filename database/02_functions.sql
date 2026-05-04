-- =====================================================================
-- RPC + helpers de seguridad
-- =====================================================================

-- Rol efectivo: public | student | teacher | staff | admin | superadmin
-- Mapeo desde tu user_roles (admin/operator/user) + profiles.user_type
CREATE OR REPLACE FUNCTION public.get_user_effective_role(_user_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_user_type public.user_type;
BEGIN
  IF _user_id IS NULL THEN RETURN 'public'; END IF;

  SELECT role INTO v_role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'operator' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_role = 'admin'    THEN RETURN 'superadmin'; END IF;
  IF v_role = 'operator' THEN RETURN 'admin';      END IF;

  SELECT user_type INTO v_user_type FROM public.profiles WHERE id = _user_id;
  IF v_user_type = 'estudiante'    THEN RETURN 'student'; END IF;
  IF v_user_type = 'docente'       THEN RETURN 'teacher'; END IF;
  IF v_user_type = 'administrativo' THEN RETURN 'staff';  END IF;

  RETURN 'public';
END $$;

CREATE OR REPLACE FUNCTION public.map_is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_user_effective_role(_user_id) IN ('admin','superadmin');
$$;

CREATE OR REPLACE FUNCTION public.map_audience_visible(_audience public.map_target_audience, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE public.get_user_effective_role(_user_id)
    WHEN 'superadmin' THEN true
    WHEN 'admin'      THEN true
    WHEN 'staff'      THEN _audience IN ('public','student','teacher','staff')
    WHEN 'teacher'    THEN _audience IN ('public','student','teacher')
    WHEN 'student'    THEN _audience IN ('public','student')
    ELSE                  _audience = 'public'
  END
$$;

CREATE OR REPLACE FUNCTION public.get_accessible_rooms(_user_id uuid DEFAULT auth.uid())
RETURNS SETOF public.map_rooms
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.* FROM public.map_rooms r
  WHERE r.is_active AND public.map_audience_visible(r.target_audience, _user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_available_paths(_mode public.map_access_mode)
RETURNS SETOF public.map_paths
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.map_paths WHERE is_active AND _mode = ANY(access_modes);
$$;

CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.email, p.first_name, p.last_name, ur.role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('admin','operator');
$$;

CREATE OR REPLACE FUNCTION public.log_map_notification(
  _user_id uuid, _title text, _body text, _data jsonb DEFAULT '{}'::jsonb, _channel text DEFAULT 'push'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.map_notifications(user_id, title, body, data, channel, status, sent_at)
  VALUES (_user_id, _title, _body, _data, _channel, 'sent', now())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
