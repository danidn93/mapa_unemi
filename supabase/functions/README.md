# Edge Functions

Despliega en tu proyecto Supabase:

```bash
supabase functions deploy send-push-notification --no-verify-jwt
supabase functions deploy send-admin-route-email
```

## Secrets requeridos

```bash
# Push notifications (genera con:  npx web-push generate-vapid-keys )
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:admin@unemi.edu.ec

# Gmail OAuth2 (cuenta institucional)
# Pasos: console.cloud.google.com -> OAuth Client ID (Web) ->
#        OAuth playground (developers.google.com/oauthplayground) ->
#        autorizar https://mail.google.com/ -> obtener refresh_token
supabase secrets set GMAIL_CLIENT_ID=...
supabase secrets set GMAIL_CLIENT_SECRET=...
supabase secrets set GMAIL_REFRESH_TOKEN=...
supabase secrets set GMAIL_FROM="Mapa UNEMI <tu_correo@unemi.edu.ec>"
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya las inyecta Supabase automáticamente.
