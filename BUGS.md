# Jasně — Backlog багов и задач

## 🔴 Критично — ✅ СДЕЛАНО

1. ✅ **401 мгновенно разлогинивает без попытки обновить токен**
   `src/lib/api.ts:36-38` и `src/lib/sse.ts:106-108`: на 401/403 сразу `supabase.auth.signOut()`.
   _Фикс: на 401 сначала `refreshSession()` + повтор запроса; `signOut()` только если refresh провалился. На 403 вообще не разлогинивать._

2. ✅ **Принудительный разлогин не чистит кэши — утечка данных между аккаунтами**
   Форс-разлогин из `api.ts:37` не сбрасывает PostHog, RevenueCat, React Query и AsyncStorage-чат-кэш (`chatThreadCache.ts`).
   _Фикс: единый `performSignOut()`: аналитика → покупки → `queryClient.clear()` → `invalidateChatCache()` → pinned/pending-сторы → `supabase.auth.signOut()`._

3. ✅ **SSE-стрим нельзя отменить, нет таймаута**
   `src/lib/sse.ts`: уход с экрана не останавливает стрим. `request.ontimeout` — мёртвый код (`timeout` не задан).
   _Фикс: вернуть `abort()` из `streamPost`, вызывать в cleanup эффекта; выставить `request.timeout` (60с). Рассмотреть `expo/fetch` (нет O(n²) на `responseText`)._

4. ✅ **`apiFetch` без таймаута + `AccountGate` блокирует приложение**
   `api.ts:24` — голый `fetch`; холодный старт Render = вечный спиннер.
   _Фикс: `AbortController` + таймаут 15-30с; в `AccountGate` кэшировать последний профиль в AsyncStorage, пускать сразу и ревалидировать в фоне._

5. ✅ **Pro-пользователь становится «free» при любой сетевой ошибке**
   `src/hooks/useSubscription.ts:23-24`: `catch { setPlan("free") }`. Каждый компонент делает отдельный запрос `/limits`.
   _Фикс: React Query + сохранение последнего известного плана; при ошибке — stale-значение, не «free»._

6. ✅ **Нет Sign in with Apple — реджект App Store**
   `AuthScreen.tsx` предлагает только Google OAuth. Guideline 4.8 блокирует iOS-релиз.
   _Фикс: `expo-apple-authentication` + `supabase.auth.signInWithIdToken({ provider: "apple" })`._

7. ✅ **Pro-контент раздаётся free-пользователям**
   `ProBlurSection.tsx:74-84`: настоящий контент рендерится, лишь прикрытый `BlurView`. Читается через перехват трафика / accessibility-инспектор.
   _Фикс: бэкенд не возвращает тело Pro-секций для плана free; клиент рендерит плейсхолдер._

---

## 🟠 Высокий приоритет — ✅ СДЕЛАНО

1. ✅ **Тап по пушу при убитом приложении теряется**
   `pushNotifications.ts` не вызывает `getLastNotificationResponseAsync()` при холодном старте.
   _Фикс: разовый чек при монтировании `RootNavigator`._

2. ✅ **Push-токен не отвязывается при выходе**
   После `signOut` токен остаётся на бэкенде → уведомления старого аккаунта на чужом устройстве.
   _Фикс: `DELETE /push-tokens` в `performSignOut()`._

3. ✅ **Ре-рендер всего списка сообщений на каждый SSE-токен**
   `ChatThreadScreen.tsx:441-446`: `setMessages` с `.map()` + пересчёт `displayMessages` на каждый токен.
   _Фикс: буфер в ref, флаш раз в 50-100 мс; стримящийся пузырь — отдельный компонент._

4. ✅ **Загрузка файлов через base64 в JS-памяти (OOM на слабых Android)**
   `scansApi.ts:129-130`: файл → base64 → ArrayBuffer (×2-3 памяти). `getPdfPageCount` парсит весь PDF ради счётчика.
   _Фикс: подписанные URL Supabase + `FileSystem.uploadAsync`; лимит размера до загрузки; прогресс и ретраи._

