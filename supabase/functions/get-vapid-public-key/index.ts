// Devuelve la VAPID public key al cliente para que pueda suscribir Web Push.
// Pública e idempotente: no requiere autenticación.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const key = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  return new Response(JSON.stringify({ vapidPublicKey: key }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
