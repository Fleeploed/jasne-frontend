# Jasne Frontend

Expo MVP for the Jasne mobile core loop:

- Supabase Auth login/register with persisted session
- scan thread list as the main screen
- new scan flow: camera scanner, image picker, file/PDF picker
- direct upload to Supabase Storage bucket `documents`
- backend `POST /scans/stream` SSE progress
- thread view with result card and progressive chat streaming
- active deadlines list with complete/manual create actions

## Environment

Create `.env` from `.env.example`:

```sh
cp .env .env
```

Set:

```sh
EXPO_PUBLIC_SUPABASE_URL=<your Supabase project URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your Supabase anon public key>
EXPO_PUBLIC_API_BASE_URL=https://jasne-backend-production.up.railway.app
```

Do not use the backend `SUPABASE_SERVICE_KEY` in the app.

## Run

```sh
npm install
npm run typecheck
npm run start
```

The document scanner native module requires a development build:

```sh
npm run ios
# or
npm run android
```

Image/file upload paths are created as `<user_id>/<filename>` and sent to the backend as storage paths, not Supabase object IDs.
