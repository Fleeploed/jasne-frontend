# Jasně — AI assistant for Czech paperwork

Jasně is a mobile application that helps people understand Czech official documents and act on them. Users photograph a letter or upload a PDF, receive a plain-language explanation, and keep the document, follow-up conversation, and deadlines in one place.

The project focuses on residents of Czechia, including foreigners and self-employed people who deal with unfamiliar administrative language. It combines document processing, contextual AI chat, and deadline management in a messenger-style interface.

This repository contains the **iOS and Android application**. The companion [FastAPI backend](https://github.com/Fleeploed/jasne-backend) handles OCR, AI analysis, retrieval, and background processing. Jasně is an MVP under active development; release readiness depends on service configuration and device testing.

## Main features

- **Document capture and import:** in-app camera, gallery images, and multi-page PDFs.
- **Structured explanations:** a summary of the document, required actions, relevant dates, and extracted details.
- **A conversation for each document:** streamed AI responses and contextual follow-up questions, subject to subscription limits.
- **Deadline management:** extracted and manually created reminders, completion tracking, and calendar export.
- **Czech administration tools:** multilingual help guides and OAMP immigration application status tracking.
- **Account and subscription flows:** Supabase authentication, RevenueCat integration, and account deletion with a recovery period.
- **Localization and themes:** Czech, English, Ukrainian, and Russian; light and dark interfaces.

## How it works

1. The user signs in and captures or selects a document.
2. The app uploads the file to private Supabase Storage using a user-scoped path.
3. The backend runs Azure Document Intelligence OCR, classifies the extracted text, retrieves relevant knowledge with pgvector, and generates a structured explanation with OpenAI models.
4. Server-Sent Events (SSE) deliver processing progress and streamed answers to the app.
5. The document becomes a chat thread, with deadlines managed through the backend and reminder jobs.

## Technology

| Area | Stack |
| --- | --- |
| Mobile | React Native 0.76, Expo SDK 52, TypeScript |
| Navigation | Expo Router |
| Server state and caching | TanStack Query |
| Authentication and files | Supabase Auth and Storage |
| Camera | React Native Vision Camera |
| UI | React Native StyleSheet, shared design tokens, custom components |
| Notifications and subscriptions | Expo Notifications, RevenueCat |
| Observability | Sentry, PostHog |
| Quality checks | TypeScript, ESLint, Jest, React Native Testing Library, GitHub Actions |

## Engineering focus

The application separates routes from feature modules and shared infrastructure. Particular attention goes to streaming responses, upload cleanup, user-scoped caches, subscription gating, localization, and restoring useful UI state when navigating between document threads.

Backend service credentials stay on the server. The mobile application uses client configuration and authenticated API requests; Supabase row-level security and backend authorization enforce access to user data.

## My contribution

Jasně is my personal project. I designed and developed the mobile application for explaining Czech official documents, and built its Python backend with FastAPI.

My work includes:

- Designing the REST API and integrating the mobile application with the backend.
- Integrating OCR and language models for document extraction, classification, and analysis.
- Implementing a retrieval-augmented generation (RAG) pipeline using PostgreSQL and pgvector to retrieve relevant reference information.

## About the developer

I am [Alisher Ibrayev](https://www.linkedin.com/in/alisher-ibrayev), a software engineer with experience in process automation, AI integrations, and Python backend development. My professional work includes UiPath automation, API integrations, Azure AI services, and automated evaluation of AI-agent responses. Jasně is my independent project applying these interests to document processing and a mobile user experience.

## Repository structure

```text
app/             Expo Router screens and layouts
src/features/    Authentication, scans, chat, deadlines, help, and profile
src/components/  Shared UI and design tokens
src/hooks/       Shared application hooks
src/lib/         API, streaming, localization, and service integrations
assets/          Fonts, icons, and branding
android/         Native Android project
ios/             Native iOS project
```

## Local development

Use Node.js 20 or newer and npm. Native builds require the Android SDK or macOS with Xcode and CocoaPods.

```sh
npm ci --legacy-peer-deps
cp .env.example .env
```

Fill in your own values in `.env`:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase public client key |
| `EXPO_PUBLIC_API_BASE_URL` | Backend API URL |

Optional RevenueCat, analytics, and error-reporting settings are listed in [`.env.example`](.env.example). For EAS builds, configure the variables in the corresponding EAS environment. RevenueCat SDK keys are supplied through the environment, not committed in `eas.json`.

```sh
npm run ios
# or
npm run android
```

Use `npm run start` to start Metro for an installed development build. Native camera modules require a development build; Expo Go is insufficient for the full application.

Configure OAuth providers and the `jasne://auth/callback` redirect in your own Supabase project. See the backend repository for API and database setup.

## Validation

```sh
npm run typecheck
npm run lint
npm run test -- --runInBand
```

## Configuration and credentials

Keep `.env` files, signing credentials, service-account files, and build tokens outside Git. Commit only configuration templates. All `EXPO_PUBLIC_*` values are bundled into the application and must be safe to expose to clients. Never put a Supabase service-role key, OpenAI key, Azure key, or Sentry upload token in an `EXPO_PUBLIC_*` variable.

Use EAS environment variables and GitHub Actions secrets for the services that need them. Do not include document text, personal information, or signed file URLs in analytics events.
