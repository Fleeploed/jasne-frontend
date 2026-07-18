import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewProps,
  useWindowDimensions,
} from "react-native";
// All animations run on react-native-reanimated, NOT RN's Animated. On RN 0.76
// with the New Architecture, native-driver Animated props flicker on Android
// whenever a Fabric commit lands mid-animation (step/phase state updates here
// do exactly that) — views blink for a frame. Reanimated applies updates
// through its own UI-thread ShadowTree integration and is immune.
import Reanimated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  interpolate,
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { BrandWordmark } from "@/components/BrandMark";
import { Icon, type IconName } from "@/components/Icon";
import { signInWithProvider, type SocialProvider } from "@/features/auth/socialAuth";
import { fonts, lightColors, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { useLocale } from "@/lib/LocaleContext";
import { normalizeLocale } from "@/lib/i18n";
import { TermsScreen } from "@/features/profile/TermsScreen";
import { PrivacyPolicyScreen } from "@/features/profile/PrivacyPolicyScreen";

type LanguageCode = "cs" | "en" | "uk" | "ru";

type OnboardingCopy = {
  back: string;
  skip: string;
  next: string;
  start: string;
  continue: string;
  replay: string;
  welcomeTitleA: string;
  welcomeTitleB: string;
  welcomeBody: string;
  welcomeBullets: [string, string, string];
  languageTitle: string;
  languageBody: string;
  scanTitle: string;
  scanBody: string;
  remindersTitle: string;
  remindersBody: string;
  banners: [
    { title: string; body: string },
    { title: string; body: string },
    { title: string; body: string },
    { title: string; body: string },
  ];
  guidesTitle: string;
  guidesBody: string;
  authTitle: string;
  authBody: string;
  authGoogle: string;
  authApple: string;
  authTrust: string;
  authLegal: string;
  authTermsLabel: string;
  authPrivacyLabel: string;
  // Demo result card
  cardEyebrow: string;
  cardTitle: string;
  cardLabelPayment: string;
  cardPaymentDate: string;
  cardReminderCta: string;
  cardLabelWhere: string;
  cardWhereMain: string;
  cardLabelWhat: string;
  cardWhatMain: string;
  cardLabelMiss: string;
  cardMissMain: string;
  cardLabelTip: string;
  cardTipMain: string;
};

const ONBOARDING_COPY: Record<LanguageCode, OnboardingCopy> = {
  ru: {
    back: "Назад",
    skip: "Пропустить",
    next: "Дальше",
    start: "Начать",
    continue: "Продолжить",
    replay: "Ещё раз",
    welcomeTitleA: "Чешские документы",
    welcomeTitleB: "— простым языком",
    welcomeBody: "Сфотографируйте официальное письмо, счёт или договор. Jasně объяснит, что это, что делать и до какого срока.",
    welcomeBullets: ["Официальные письма, счета, договоры", "Суть документа и следующие шаги", "Сроки и напоминания без ручного ввода"],
    languageTitle: "Выберите язык",
    languageBody: "Его можно изменить позже в настройках.",
    scanTitle: "Скан → понятный план действий",
    scanBody: "Jasně покажет суть документа, важные сроки, следующие шаги и возможные последствия.",
    remindersTitle: "Не пропустите важный срок",
    remindersBody: "Если в документе есть чёткая дата, Jasně найдёт её и предложит напоминание — без ручного ввода.",
    banners: [
      { title: "Через 30 дней", body: "Оплатить 2 450 Kč до 30 июня" },
      { title: "Через 14 дней", body: "Оплатить 2 450 Kč до 30 июня" },
      { title: "Через 7 дней", body: "Оплатить 2 450 Kč — не пропустите" },
      { title: "Завтра", body: "Оплатить 2 450 Kč" },
    ],
    guidesTitle: "Помощь, даже без документа",
    guidesBody: "Пошаговые инструкции: как продлить вид на жительство, подать налоговую декларацию или оплатить счёт. Простыми словами.",
    authTitle: "Начните бесплатно",
    authBody: "5 документов в месяц бесплатно. Без карты.",
    authGoogle: "Продолжить с Google",
    authApple: "Продолжить с Apple",
    authTrust: "Документы хранятся в защищённом хранилище и доступны только в вашем аккаунте.",
    authLegal: "Продолжая, вы принимаете {terms} и {privacy}.",
    authTermsLabel: "Условия использования",
    authPrivacyLabel: "Политику конфиденциальности",
    cardEyebrow: "СЧЕТА",
    cardTitle: "Счёт к оплате",
    cardLabelPayment: "СРОК ОПЛАТЫ",
    cardPaymentDate: "до 30 июня 2026",
    cardReminderCta: "Добавить напоминание",
    cardLabelWhere: "КУДА ОБРАЩАТЬСЯ",
    cardWhereMain: "Finanční úřad, Praha 3",
    cardLabelWhat: "ЧТО СДЕЛАТЬ",
    cardWhatMain: "Оплатите сумму из документа и сохраните подтверждение оплаты.",
    cardLabelMiss: "ЕСЛИ ПРОПУСТИТЬ СРОК",
    cardMissMain: "Могут начислить пеню, а долг могут начать взыскивать.",
    cardLabelTip: "СОВЕТ",
    cardTipMain: "Проверьте реквизиты в документе и сохраните подтверждение оплаты.",
  },
  cs: {
    back: "Zpět",
    skip: "Přeskočit",
    next: "Dál",
    start: "Začít",
    continue: "Pokračovat",
    replay: "Znovu",
    welcomeTitleA: "České dokumenty",
    welcomeTitleB: "jednoduše",
    welcomeBody: "Vyfoťte dopis z úřadu, fakturu nebo smlouvu. Jasně vysvětlí, co to je, co máte udělat a do kdy.",
    welcomeBullets: ["Dopisy z úřadu, faktury, smlouvy", "Shrnutí a další kroky", "Lhůty a připomenutí bez opisování"],
    languageTitle: "Vyberte jazyk",
    languageBody: "Jazyk můžete později změnit v nastavení.",
    scanTitle: "Sken → jasný plán kroků",
    scanBody: "Jasně ukáže shrnutí dokumentu, důležité lhůty, další kroky a možné následky.",
    remindersTitle: "Nezmeškejte důležitou lhůtu",
    remindersBody: "Když je v dokumentu jasně uvedené datum, Jasně ho najde a nabídne připomenutí — bez ručního opisování.",
    banners: [
      { title: "Za 30 dní", body: "Zaplatit 2 450 Kč do 30. června" },
      { title: "Za 14 dní", body: "Zaplatit 2 450 Kč do 30. června" },
      { title: "Za 7 dní", body: "Zaplatit 2 450 Kč — nezapomeňte" },
      { title: "Zítra", body: "Zaplatit 2 450 Kč" },
    ],
    guidesTitle: "Pomoc i bez dokumentu",
    guidesBody: "Návody krok za krokem: pobyt, daňové přiznání nebo platba účtu. Jednoduše, bez úředničiny.",
    authTitle: "Začněte zdarma",
    authBody: "5 dokumentů měsíčně zdarma. Bez karty.",
    authGoogle: "Pokračovat s Google",
    authApple: "Pokračovat s Apple",
    authTrust: "Dokumenty jsou uložené v chráněném úložišti a dostupné jen ve vašem účtu.",
    authLegal: "Pokračováním přijímáte {terms} a {privacy}.",
    authTermsLabel: "Podmínky používání",
    authPrivacyLabel: "Zásady ochrany osobních údajů",
    cardEyebrow: "FAKTURY",
    cardTitle: "Faktura k úhradě",
    cardLabelPayment: "TERMÍN PLATBY",
    cardPaymentDate: "do 30. června 2026",
    cardReminderCta: "Přidat připomenutí",
    cardLabelWhere: "KAM SE OBRÁTIT",
    cardWhereMain: "Finanční úřad, Praha 3",
    cardLabelWhat: "CO UDĚLAT",
    cardWhatMain: "Zaplaťte částku z dokumentu a uložte si potvrzení o platbě.",
    cardLabelMiss: "KDYŽ LHŮTU ZMEŠKÁTE",
    cardMissMain: "Může se začít počítat úrok z prodlení a dluh může být vymáhán.",
    cardLabelTip: "TIP",
    cardTipMain: "Zkontrolujte platební údaje v dokumentu a uložte si potvrzení o platbě.",
  },
  en: {
    back: "Back",
    skip: "Skip",
    next: "Next",
    start: "Get started",
    continue: "Continue",
    replay: "Replay",
    welcomeTitleA: "Czech documents,",
    welcomeTitleB: "explained simply",
    welcomeBody: "Take a photo of a letter from an office, bill, or contract. Jasně explains what it means, what to do next, and the deadline.",
    welcomeBullets: ["Letters from offices, bills, contracts", "Summary and next steps", "Deadlines and reminders without manual entry"],
    languageTitle: "Choose your language",
    languageBody: "You can change this later in Settings.",
    scanTitle: "Scan → clear action plan",
    scanBody: "Jasně shows the document summary, important deadlines, next steps, and possible consequences.",
    remindersTitle: "Do not miss an important deadline",
    remindersBody: "When a document clearly contains a date, Jasně finds it and offers a reminder — no manual entry needed.",
    banners: [
      { title: "In 30 days", body: "Pay 2,450 Kč by June 30" },
      { title: "In 14 days", body: "Pay 2,450 Kč by June 30" },
      { title: "In 3 days", body: "Pay 2,450 Kč — don't forget" },
      { title: "Tomorrow", body: "Pay 2,450 Kč" },
    ],
    guidesTitle: "Help, even without a document",
    guidesBody: "Step-by-step guides for pobyt, tax returns, and bills. Simple explanations without bureaucratic wording.",
    authTitle: "Start for free",
    authBody: "5 documents per month for free. No card required.",
    authGoogle: "Continue with Google",
    authApple: "Continue with Apple",
    authTrust: "Your documents are stored in protected storage and are available only in your account.",
    authLegal: "By continuing, you accept {terms} and {privacy}.",
    authTermsLabel: "Terms of Use",
    authPrivacyLabel: "Privacy Policy",
    cardEyebrow: "BILLS",
    cardTitle: "Bill to pay",
    cardLabelPayment: "PAYMENT DEADLINE",
    cardPaymentDate: "by June 30, 2026",
    cardReminderCta: "Add reminder",
    cardLabelWhere: "WHERE TO CONTACT",
    cardWhereMain: "Finanční úřad, Praha 3",
    cardLabelWhat: "WHAT TO DO",
    cardWhatMain: "Pay the amount from the document and keep the payment confirmation.",
    cardLabelMiss: "IF YOU MISS THE DEADLINE",
    cardMissMain: "Interest may be charged, and the debt may be collected.",
    cardLabelTip: "TIP",
    cardTipMain: "Check the payment details in the document and keep the payment confirmation.",
  },
  uk: {
    back: "Назад",
    skip: "Пропустити",
    next: "Далі",
    start: "Почати",
    continue: "Продовжити",
    replay: "Ще раз",
    welcomeTitleA: "Чеські документи",
    welcomeTitleB: "— простими словами",
    welcomeBody: "Сфотографуйте офіційний лист, рахунок або договір. Jasně пояснить, що це, що робити далі й до якої дати.",
    welcomeBullets: ["Офіційні листи, рахунки, договори", "Суть документа й наступні кроки", "Строки та нагадування без ручного вводу"],
    languageTitle: "Оберіть мову",
    languageBody: "Її можна змінити пізніше в налаштуваннях.",
    scanTitle: "Скан → зрозумілий план дій",
    scanBody: "Jasně покаже суть документа, важливі строки, наступні кроки й можливі наслідки.",
    remindersTitle: "Не пропустіть важливий строк",
    remindersBody: "Якщо в документі є чітка дата, Jasně знайде її й запропонує нагадування — без ручного вводу.",
    banners: [
      { title: "Через 30 днів", body: "Сплатити 2 450 Kč до 30 червня" },
      { title: "Через 14 днів", body: "Сплатити 2 450 Kč до 30 червня" },
      { title: "Через 7 днів", body: "Сплатити 2 450 Kč — не пропустіть" },
      { title: "Завтра", body: "Сплатити 2 450 Kč" },
    ],
    guidesTitle: "Допомога навіть без документа",
    guidesBody: "Покрокові інструкції: як продовжити дозвіл на проживання, подати податкову декларацію або оплатити рахунок. Просто, без бюрократії.",
    authTitle: "Почніть безкоштовно",
    authBody: "5 документів на місяць безкоштовно. Без картки.",
    authGoogle: "Продовжити з Google",
    authApple: "Продовжити з Apple",
    authTrust: "Документи зберігаються в захищеному сховищі й доступні лише у вашому акаунті.",
    authLegal: "Продовжуючи, ви приймаєте {terms} і {privacy}.",
    authTermsLabel: "Умови використання",
    authPrivacyLabel: "Політику конфіденційності",
    cardEyebrow: "РАХУНКИ",
    cardTitle: "Рахунок до оплати",
    cardLabelPayment: "СТРОК ОПЛАТИ",
    cardPaymentDate: "до 30 червня 2026",
    cardReminderCta: "Додати нагадування",
    cardLabelWhere: "КУДИ ЗВЕРТАТИСЯ",
    cardWhereMain: "Finanční úřad, Praha 3",
    cardLabelWhat: "ЩО ЗРОБИТИ",
    cardWhatMain: "Сплатіть суму з документа й збережіть підтвердження оплати.",
    cardLabelMiss: "ЯКЩО ПРОПУСТИТИ СТРОК",
    cardMissMain: "Можуть нарахувати пеню, а борг можуть почати стягувати.",
    cardLabelTip: "ПОРАДА",
    cardTipMain: "Перевірте платіжні реквізити в документі й збережіть підтвердження оплати.",
  },
};

const LANGUAGE_OPTIONS: { code: LanguageCode; label: string }[] = [
  { code: "cs", label: "Čeština" },
  { code: "en", label: "English" },
  { code: "uk", label: "Українська" },
  { code: "ru", label: "Русский" },
];

const GUIDE_TOPICS: Record<LanguageCode, { icon: IconName; title: string; sub: string; tone: GuideTone }[]> = {
  ru: [
    { icon: "globe", title: "Визы и проживание", sub: "МВД Чехии, разрешения", tone: "blue" },
    { icon: "doc-text", title: "Налоги", sub: "Декларация, НДС, OSVČ", tone: "amber" },
    { icon: "zap", title: "Счета и платежи", sub: "Электричество, газ, вода, интернет", tone: "green" },
    { icon: "briefcase", title: "Úřad práce", sub: "Безработица, пособия", tone: "purple" },
    { icon: "pages", title: "Договоры", sub: "Аренда, работа, услуги", tone: "blue" },
    { icon: "shield", title: "Медицинская страховка", sub: "VZP, страховые, обязанности", tone: "red" },
  ],
  cs: [
    { icon: "globe", title: "Víza a pobyt", sub: "MV ČR, povolení, OAMP", tone: "blue" },
    { icon: "doc-text", title: "Daně", sub: "Přiznání, DPH, OSVČ", tone: "amber" },
    { icon: "zap", title: "Účty a platby", sub: "Elektřina, plyn, voda, internet", tone: "green" },
    { icon: "briefcase", title: "Úřad práce", sub: "Nezaměstnanost, dávky", tone: "purple" },
    { icon: "pages", title: "Smlouvy", sub: "Nájem, práce, služby", tone: "blue" },
    { icon: "shield", title: "Zdravotní pojištění", sub: "VZP, pojišťovny, povinnosti", tone: "red" },
  ],
  en: [
    { icon: "globe", title: "Visas and pobyt", sub: "Czech Ministry, permits, OAMP", tone: "blue" },
    { icon: "doc-text", title: "Taxes", sub: "Tax returns, VAT, OSVČ", tone: "amber" },
    { icon: "zap", title: "Bills and payments", sub: "Electricity, gas, water, internet", tone: "green" },
    { icon: "briefcase", title: "Úřad práce", sub: "Unemployment, benefits", tone: "purple" },
    { icon: "pages", title: "Contracts", sub: "Rental, work, services", tone: "blue" },
    { icon: "shield", title: "Health insurance", sub: "VZP, insurers, obligations", tone: "red" },
  ],
  uk: [
    { icon: "globe", title: "Візи та проживання", sub: "МВС Чехії, дозволи, OAMP", tone: "blue" },
    { icon: "doc-text", title: "Податки", sub: "Декларація, ПДВ, OSVČ", tone: "amber" },
    { icon: "zap", title: "Рахунки та платежі", sub: "Електрика, газ, вода, інтернет", tone: "green" },
    { icon: "briefcase", title: "Úřad práce", sub: "Безробіття, допомоги", tone: "purple" },
    { icon: "pages", title: "Договори", sub: "Оренда, робота, послуги", tone: "blue" },
    { icon: "shield", title: "Медичне страхування", sub: "VZP, страховики, зобов'язання", tone: "red" },
  ],
};

type GuideTone = "blue" | "amber" | "green" | "purple" | "red";
type Tone = "blue" | "amber" | "red" | "green";

const SLIDE_COUNT = 6;
const SPRING = Easing.bezier(0.2, 0.8, 0.2, 1);
const OVERSHOOT = Easing.bezier(0.34, 1.56, 0.64, 1);
const LEGAL_CONTENT_DELAY_MS = 380;

// startAtAuth: open directly on the last (auth) slide — this doubles as the
// app's only sign-in screen for users who have already seen the onboarding
// (the standalone email/password AuthScreen was removed). Swiping back through
// the earlier slides remains available as a product tour.
export function OnboardingScreen({ onComplete, startAtAuth = false }: { onComplete: () => void; startAtAuth?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { locale, changeLocale } = useLocale();
  const [step, setStep] = useState(startAtAuth ? SLIDE_COUNT - 1 : 0);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(() => normalizeLocale(locale) as LanguageCode);
  const [legalWindow, setLegalWindow] = useState<"terms" | "privacy" | null>(null);
  const [legalContentReady, setLegalContentReady] = useState(false);
  const userPickedLanguage = useRef(false);
  const offset = useSharedValue(startAtAuth ? -(SLIDE_COUNT - 1) * width : 0);
  const legalOffset = useSharedValue(width);
  const legalReturnStepRef = useRef(SLIDE_COUNT - 1);
  // Three-button Android navigation can overlay transparent app content without
  // always reporting a bottom inset, so keep the CTA above that system area.
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 40 : 0);
  const styles = useMemo(() => createStyles(colors, insets.top, bottomInset), [colors, insets.top, bottomInset]);
  const copy = ONBOARDING_COPY[selectedLanguage];
  const isLight = colors.bg === lightColors.bg;
  const statusStyle = isLight ? "dark" : "light";

  useEffect(() => {
    offset.value = withTiming(-step * width, { duration: 600, easing: SPRING });
  }, [offset, step, width]);

  useEffect(() => {
    if (!legalWindow) return;
    setLegalContentReady(false);
    legalOffset.value = width;
    legalOffset.value = withTiming(0, { duration: 360, easing: SPRING });

    const timer = setTimeout(() => {
      setLegalContentReady(true);
    }, LEGAL_CONTENT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [legalOffset, legalWindow, width]);

  useEffect(() => {
    if (userPickedLanguage.current) return;
    setSelectedLanguage(normalizeLocale(locale) as LanguageCode);
  }, [locale]);

  function goNext() {
    if (step === SLIDE_COUNT - 1) {
      onComplete();
      return;
    }
    setStep((current) => Math.min(current + 1, SLIDE_COUNT - 1));
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function goSkip() {
    setStep(SLIDE_COUNT - 1);
  }

  // Horizontal swipe to move between slides: right → back, left → next. Only
  // captures clear horizontal drags so taps and the slides' controls still
  // work. Swiping left on the last slide does nothing (completion stays an
  // explicit CTA tap, never an accidental swipe).
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4,
      onPanResponderRelease: (_, { dx, vx }) => {
        if (dx > 56 || vx > 0.4) setStep((current) => Math.max(current - 1, 0));
        else if (dx < -56 || vx < -0.4) setStep((current) => Math.min(current + 1, SLIDE_COUNT - 1));
      },
    })
  ).current;

  function selectLanguage(next: LanguageCode) {
    userPickedLanguage.current = true;
    setSelectedLanguage(next);
    void changeLocale(next);
  }

  const openLegalWindow = useCallback((target: "terms" | "privacy") => {
    legalReturnStepRef.current = step;
    legalOffset.value = width;
    setLegalWindow(target);
  }, [legalOffset, step, width]);

  const dismissLegalWindow = useCallback(() => {
    setLegalWindow(null);
  }, []);

  const closeLegalWindow = useCallback(() => {
    setStep(legalReturnStepRef.current);
    setLegalContentReady(false);
    legalOffset.value = withTiming(width, { duration: 300, easing: SPRING }, (finished) => {
      if (finished) runOnJS(dismissLegalWindow)();
    });
  }, [dismissLegalWindow, legalOffset, width]);

  useEffect(() => {
    if (Platform.OS !== "android" || legalWindow === null) return undefined;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeLegalWindow();
      return true;
    });

    return () => subscription.remove();
  }, [closeLegalWindow, legalWindow]);

  const legalSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, { dx, dy }) =>
          legalWindow !== null && dx > 16 && Math.abs(dx) > Math.abs(dy) * 1.25,
        onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
          legalWindow !== null && dx > 16 && Math.abs(dx) > Math.abs(dy) * 1.25,
        onPanResponderGrant: () => {
          cancelAnimation(legalOffset);
        },
        onPanResponderMove: (_, { dx }) => {
          legalOffset.value = Math.max(0, dx);
        },
        onPanResponderRelease: (_, { dx, vx }) => {
          if (dx > width * 0.22 || vx > 0.45) {
            closeLegalWindow();
            return;
          }
          legalOffset.value = withSpring(0, { damping: 24, stiffness: 240, mass: 0.9 });
        },
      }),
    [closeLegalWindow, legalOffset, legalWindow, width],
  );

  const legalEdgeSwipe = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => legalWindow !== null,
        onPanResponderGrant: () => {
          cancelAnimation(legalOffset);
        },
        onPanResponderMove: (_, { dx }) => {
          legalOffset.value = Math.max(0, dx);
        },
        onPanResponderRelease: (_, { dx, vx }) => {
          if (dx > width * 0.18 || vx > 0.35) {
            closeLegalWindow();
            return;
          }
          legalOffset.value = withSpring(0, { damping: 24, stiffness: 240, mass: 0.9 });
        },
      }),
    [closeLegalWindow, legalOffset, legalWindow, width],
  );

  const trackAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  const legalAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: legalOffset.value }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} {...(legalWindow ? {} : swipe.panHandlers)}>
      <StatusBar style={statusStyle} backgroundColor={colors.bg} />
      <BgGlow step={step} isLight={isLight} />
      <View pointerEvents="none" style={[stylesStatic.vignette, { borderColor: colors.bgDeep }]} />

      <View style={[styles.chrome, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.back}
          disabled={step === 0}
          onPress={goBack}
          style={({ pressed }) => [
            styles.chromeButton,
            step === 0 && styles.chromeButtonMuted,
            pressed && step !== 0 && styles.pressed,
          ]}
        >
          <Icon name="chevron-left" size={24} color={colors.muted2} />
        </Pressable>
        <View style={styles.progressRow} accessible accessibilityLabel={`${step + 1} / ${SLIDE_COUNT}`}>
          {Array.from({ length: SLIDE_COUNT }).map((_, index) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${index + 1} / ${SLIDE_COUNT}`}
              onPress={() => setStep(index)}
              style={[
                styles.progressDot,
                index === step ? styles.progressDotActive : null,
                { backgroundColor: index === step ? colors.primary : colors.muted3 },
              ]}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.skip}
          onPress={goSkip}
          disabled={step === SLIDE_COUNT - 1}
          style={({ pressed }) => [
            styles.skipButton,
            step === SLIDE_COUNT - 1 && styles.skipButtonHidden,
            pressed && step !== SLIDE_COUNT - 1 && styles.pressed,
          ]}
        >
          <Text style={styles.skipText}>{copy.skip}</Text>
        </Pressable>
      </View>

      <Reanimated.View
        style={[
          styles.track,
          { width: width * SLIDE_COUNT },
          trackAnimatedStyle,
        ]}
      >
        <SlidePage width={width}>
          <WelcomeSlide active={step === 0} copy={copy} colors={colors} styles={styles} onNext={goNext} />
        </SlidePage>
        <SlidePage width={width}>
          <LanguageSlide
            active={step === 1}
            copy={copy}
            colors={colors}
            styles={styles}
            selectedLanguage={selectedLanguage}
            onSelect={selectLanguage}
            onNext={goNext}
          />
        </SlidePage>
        <SlidePage width={width}>
          <ScanSlide active={step === 2} copy={copy} colors={colors} styles={styles} onNext={goNext} />
        </SlidePage>
        <SlidePage width={width}>
          <RemindersSlide active={step === 3} copy={copy} colors={colors} styles={styles} onNext={goNext} />
        </SlidePage>
        <SlidePage width={width}>
          <GuidesSlide active={step === 4} copy={copy} lang={selectedLanguage} colors={colors} styles={styles} onNext={goNext} />
        </SlidePage>
        <SlidePage width={width}>
          <AuthLandingSlide
            active={step === 5}
            copy={copy}
            colors={colors}
            styles={styles}
            onRestart={() => setStep(0)}
            onComplete={onComplete}
            onOpenTerms={() => openLegalWindow("terms")}
            onOpenPrivacy={() => openLegalWindow("privacy")}
          />
        </SlidePage>
      </Reanimated.View>
      {legalWindow ? (
        <Reanimated.View
          {...legalSwipe.panHandlers}
          style={[styles.legalOverlay, legalAnimatedStyle]}
        >
          {legalContentReady ? (
            legalWindow === "terms" ? (
              <TermsScreen onBack={closeLegalWindow} backLabel={copy.back} localeOverride={selectedLanguage} />
            ) : (
              <PrivacyPolicyScreen onBack={closeLegalWindow} backLabel={copy.back} localeOverride={selectedLanguage} />
            )
          ) : (
            <View style={styles.legalLoading}>
              <ActivityIndicator color={colors.brandBlue} />
            </View>
          )}
          <View style={styles.legalSwipeEdge} {...legalEdgeSwipe.panHandlers} />
        </Reanimated.View>
      ) : null}
    </View>
  );
}

function SlidePage({ children, width }: { children: React.ReactNode; width: number }) {
  return <View style={{ width, flex: 1 }}>{children}</View>;
}

/* ───────────────────────── Background glow ─────────────────────────
   Port of v2's <BgGlow>: radial glows whose color and opacity shift per step.
   RN has no CSS radial-gradient, so each glow is an <Svg> radial gradient
   inside an absolutely-positioned Reanimated.View. The continuous "breathing"
   loop was removed: recompositing the full-screen translucent glow stack every
   frame overwhelms mid-range Android GPUs (Mali), so the glows now only
   animate during the 700ms step transition and the scene is static at rest. */

// Step indices: 0=welcome 1=language 2=scan 3=reminders 4=guides 5=auth
const GLOW_STEPS = [0, 1, 2, 3, 4, 5];

function BgGlow({ step, isLight }: { step: number; isLight: boolean }) {
  const stepAnim = useSharedValue(step);
  const factor = isLight ? 0.4 : 1;

  useEffect(() => {
    stepAnim.value = withTiming(step, { duration: 700, easing: Easing.inOut(Easing.ease) });
  }, [stepAnim, step]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GlowLayer
        size={620}
        left="50%"
        top="34%"
        color="#6FA0E6"
        alpha={0.28}
        stepAnim={stepAnim}
        opacityRange={[factor, factor, factor, factor * 0.3, factor, factor]}
        shiftRange={[0, -26, 0, 0, 0, 130]}
      />
      <GlowLayer
        size={500}
        left="58%"
        top="72%"
        color="#C89650"
        alpha={0.14}
        stepAnim={stepAnim}
        opacityRange={[factor, factor * 0.35, factor * 0.35, 0, factor * 0.35, factor]}
      />
      {/* Reminder-slide glows, kept clear of the card band. */}
      <GlowLayer
        size={480}
        left="40%"
        top="14%"
        color="#E0B45A"
        alpha={0.2}
        stepAnim={stepAnim}
        opacityRange={[0, 0, 0, factor, 0, 0]}
      />
      <GlowLayer
        size={520}
        left="50%"
        top="93%"
        color="#E07F73"
        alpha={0.18}
        stepAnim={stepAnim}
        opacityRange={[0, 0, 0, factor, 0, 0]}
      />
    </View>
  );
}

let glowIdCounter = 0;

function GlowLayer({
  size,
  left,
  top,
  color,
  alpha,
  stepAnim,
  opacityRange,
  shiftRange,
}: {
  size: number;
  left: string;
  top: string;
  color: string;
  alpha: number;
  stepAnim: SharedValue<number>;
  opacityRange: number[];
  shiftRange?: number[];
}) {
  const gradientId = useRef(`onbGlow${glowIdCounter++}`).current;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stepAnim.value, GLOW_STEPS, opacityRange),
    transform: shiftRange ? [{ translateY: interpolate(stepAnim.value, GLOW_STEPS, shiftRange) }] : [],
  }));

  return (
    <Reanimated.View
      style={[
        {
          position: "absolute",
          left: left as unknown as number,
          top: top as unknown as number,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        animatedStyle,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={alpha} />
            <Stop offset="0.54" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
    </Reanimated.View>
  );
}

/* ───────────────────────── S1 · Welcome ───────────────────────── */

function WelcomeSlide({ active, copy, colors, styles, onNext }: SlideProps & { onNext: () => void }) {
  const entries = useStagger(active, 6);

  return (
    <View style={styles.slide}>
      <View style={styles.welcomeCenter}>
        <StaggerView entry={entries[0]}>
          <BrandWordmark height={48} />
        </StaggerView>
        <View style={styles.titleBlock}>
          <StaggerText entry={entries[1]} style={styles.heroTitle}>{copy.welcomeTitleA}</StaggerText>
          <StaggerText entry={entries[2]} style={styles.heroTitle}>{copy.welcomeTitleB}</StaggerText>
        </View>
        <StaggerText entry={entries[3]} style={styles.heroBody}>{copy.welcomeBody}</StaggerText>
        <StaggerView entry={entries[4]} style={styles.welcomeBullets}>
          {copy.welcomeBullets.map((bullet, i) => (
            <View key={i} style={styles.welcomeBulletRow}>
              <View style={[styles.welcomeBulletDot, { backgroundColor: colors.brandBlue }]} />
              <Text style={styles.welcomeBulletText}>{bullet}</Text>
            </View>
          ))}
        </StaggerView>
      </View>
      <StaggerView entry={entries[5]} style={styles.bottomCta}>
        <PrimaryCTA label={copy.start} onPress={onNext} colors={colors} styles={styles} />
      </StaggerView>
    </View>
  );
}

/* ───────────────────────── S2 · Language ───────────────────────── */

function LanguageSlide({
  active,
  copy,
  colors,
  styles,
  selectedLanguage,
  onSelect,
  onNext,
}: SlideProps & {
  selectedLanguage: LanguageCode;
  onSelect: (code: LanguageCode) => void;
  onNext: () => void;
}) {
  const entries = useStagger(active, 7);

  return (
    <View style={styles.slide}>
      <View style={styles.slideHeader}>
        <StaggerText entry={entries[0]} style={styles.languageTitle}>{copy.languageTitle}</StaggerText>
        <StaggerText entry={entries[1]} style={styles.slideBody}>{copy.languageBody}</StaggerText>
      </View>
      <View style={styles.languageGroup}>
        {LANGUAGE_OPTIONS.map((option, index) => {
          const selected = option.code === selectedLanguage;
          return (
            <LanguageRow
              key={option.code}
              option={option}
              selected={selected}
              colors={colors}
              styles={styles}
              entry={entries[index + 2]}
              onPress={() => onSelect(option.code)}
            />
          );
        })}
      </View>
      <StaggerView entry={entries[6]} style={styles.bottomCta}>
        <PrimaryCTA label={copy.continue} onPress={onNext} colors={colors} styles={styles} />
      </StaggerView>
    </View>
  );
}

function LanguageRow({
  option,
  selected,
  colors,
  styles,
  entry,
  onPress,
}: {
  option: { code: LanguageCode; label: string };
  selected: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  entry: SharedValue<number>;
  onPress: () => void;
}) {
  // Selected rows lift slightly (scale 1.02) and the check mark pops in.
  const lift = useSharedValue(selected ? 1 : 0);
  const check = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    lift.value = withTiming(selected ? 1 : 0, { duration: 280, easing: SPRING });
    check.value = withTiming(selected ? 1 : 0, { duration: 350, easing: OVERSHOOT });
  }, [selected, lift, check]);

  // Stagger entrance and the selection lift compose into one scale factor
  // (successive scale transforms multiply, so this matches the old stack).
  const rowStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: [
      { translateY: interpolate(entry.value, [0, 1], [16, 0]) },
      { scale: interpolate(entry.value, [0, 1], [0.985, 1]) * interpolate(lift.value, [0, 1], [1, 1.02]) },
    ],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: interpolate(check.value, [0, 1], [0.65, 1]) }],
  }));

  return (
    <Reanimated.View style={rowStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.languageRow, selected && styles.languageRowSelected, pressed && styles.pressedScale]}
      >
        <FlagIcon code={option.code} />
        <Text style={[styles.languageText, selected && styles.languageTextSelected]}>{option.label}</Text>
        <Reanimated.View
          style={[styles.languageCheck, selected && styles.languageCheckSelected, checkStyle]}
        >
          {selected ? <Icon name="check" size={14} color={colors.textOnAccent} /> : null}
        </Reanimated.View>
      </Pressable>
    </Reanimated.View>
  );
}

/* ───────────────────────── S3 · Scan reveal ───────────────────────── */

function ScanSlide({ active, copy, colors, styles, onNext }: SlideProps & { onNext: () => void }) {
  const entries = useStagger(active, 4);

  return (
    <View style={styles.slide}>
      <View style={styles.slideHeader}>
        <StaggerText entry={entries[0]} style={styles.slideTitle}>{copy.scanTitle}</StaggerText>
        <StaggerText entry={entries[1]} style={styles.slideBody}>{copy.scanBody}</StaggerText>
      </View>
      <StaggerView entry={entries[2]} style={styles.scanHeroWrap}>
        <ScanReveal active={active} copy={copy} colors={colors} styles={styles} />
      </StaggerView>
      <StaggerView entry={entries[3]} style={styles.ctaSpacing}>
        <PrimaryCTA label={copy.next} onPress={onNext} colors={colors} styles={styles} />
      </StaggerView>
    </View>
  );
}

// Phase timeline (ms) mirroring v2's <ScanReveal>. The paper sweeps, morphs
// away, then the result card assembles section-by-section.
const SCAN_SWEEP_DELAY = 250;
const SCAN_SWEEP_DURATION = 1150;
const SCAN_PHASES: { at: number; phase: number }[] = [
  { at: 1500, phase: 2 }, // paper → card morph + header
  { at: 1900, phase: 3 },
  { at: 2150, phase: 4 }, // payment + reminder button
  { at: 2400, phase: 5 }, // where to go
  { at: 2600, phase: 6 }, // what to bring
  { at: 2800, phase: 7 }, // penalty
  { at: 3000, phase: 8 }, // tip
  { at: 3200, phase: 9 }, // replay available
];

function ScanReveal({
  active,
  copy,
  colors,
  styles,
}: {
  active: boolean;
  copy: OnboardingCopy;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const [phase, setPhase] = useState(0);
  const [paperHeight, setPaperHeight] = useState(248);
  const scanned = useSharedValue(0);
  const morph = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const run = () => {
    clearTimers();
    cancelAnimation(scanned);
    cancelAnimation(morph);
    scanned.value = 0;
    morph.value = 0;
    setPhase(1);
    scanned.value = withDelay(
      SCAN_SWEEP_DELAY,
      withTiming(1, { duration: SCAN_SWEEP_DURATION, easing: Easing.inOut(Easing.cubic) })
    );
    SCAN_PHASES.forEach(({ at, phase: p }) => {
      timers.current.push(
        setTimeout(() => {
          setPhase(p);
          if (p === 2) {
            morph.value = withTiming(1, { duration: 500, easing: SPRING });
          }
        }, at)
      );
    });
  };

  useEffect(() => {
    if (active) {
      run();
    } else {
      clearTimers();
      cancelAnimation(scanned);
      cancelAnimation(morph);
      scanned.value = 0;
      morph.value = 0;
      setPhase(0);
    }
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onPaperLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (next > 0 && Math.abs(next - paperHeight) > 1) setPaperHeight(next);
  };

  const replayReady = phase >= 9;
  const paperStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0, 1], [1, 0]),
    transform: [
      { translateY: interpolate(morph.value, [0, 1], [0, -8]) },
      { scale: interpolate(morph.value, [0, 1], [1, 0.82]) },
    ],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: morph.value,
    transform: [{ translateY: -20 }, { scale: interpolate(morph.value, [0, 1], [0.96, 1]) }],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scanned.value, [0, 1], [0, paperHeight]) }],
  }));
  // Grow the wash from the top via scaleY instead of animating `height`, which
  // would force a layout pass every frame. Scaling happens around the view's
  // center, so translateY compensates to keep the top edge pinned.
  const washStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scanned.value, [0, 1], [-paperHeight / 2, 0]) },
      { scaleY: scanned.value },
    ],
  }));

  return (
    <View style={styles.scanStage}>
      <Reanimated.View style={[stylesStatic.scanLayer, paperStyle]}>
        <View onLayout={onPaperLayout}>
          <PaperDoc colors={colors} />
          {phase === 1 ? (
            <>
              <Reanimated.View
                pointerEvents="none"
                style={[stylesStatic.scanWash, { height: paperHeight, backgroundColor: colors.blueSoft }, washStyle]}
              />
              <Reanimated.View
                pointerEvents="none"
                style={[
                  stylesStatic.scanLine,
                  { backgroundColor: colors.brandBlue, shadowColor: colors.brandBlue },
                  lineStyle,
                ]}
              />
            </>
          ) : null}
        </View>
      </Reanimated.View>

      <Reanimated.View pointerEvents="none" style={[stylesStatic.scanLayer, cardStyle]}>
        <AssemblingCard phase={phase} copy={copy} colors={colors} styles={styles} />
      </Reanimated.View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.replay}
        onPress={run}
        disabled={!replayReady}
        style={({ pressed }) => [styles.replayButton, { opacity: replayReady ? 1 : 0 }, pressed && styles.pressed]}
      >
        <Icon name="restore" size={13} color={colors.muted2} />
        <Text style={styles.replayText}>{copy.replay}</Text>
      </Pressable>
    </View>
  );
}

// Threshold = the phase at which each slot reveals. Mirrors v2's show(p).
const SECTION_SLOTS = [3, 4, 4, 5, 6, 7, 8]; // header, payment, button, where, bring, penalty, tip

function AssemblingCard({
  phase,
  copy,
  colors,
  styles,
}: {
  phase: number;
  copy: OnboardingCopy;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const slots = useRef(SECTION_SLOTS.map(() => makeMutable(0))).current;

  useEffect(() => {
    SECTION_SLOTS.forEach((threshold, index) => {
      if (phase >= threshold) {
        slots[index].value = withDelay(
          index === 2 ? 120 : 0,
          withTiming(1, { duration: 420, easing: OVERSHOOT })
        );
      } else {
        cancelAnimation(slots[index]);
        slots[index].value = 0;
      }
    });
  }, [phase, slots]);

  return (
    <View style={styles.resultCard}>
      <RevealView entry={slots[0]} style={styles.resultHeader}>
        <IconTile icon="doc-text" tone="blue" colors={colors} styles={styles} />
        <View style={styles.resultHeaderText}>
          <Text style={styles.resultEyebrow}>{copy.cardEyebrow}</Text>
          <Text style={styles.resultTitle}>{copy.cardTitle}</Text>
        </View>
      </RevealView>
      <View style={styles.resultSections}>
        <ResultSection label={copy.cardLabelPayment} tone="blue" colors={colors} styles={styles} entry={slots[1]}>
          <Text style={styles.paymentDate}>{copy.cardPaymentDate}</Text>
          <RevealView entry={slots[2]} style={styles.reminderButton}>
            <Icon name="bell" size={13} color={colors.textOnAccent} />
            <Text style={styles.reminderButtonText}>{copy.cardReminderCta}</Text>
          </RevealView>
        </ResultSection>
        <ResultSection label={copy.cardLabelWhere} tone="blue" colors={colors} styles={styles} entry={slots[3]}>
          <Text style={styles.sectionMain}>{copy.cardWhereMain}</Text>
        </ResultSection>
        <ResultSection label={copy.cardLabelWhat} tone="amber" colors={colors} styles={styles} entry={slots[4]}>
          <Text style={styles.sectionMain}>{copy.cardWhatMain}</Text>
        </ResultSection>
        <ResultSection label={copy.cardLabelMiss} tone="red" colors={colors} styles={styles} entry={slots[5]}>
          <Text style={styles.sectionMain}>{copy.cardMissMain}</Text>
        </ResultSection>
        <ResultSection label={copy.cardLabelTip} tone="green" colors={colors} styles={styles} entry={slots[6]}>
          <Text style={styles.sectionMain}>{copy.cardTipMain}</Text>
        </ResultSection>
      </View>
    </View>
  );
}

function PaperDoc({ colors }: { colors: ColorPalette }) {
  return (
    <View style={stylesStatic.paperDoc}>
      <Text style={stylesStatic.paperMeta}>Správa bytového fondu Praha</Text>
      <Text style={stylesStatic.paperMetaMuted}>Odbor pohledávek a správy</Text>
      <Text style={stylesStatic.paperTitle}>Výzva k úhradě nedoplatku č. 2024/4471</Text>
      <View style={stylesStatic.paperLines}>
        {[100, 90, 95, 75, 100, 88, 40, 100, 90, 60].map((lineWidth, index) => (
          <View key={index} style={[stylesStatic.paperLine, { width: `${lineWidth}%` }]} />
        ))}
      </View>
      <View style={[stylesStatic.paperStamp, { borderColor: colors.amber200 }]}>
        <Text style={stylesStatic.paperStampText}>SPLATNOST: 30. 6. 2026 · 2 450 Kč</Text>
      </View>
    </View>
  );
}

function ResultSection({
  label,
  tone,
  colors,
  styles,
  entry,
  children,
}: {
  label: string;
  tone: Tone;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  entry: SharedValue<number>;
  children: React.ReactNode;
}) {
  const toneStyle = getToneStyle(tone, colors);
  return (
    <RevealView entry={entry} style={[styles.resultSection, { backgroundColor: toneStyle.bg, borderColor: toneStyle.border }]}>
      <Text style={[styles.resultSectionLabel, { color: toneStyle.color }]}>{label}</Text>
      {children}
    </RevealView>
  );
}

/* ───────────────────────── S4 · Reminders ───────────────────────── */

function RemindersSlide({ active, copy, colors, styles, onNext }: SlideProps & { onNext: () => void }) {
  const entries = useStagger(active, 3);

  return (
    <View style={styles.slide}>
      <View style={styles.slideHeader}>
        <StaggerText entry={entries[0]} style={styles.slideTitle}>{copy.remindersTitle}</StaggerText>
        <StaggerText entry={entries[1]} style={styles.slideBody}>{copy.remindersBody}</StaggerText>
      </View>
      <View style={styles.remindersMain}>
        <View style={styles.reminderStack}>
          <NotificationBanner active={active} index={0} tone="green" title={copy.banners[0].title} body={copy.banners[0].body} colors={colors} styles={styles} />
          <NotificationBanner active={active} index={1} tone="amber" title={copy.banners[1].title} body={copy.banners[1].body} colors={colors} styles={styles} />
          <NotificationBanner active={active} index={2} tone="amber" title={copy.banners[2].title} body={copy.banners[2].body} colors={colors} styles={styles} />
          <NotificationBanner active={active} index={3} tone="red" title={copy.banners[3].title} body={copy.banners[3].body} colors={colors} styles={styles} />
        </View>
      </View>
      <StaggerView entry={entries[2]} style={styles.remindersCta}>
        <PrimaryCTA label={copy.next} onPress={onNext} colors={colors} styles={styles} />
      </StaggerView>
    </View>
  );
}

function NotificationBanner({
  active,
  index,
  title,
  body,
  tone,
  colors,
  styles,
}: {
  active: boolean;
  index: number;
  title: string;
  body: string;
  tone: "green" | "amber" | "red";
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const toneStyle = getToneStyle(tone, colors);
  const enter = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(enter);
    cancelAnimation(ring);
    enter.value = 0;
    ring.value = 0;
    if (!active) return;
    const delay = 120 + index * 150;
    enter.value = withDelay(delay, withTiming(1, { duration: 520, easing: OVERSHOOT }));
    // Bell wiggle: waits for the banner to mostly land, then swings and settles.
    ring.value = withDelay(
      delay + 320,
      withSequence(
        ...[-15, 11, -8, 5, -3, 0].map((deg) =>
          withTiming(deg, { duration: 110, easing: Easing.inOut(Easing.ease) })
        )
      )
    );
  }, [active, index, enter, ring]);

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [-24, 0]) },
      { scale: interpolate(enter.value, [0, 1], [0.96, 1]) },
    ],
  }));
  const bellStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ring.value}deg` }],
  }));

  return (
    // The entrance opacity/transform live on this transparent wrapper, NOT on
    // the bordered card. On iOS 26 an animated transform/opacity keeps the view
    // in its own compositing layer even at rest, and a rounded+bordered card in
    // that layer renders a faint edge artifact on the right. Keeping the card a
    // plain static View (no animated props) avoids the layer entirely.
    <Reanimated.View style={wrapperStyle}>
      <View style={styles.notificationBanner}>
        <View style={styles.notificationInner}>
          <Reanimated.View style={[styles.notificationIcon, { backgroundColor: toneStyle.bg }, bellStyle]}>
            <Icon name="bell" size={18} color={toneStyle.color} />
          </Reanimated.View>
          <View style={styles.notificationTextBlock}>
            <Text style={styles.notificationTitle}>{title}</Text>
            <Text style={styles.notificationBody}>{body}</Text>
          </View>
        </View>
      </View>
    </Reanimated.View>
  );
}

