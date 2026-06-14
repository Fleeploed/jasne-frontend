# Jasne Frontend

Expo MVP for the Jasne mobile core loop:

- Supabase Auth login/register with persisted session
- scan thread list as the main screen
- new scan flow: in-app live camera (react-native-vision-camera), image picker, file/PDF picker
- direct upload to Supabase Storage bucket `documents`
- backend `POST /scans/stream` SSE progress
- thread view with result card and progressive chat streaming
- active deadlines list with complete/manual create actions

## Environment

Create `.env` from `.env.example`:

```sh
cp .env.example .env
```

Set:

```sh
EXPO_PUBLIC_SUPABASE_URL=<your Supabase project URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your Supabase anon public key>
EXPO_PUBLIC_API_BASE_URL=https://jasne-backend.onrender.com
```

Do not use the backend `SUPABASE_SERVICE_KEY` in the app.

After the Supabase custom domain is activated, set `EXPO_PUBLIC_SUPABASE_URL=https://auth.jasne.app` for local, EAS preview, and EAS production builds. Until activation completes, keep using `https://ndestbxknbgaxxdjoqkv.supabase.co`.

`https://jasne-backend.onrender.com` is the current development/staging backend. Release production backend URL must be set later when production hosting is finalized.

Optional analytics and crash reporting:

```sh
EXPO_PUBLIC_POSTHOG_KEY=<your PostHog project API key>
EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
EXPO_PUBLIC_SENTRY_DSN=<your Sentry mobile DSN>
EXPO_PUBLIC_ANALYTICS_ENV=development
```

PostHog tracks product events and funnels; Sentry tracks crashes. Do not send document text, OCR, email, file URLs, scan IDs, or deadline IDs as analytics properties.

For readable Sentry stack traces in production builds, set these as local/EAS build secrets, not as `EXPO_PUBLIC_*` values:

```sh
SENTRY_ORG=<your Sentry organization slug>
SENTRY_PROJECT=<your Sentry project slug>
SENTRY_AUTH_TOKEN=<your Sentry source-map upload token>
```

## Production Auth Checklist

These settings are configured outside the frontend repo in Supabase and Google Cloud dashboards.

Supabase Auth:

- Email/password: enabled.
- Custom SMTP: configure Resend SMTP (`smtp.resend.com`, port `587`, username `resend`, password = Resend API key).
- Custom domain target: `auth.jasne.app`.
- Redirect URLs:
  - `jasne://auth/callback`
  - `jasne://auth/reset-password`

Supabase Custom Domain:

- Requires a paid Supabase plan/add-on and Owner/Admin permissions.
- Create DNS CNAME: `auth.jasne.app` -> `ndestbxknbgaxxdjoqkv.supabase.co`.
- Register the domain in Supabase and add the TXT validation record Supabase returns:
  ```sh
  supabase domains create --project-ref ndestbxknbgaxxdjoqkv --custom-hostname auth.jasne.app
  ```
- After DNS propagates, verify and activate:
  ```sh
  supabase domains reverify --project-ref ndestbxknbgaxxdjoqkv
  supabase domains activate --project-ref ndestbxknbgaxxdjoqkv
  ```
- After activation, update app env to `EXPO_PUBLIC_SUPABASE_URL=https://auth.jasne.app` and rebuild. This is what makes iOS show `auth.jasne.app` instead of `*.supabase.co` in the Google login system prompt.

Google OAuth:

- Enable the Supabase Google provider.
- Configure the Google Cloud OAuth consent screen for Jasne.
- Create a Google Web OAuth Client ID/Secret and copy it into the Supabase Google provider.
- Add Google authorized redirect URIs:
  - `https://ndestbxknbgaxxdjoqkv.supabase.co/auth/v1/callback`
  - `https://auth.jasne.app/auth/v1/callback`

## Run

```sh
npm install
npm run typecheck
npm run start
```

The camera (react-native-vision-camera) requires a development build — it does not run in Expo Go:

```sh
npm run ios
# or
npm run android
```

Image/file upload paths are created as `<user_id>/<filename>` and sent to the backend as storage paths, not Supabase object IDs.