5. ✅ **Сессия Supabase в нешифрованном AsyncStorage**
   `supabase.ts:12` — обычный AsyncStorage для auth. Приложение работает с документами мигрантов.
   _Фикс: `expo-secure-store` как `storage` для auth._

6. ✅ **Снятые фото документов не удаляются из кэша**
   `NewScanScreen.tsx` — ни одного `deleteAsync`. Фото копятся в cache-директории навсегда.
   _Фикс: удалять локальные URI после успешной загрузки._

---

## 🟡 Средний приоритет

- [ ] `sse.ts:39-42` — `request.abort()` на HEADERS_RECEIVED теряет тело ошибки → generic-сообщение. Дать телу догрузиться, реджектить в `onload`.
- [ ] `config.ts:6` — fallback на Railway, а `.env.example` и STATUS_FRONTEND.json — Render. Свести к одному источнику правды.
- [ ] `pendingScanStore.ts` — только в памяти: kill приложения во время скана → карточка исчезает. Персистить в AsyncStorage.
- [ ] `chatThreadCache.ts:91-103` — read-modify-write гонка на `INDEX_KEY` при параллельных `setChatCache`. Сериализовать через промис-очередь.
- [ ] `useSubscription`/`AccountGate`/чат — ручной `useState+fetch`. Унифицировать на React Query.
- [ ] Даты: `new Date(\`${due_date}T12:00:00Z\`)` + локальные сравнения (`DeadlinesScreen.tsx:794,1271-1279`) сломается в TZ за ±12. Сравнивать строки `YYYY-MM-DD`.
- [ ] Локализация системных поверхностей: канал пушей «Deadline reminders» и iOS-permission-строки в `app.json` — только английский. Нужны `locales`/InfoPlist-локализации.
- [ ] Закрыть два устаревших TODO по отмене локальных уведомлений (`PrivacyScreen.tsx:66`, `ScanListScreen.tsx:181`).

---

## 🔵 Качество кода и архитектура

- [ ] Файлы-монстры: `DeadlinesScreen.tsx` (3277 стр.), `ChatThreadScreen.tsx` (2802), `OnboardingScreen.tsx` (2040), `NewScanScreen.tsx` (1977), `ScanListScreen.tsx` (1674). Разнести по `features/<x>/components/` + хуки (`useChatStream`, `useScanUpload`).
- [ ] 30 вызовов `console.*` — тонкая обёртка-логгер (в проде — только Sentry breadcrumbs).
- [ ] `isRecord()` продублирован в `apiErrors.ts`, `chatApi.ts`, `scansApi.ts` — экспортировать один.

---

## ➕ Что добавить

### Инженерные процессы

- [ ] **Тесты** — их ноль. Начать с: `parseSseChunk`/`consumeSseText`, `parseErrorBody`, `normalizeMimeType`/`extensionFor`, дата-хелперы дедлайнов, `sanitizeProps`, `oampIdentifier`. `jest-expo` + ~день.
- [ ] **ESLint + Prettier** — `eslint-config-expo`, плагины `react-hooks` и `@tanstack/query`.
- [ ] **CI** — GitHub Actions: `tsc --noEmit` + lint + тесты на каждый PR.
- [ ] **EAS Update (OTA)** — `expo-updates` не подключён; любой JS-фикс требует полного релиза через сторы.

### Продукт / UX

- [ ] Персист React Query кэша (`@tanstack/react-query-persist-client`) — офлайн-просмотр сканов/дедлайнов.
- [ ] Экспорт дедлайнов в календарь (`expo-calendar` или .ics).
- [ ] Биометрический замок (`expo-local-authentication`).
- [ ] Проверка минимальной версии приложения (endpoint `/meta` + экран «обновите приложение»).
- [ ] Доступность: `maxFontSizeMultiplier = 1` в help-секции — недоступно для крупного шрифта. Иконочным кнопкам не хватает `accessibilityLabel`.
