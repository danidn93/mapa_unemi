// Cliente Supabase sin tipado para tablas map_* (definidas en TU proyecto Supabase).
import { supabase } from "@/integrations/supabase/client";
export const db = supabase as any;