/* ───────────────────────── S5 · Guides ───────────────────────── */

function GuidesSlide({ active, copy, lang, colors, styles, onNext }: SlideProps & { lang: LanguageCode; onNext: () => void }) {
  const entries = useStagger(active, 3);
  const topics = GUIDE_TOPICS[lang];

  return (
    <View style={styles.slide}>
      <View style={styles.slideHeader}>
        <StaggerText entry={entries[0]} style={styles.slideTitle}>{copy.guidesTitle}</StaggerText>
        <StaggerText entry={entries[1]} style={styles.slideBody}>{copy.guidesBody}</StaggerText>
      </View>
      <View style={styles.guideGroup}>
        {topics.map((topic, index) => (
          <GuideRow key={topic.title} topic={topic} index={index} active={active} colors={colors} styles={styles} />
        ))}
      </View>
      <StaggerView entry={entries[2]} style={styles.ctaSpacing}>
        <PrimaryCTA label={copy.next} onPress={onNext} colors={colors} styles={styles} />
      </StaggerView>
    </View>
  );
}

function GuideRow({
  topic,
  index,
  active,
  colors,
  styles,
}: {
  topic: { icon: IconName; title: string; sub: string; tone: GuideTone };
  index: number;
  active: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const enter = useSharedValue(0);
  const toneStyle = getToneStyle(topic.tone, colors);

  useEffect(() => {
    cancelAnimation(enter);
    enter.value = 0;
    if (!active) return;
    enter.value = withDelay(60 + index * 70, withTiming(1, { duration: 520, easing: SPRING }));
  }, [active, index, enter]);

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [14, 0]) }],
  }));

  return (
    // Entrance opacity/transform on a transparent wrapper, never on the
    // bordered card — see NotificationBanner: an animated card keeps an iOS 26
    // compositing layer that renders an edge artifact. The card stays a plain
    // static View.
    <Reanimated.View style={wrapperStyle}>
      <View style={styles.guideRow}>
        <View style={styles.guideRowInner}>
          <View style={[styles.guideIcon, { backgroundColor: toneStyle.bg }]}>
            <Icon name={topic.icon} size={20} color={toneStyle.color} />
          </View>
          <View style={styles.guideTextBlock}>
            <Text style={styles.guideTitle}>{topic.title}</Text>
            <Text style={styles.guideSub} numberOfLines={1}>
              {topic.sub}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.muted3} />
        </View>
      </View>
    </Reanimated.View>
  );
}

