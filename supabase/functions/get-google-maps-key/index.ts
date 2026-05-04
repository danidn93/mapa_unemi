import { corsHeaders } from "@supabase/supabase-js/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
  return new Response(JSON.stringify({ key }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
