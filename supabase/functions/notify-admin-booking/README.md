# notify-admin-booking

Envía un email al admin (Felipe) cada vez que se crea una nueva solicitud de booking desde el press kit.

## Deploy

```bash
# En tu local, desde la carpeta raíz del repo
supabase functions deploy notify-admin-booking --no-verify-jwt
```

O vía web:
1. Supabase dashboard → Edge Functions → New function
2. Nombre: `notify-admin-booking`
3. Pega el contenido de `index.ts`
4. Deploy

## Secrets a configurar

En Supabase → Settings → Edge Functions → Secrets:

| Secret | Valor | Dónde obtenerlo |
|---|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxxxxx` | https://resend.com → API Keys (free tier: 3.000 emails/mes) |
| `ADMIN_EMAIL` | `diossupremoinversionesspa@gmail.com` | Tu email personal |
| `APP_URL` | `https://voltum.cl` | Tu dominio en producción |

Nota: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` se configuran automáticamente por Supabase.

## Pasos para que funcione

1. **Crear cuenta en Resend** (gratis, 3 min): https://resend.com/signup
2. **Verificar dominio** en Resend para enviar desde `bookings@voltum.cl`:
   - Resend → Domains → Add domain → `voltum.cl`
   - Agrega los 3 registros DNS que te da (MX, TXT, DKIM) en Vercel/Cloudflare
   - Espera a que verifique (~15 min)
3. **Generar API Key**: Resend → API Keys → Create → copiar `re_...`
4. **Setear secrets en Supabase** (ver tabla arriba)
5. **Deploy la función**
6. **Probar**: hacer una solicitud de booking desde una cuenta empresa → deberías recibir el email en segundos

## Si no quieres configurar dominio todavía

Resend permite enviar desde `onboarding@resend.dev` (sandbox) sin verificar dominio. Cambia en `index.ts` línea:

```ts
from: "Voltum <bookings@voltum.cl>",
```

a:

```ts
from: "Voltum <onboarding@resend.dev>",
```

Limitación: solo puedes enviar al email que verificaste al crear la cuenta Resend.

## Cómo se dispara

`presskit.html` al enviar el form de booking hace:
1. INSERT en `bookings` con `voltum_status='review_voltum'`
2. Llama fire-and-forget a `/functions/v1/notify-admin-booking` con `{ bookingId }`
3. La función lee el booking + joins con `profiles` y `companies`
4. Genera HTML con todos los datos + CTA al panel admin
5. Envía vía Resend al `ADMIN_EMAIL`

Si falla, la UX del usuario no se ve afectada (fire-and-forget).