/* ───────────────────────── S6 · Auth ───────────────────────── */

function AuthLandingSlide({
  active,
  copy,
  colors,
  styles,
  onComplete,
  onOpenTerms,
  onOpenPrivacy,
}: SlideProps & {
  onRestart: () => void;
  onComplete: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}) {
  const entries = useStagger(active, 7);
  // This slide IS the sign-in screen (the standalone email/password AuthScreen
  // was removed): the buttons run the real Supabase OAuth flow. On success the
  // session lands via AuthProvider and RootNavigator switches to the app;
  // onComplete just persists the "onboarding seen" flag.
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  async function handleProvider(provider: SocialProvider) {
    if (socialLoading) return;
    setAuthError(null);
    setSocialLoading(provider);
    const result = await signInWithProvider(provider);
    setSocialLoading(null);
    if (result.ok) {
      onComplete();
      return;
    }
    if (result.error) setAuthError(result.error);
  }

  const legalParts = copy.authLegal.split(/\{terms\}|\{privacy\}/);

  return (
    <View style={styles.slide}>
      <View style={styles.authCenter}>
        <StaggerView entry={entries[0]}>
          <BrandWordmark height={46} />
        </StaggerView>
        <View style={styles.authHeading}>
          <StaggerText entry={entries[1]} style={styles.authTitle}>{copy.authTitle}</StaggerText>
          <StaggerText entry={entries[2]} style={styles.authBody}>{copy.authBody}</StaggerText>
        </View>
        <View style={styles.authButtons}>
          <StaggerView entry={entries[3]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.authApple}
              disabled={socialLoading !== null}
              onPress={() => void handleProvider("apple")}
              style={({ pressed }) => [styles.socialButton, pressed && styles.pressedScale]}
            >
              {socialLoading === "apple" ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <AppleMark size={22} color={colors.text} />
              )}
              <Text style={styles.socialButtonText}>{copy.authApple}</Text>
            </Pressable>
          </StaggerView>
          <StaggerView entry={entries[4]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.authGoogle}
              disabled={socialLoading !== null}
              onPress={() => void handleProvider("google")}
              style={({ pressed }) => [styles.socialButton, pressed && styles.pressedScale]}
            >
              {socialLoading === "google" ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <GoogleMark size={22} />
              )}
              <Text style={styles.socialButtonText}>{copy.authGoogle}</Text>
            </Pressable>
          </StaggerView>
        </View>
        {authError ? <Text style={styles.authError}>{authError}</Text> : null}
        <StaggerView entry={entries[5]} style={styles.authTrust}>
          <Icon name="lock-small" size={15} color={colors.green} />
          <Text style={styles.authTrustText}>{copy.authTrust}</Text>
        </StaggerView>
      </View>
      <View style={styles.authFooter}>
        <StaggerText entry={entries[6]} style={styles.legalText}>
          {legalParts[0]}
          <Text style={styles.legalLink} onPress={onOpenTerms}>
            {copy.authTermsLabel}
          </Text>
          {legalParts[1]}
          <Text style={styles.legalLink} onPress={onOpenPrivacy}>
            {copy.authPrivacyLabel}
          </Text>
          {legalParts[2]}
        </StaggerText>
      </View>
    </View>
  );
}

/* ───────────────────────── Shared bits ───────────────────────── */

type SlideProps = {
  active: boolean;
  copy: OnboardingCopy;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
};

function PrimaryCTA({
  label,
  onPress,
  colors,
  styles,
}: {
  label: string;
  onPress: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const sheen = useSharedValue(0);

  useEffect(() => {
    // Sweep, hold off-button, snap back, wait, repeat — mirrors the old
    // delay(1400) → sweep(1100) → reset → delay(2500) Animated.loop.
    sheen.value = 0;
    sheen.value = withRepeat(
      withSequence(
        withDelay(1400, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) })),
        withDelay(2500, withTiming(0, { duration: 0 }))
      ),
      -1
    );
    return () => cancelAnimation(sheen);
  }, [sheen]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sheen.value, [0, 1], [-160, 360]) },
      { skewX: "-18deg" },
    ],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryCta, pressed && styles.pressedScale]}
    >
      <Text style={styles.primaryCtaText}>{label}</Text>
      <Icon name="arrow-right" size={18} color={colors.textOnAccent} />
      <Reanimated.View pointerEvents="none" style={[styles.ctaSheen, sheenStyle]}>
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.22)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>
    </Pressable>
  );
}

function IconTile({
  icon,
  tone,
  colors,
  styles,
}: {
  icon: IconName;
  tone: Tone;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const toneStyle = getToneStyle(tone, colors);
  return (
    <View style={[styles.iconTile, { backgroundColor: toneStyle.bg }]}>
      <Icon name={icon} size={15} color={toneStyle.color} />
    </View>
  );
}

function GoogleMark({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44c11 0 19.4-8 19.4-20 0-1.3-.1-2.3-.4-3.5z" />
      <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 36.9 44 32 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </Svg>
  );
}

function AppleMark({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.7 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2-.05 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.75 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.05 0-2.5-1-2.6-3.8zM14.3 5.4c.7-.8 1.1-2 1-3.1-1 0-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.9 1 0 2.2-.6 2.8-1.3z" />
    </Svg>
  );
}

function FlagIcon({ code }: { code: LanguageCode }) {
  return (
    <View style={stylesStatic.flagWrap}>
      <Svg width={38} height={27} viewBox="0 0 30 20" preserveAspectRatio="none">
        {code === "cs" ? (
          <>
            <Rect width="30" height="20" fill="#FFFFFF" />
            <Rect y="10" width="30" height="10" fill="#D7141A" />
            <Path d="M0 0L15 10L0 20Z" fill="#11457E" />
          </>
        ) : code === "en" ? (
          <>
            <Rect width="30" height="20" fill="#012169" />
            <Path d="M0 0 30 20M30 0 0 20" stroke="#FFFFFF" strokeWidth="4" />
            <Path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="2" />
            <Path d="M15 0V20M0 10H30" stroke="#FFFFFF" strokeWidth="6" />
            <Path d="M15 0V20M0 10H30" stroke="#C8102E" strokeWidth="3.4" />
          </>
        ) : code === "uk" ? (
          <>
            <Rect width="30" height="10" fill="#0057B7" />
            <Rect y="10" width="30" height="10" fill="#FFD500" />
          </>
        ) : (
          <>
            <Rect width="30" height="6.67" fill="#FFFFFF" />
            <Rect y="6.67" width="30" height="6.66" fill="#0039A6" />
            <Rect y="13.33" width="30" height="6.67" fill="#D52B1E" />
          </>
        )}
      </Svg>
    </View>
  );
}

/* ───────────────────────── Animation helpers ───────────────────────── */

// makeMutable (the non-hook primitive behind useSharedValue) lets us keep an
// array of shared values without calling hooks in a loop; the count is fixed
// per call site so the array is stable for the component's lifetime.
function useStagger(active: boolean, count: number, baseDelay = 90, delayStep = 95) {
  const values = useRef(Array.from({ length: count }, () => makeMutable(0))).current;

  useEffect(() => {
    values.forEach((value, index) => {
      cancelAnimation(value);
      value.value = 0;
      if (active) {
        value.value = withDelay(baseDelay + index * delayStep, withTiming(1, { duration: 520, easing: SPRING }));
      }
    });
  }, [active, baseDelay, delayStep, values]);

  useEffect(() => {
    return () => values.forEach((value) => cancelAnimation(value));
  }, [values]);

  return values;
}

// Reanimated styles must come from the useAnimatedStyle hook, so the old
// staggerStyle(value) inline helper became these thin wrapper components.
function StaggerView({ entry, style, children, ...rest }: ViewProps & { entry: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: [
      { translateY: interpolate(entry.value, [0, 1], [16, 0]) },
      { scale: interpolate(entry.value, [0, 1], [0.985, 1]) },
    ],
  }));
  return (
    <Reanimated.View {...rest} style={[style, animatedStyle]}>
      {children}
    </Reanimated.View>
  );
}

function StaggerText({ entry, style, children, ...rest }: TextProps & { entry: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: [
      { translateY: interpolate(entry.value, [0, 1], [16, 0]) },
      { scale: interpolate(entry.value, [0, 1], [0.985, 1]) },
    ],
  }));
  return (
    <Reanimated.Text {...rest} style={[style, animatedStyle]}>
      {children}
    </Reanimated.Text>
  );
}

// Reveal used by the assembling result card: fade in + slight upward slide.
function RevealView({ entry, style, children, ...rest }: ViewProps & { entry: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: [{ translateY: interpolate(entry.value, [0, 1], [10, 0]) }],
  }));
  return (
    <Reanimated.View {...rest} style={[style, animatedStyle]}>
      {children}
    </Reanimated.View>
  );
}

function getToneStyle(tone: GuideTone, colors: ColorPalette) {
  if (tone === "amber") return { color: colors.amber, bg: colors.amberLight, border: colors.amber200 };
  if (tone === "red") return { color: colors.danger, bg: colors.dangerLight, border: colors.red200 };
  if (tone === "green") return { color: colors.green, bg: colors.greenLight, border: colors.green100 };
  if (tone === "purple") return { color: colors.pro, bg: colors.proLight, border: colors.borderSoft };
  return { color: colors.primary, bg: colors.blueSoft, border: colors.blueMid };
}

const stylesStatic = StyleSheet.create({
  vignette: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 18,
    opacity: 0.1,
  },
  scanLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  scanWash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    opacity: 0.5,
  },
  scanLine: {
    position: "absolute",
    left: -8,
    right: -8,
    top: -1.5,
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
  },
  paperDoc: {
    width: 188,
    borderRadius: 12,
    backgroundColor: "#F1ECDF",
    padding: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.45,
    shadowRadius: 50,
    elevation: 8,
  },
  paperMeta: {
    color: "#6B655A",
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  paperMetaMuted: {
    color: "#8C8676",
    fontFamily: fonts.body,
    fontSize: 7,
    marginTop: 2,
  },
  paperTitle: {
    color: "#1A1812",
    fontFamily: fonts.display,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
    marginTop: 14,
  },
  paperLines: {
    gap: 4,
    marginTop: 14,
  },
  paperLine: {
    height: 3,
    borderRadius: 1,
    backgroundColor: "#C9C2B0",
  },
  paperStamp: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  paperStampText: {
    color: "#3A372E",
    fontFamily: fonts.bodyBold,
    fontSize: 7,
  },
  flagWrap: {
    width: 38,
    height: 27,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});

function createStyles(colors: ColorPalette, topInset: number, bottomInset: number) {
  const slideBottomPadding = Math.max(28, bottomInset + 8);

  return StyleSheet.create({
    root: {
      flex: 1,
      overflow: "hidden",
    },
    chrome: {
      position: "absolute",
      zIndex: 20,
      left: 0,
      right: 0,
      minHeight: 48,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    chromeButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 20,
    },
    chromeButtonMuted: {
      opacity: 0,
    },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    progressDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      opacity: 0.6,
    },
    progressDotActive: {
      width: 22,
      opacity: 1,
    },
    skipButton: {
      minWidth: 72,
      minHeight: 40,
      alignItems: "flex-end",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    skipButtonHidden: {
      opacity: 0,
    },
    skipText: {
      color: colors.muted2,
      fontFamily: fonts.bodyBold,
      ...typeStyles.footnote,
      fontWeight: "700",
    },
    track: {
      flex: 1,
      flexDirection: "row",
    },
    slide: {
      flex: 1,
      paddingTop: topInset + 56,
      paddingHorizontal: 24,
      paddingBottom: slideBottomPadding,
    },
    legalOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 50,
      elevation: 50,
      backgroundColor: colors.bg,
    },
    legalSwipeEdge: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 72,
      zIndex: 60,
      elevation: 60,
    },
    legalLoading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    welcomeCenter: {
      flex: 1,
      justifyContent: "center",
      alignItems: "flex-start",
      paddingBottom: 20,
    },
    titleBlock: {
      marginTop: 20,
      gap: 1,
    },
    heroTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 31,
      lineHeight: 35,
      fontWeight: "600",
      letterSpacing: -0.3,
    },
    heroBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.subhead,
      lineHeight: 23,
      marginTop: 14,
      maxWidth: 330,
    },
    welcomeBullets: {
      marginTop: 18,
      gap: 10,
    },
    welcomeBulletRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    welcomeBulletDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      opacity: 0.7,
      flexShrink: 0,
    },
    welcomeBulletText: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
    },
    bottomCta: {
      paddingBottom: 2,
    },
    primaryCta: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.brandBlue,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      overflow: "hidden",
      shadowColor: colors.brandBlue,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 4,
    },
    primaryCtaText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.button,
      fontWeight: "700",
    },
    ctaSheen: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: "38%",
    },
    slideHeader: {
      paddingHorizontal: 4,
      gap: 8,
      // Space between the top header and the slide's content below it.
      marginBottom: 20,
    },
    slideTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 25,
      lineHeight: 29,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    languageTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 27,
      lineHeight: 32,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    slideBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.subhead,
      lineHeight: 22,
      marginTop: 10,
    },
    languageGroup: {
      flex: 1,
      justifyContent: "center",
      gap: 11,
    },
    languageRow: {
      minHeight: 68,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 15,
      paddingHorizontal: 16,
    },
    languageRowSelected: {
      borderColor: colors.brandBlue,
      backgroundColor: colors.blueSoft,
    },
    languageText: {
      flex: 1,
      color: colors.muted,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.body,
      fontWeight: "700",
    },
    languageTextSelected: {
      color: colors.text,
    },
    languageCheck: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    languageCheckSelected: {
      borderWidth: 0,
      backgroundColor: colors.brandBlue,
    },
    scanHeroWrap: {
      flex: 1,
      minHeight: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    scanStage: {
      flex: 1,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    resultCard: {
      width: 246,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      overflow: "hidden",
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.28,
      shadowRadius: 24,
      elevation: 4,
    },
    resultHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
    },
    iconTile: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    resultHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    resultEyebrow: {
      color: colors.muted3,
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      letterSpacing: 1.1,
      fontWeight: "800",
    },
    resultTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: "600",
      marginTop: 1,
    },
    resultSections: {
      paddingHorizontal: 8,
      paddingTop: 6,
      paddingBottom: 8,
      gap: 4,
    },
    resultSection: {
      borderRadius: 11,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 6,
      gap: 4,
    },
    resultSectionLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    paymentDate: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "600",
    },
    reminderButton: {
      marginTop: 4,
      minHeight: 28,
      borderRadius: 8,
      backgroundColor: colors.brandBlue,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    reminderButtonText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodySemiBold,
      fontSize: 11.5,
      fontWeight: "700",
    },
    sectionMain: {
      color: colors.text,
      fontFamily: fonts.bodyMedium,
      fontSize: 12.5,
      lineHeight: 17,
      fontWeight: "500",
    },
    sectionMuted: {
      color: colors.muted2,
      fontFamily: fonts.body,
      fontSize: 11.5,
      lineHeight: 16,
    },
    replayButton: {
      position: "absolute",
      bottom: 4,
      right: 8,
      minHeight: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
    },
    replayText: {
      color: colors.muted2,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      fontWeight: "700",
    },
    ctaSpacing: {
      marginTop: 18,
    },
    remindersMain: {
      // Cards sit directly under the header (no floaty centered gap); the
      // leftover space falls below them, above the CTA.
      flex: 1,
      justifyContent: "flex-start",
    },
    reminderStack: {
      gap: 10,
      paddingHorizontal: 0,
    },
    remindersCta: {
      marginTop: 28,
      paddingBottom: 2,
    },
    notificationBanner: {
      minHeight: 64,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    notificationInner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    notificationIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    notificationTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    notificationTitle: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 15,
    },
    notificationBody: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13.5,
      lineHeight: 18,
      fontWeight: "700",
      marginTop: 3,
    },
    guideGroup: {
      flex: 1,
      justifyContent: "flex-start",
      gap: 9,
    },
    guideRow: {
      minHeight: 62,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
    },
    guideRowInner: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
    },
    guideIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    guideTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    guideTitle: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      fontSize: 15,
      lineHeight: 19,
      fontWeight: "700",
    },
    guideSub: {
      color: colors.muted2,
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 2,
    },
    authCenter: {
      flex: 1,
      justifyContent: "center",
      paddingBottom: 20,
      gap: 24,
    },
    authHeading: {
      gap: 10,
    },
    authTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: "600",
      letterSpacing: -0.3,
    },
    authBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.subhead,
      lineHeight: 22,
    },
    authButtons: {
      gap: 11,
    },
    socialButton: {
      height: 56,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    socialButtonText: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      fontSize: 16,
      fontWeight: "600",
    },
    authTrust: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    authTrustText: {
      flex: 1,
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
    },
    authError: {
      color: colors.danger,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    authFooter: {
      alignItems: "center",
      gap: 14,
    },
    legalText: {
      color: colors.muted2,
      fontFamily: fonts.body,
      fontSize: 11.5,
      lineHeight: 18,
      textAlign: "center",
    },
    legalLink: {
      color: colors.primary,
      textDecorationLine: "underline" as const,
    },
    pressed: {
      opacity: 0.7,
    },
    pressedScale: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }],
    },
  });
}
