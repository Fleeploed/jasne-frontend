import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { BrandWordmark } from "@/components/BrandMark";
import { Icon, type IconName } from "@/components/Icon";
import { fonts, lightColors, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { useLocale } from "@/lib/LocaleContext";
import { normalizeLocale } from "@/lib/i18n";

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
  authEmail: string;
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
    authEmail: "Продолжить с email",
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
    authEmail: "Pokračovat s emailem",
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
    authEmail: "Continue with email",
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
    authEmail: "Продовжити з email",
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

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { locale, changeLocale } = useLocale();
  const [step, setStep] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(() => normalizeLocale(locale) as LanguageCode);
  const userPickedLanguage = useRef(false);
  const offset = useRef(new Animated.Value(0)).current;
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const copy = ONBOARDING_COPY[selectedLanguage];
  const isLight = colors.bg === lightColors.bg;
  const statusStyle = isLight ? "dark" : "light";

  useEffect(() => {
    Animated.timing(offset, {
      toValue: -step * width,
      duration: 600,
      easing: SPRING,
      useNativeDriver: true,
    }).start();
  }, [offset, step, width]);

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

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} {...swipe.panHandlers}>
      <StatusBar style={statusStyle} backgroundColor={colors.bg} />
      <BgGlow step={step} isLight={isLight} />
      <View pointerEvents="none" style={[stylesStatic.vignette, { borderColor: colors.bgDeep }]} />
      <View pointerEvents="none" style={[stylesStatic.grain, { backgroundColor: colors.surface3 }]} />

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

      <Animated.View
        style={[
          styles.track,
          {
            width: width * SLIDE_COUNT,
            transform: [{ translateX: offset }],
          },
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
          />
        </SlidePage>
      </Animated.View>
    </View>
  );
}

function SlidePage({ children, width }: { children: React.ReactNode; width: number }) {
  return <View style={{ width, flex: 1 }}>{children}</View>;
}

/* ───────────────────────── Background glow ─────────────────────────
   Faithful port of v2's <BgGlow>: breathing radial glows whose color and
   opacity shift per step. RN has no CSS radial-gradient, so each glow is an
   <Svg> radial gradient inside an absolutely-positioned Animated.View. Step
   transitions and breathing run on the JS driver (low-frequency ambient). */

function BgGlow({ step, isLight }: { step: number; isLight: boolean }) {
  const stepAnim = useRef(new Animated.Value(step)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const factor = isLight ? 0.4 : 1;

  useEffect(() => {
    Animated.timing(stepAnim, {
      toValue: step,
      duration: 700,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [stepAnim, step]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 4500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(breathe, { toValue: 0, duration: 4500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  // Step indices: 0=welcome 1=language 2=scan 3=reminders 4=guides 5=auth
  const blueOpacity = stepAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4, 5],
    outputRange: [factor, factor, factor, factor * 0.3, factor, factor],
  });
  const blueShiftY = stepAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4, 5],
    outputRange: [0, -26, 0, 0, 0, 130],
  });
  const warmOpacity = stepAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4, 5],
    outputRange: [factor, factor * 0.35, factor * 0.35, 0, factor * 0.35, factor],
  });
  const reminderOpacity = stepAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4, 5],
    outputRange: [0, 0, 0, factor, 0, 0],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GlowLayer size={620} left="50%" top="34%" color="#6FA0E6" alpha={0.28} opacity={blueOpacity} extraTranslateY={blueShiftY} scale={scale} />
      <GlowLayer size={500} left="58%" top="72%" color="#C89650" alpha={0.14} opacity={warmOpacity} scale={scale} />
      {/* Reminder-slide glows. Kept clear of the card band (cards sit ~36–78%
          of the height): the amber sits high behind the header, the warm/red
          sits low-centre below the stack — so neither hotspots into the cards'
          side margins (which previously read as a lighter patch on the right). */}
      <GlowLayer size={480} left="40%" top="14%" color="#E0B45A" alpha={0.2} opacity={reminderOpacity} scale={scale} />
      <GlowLayer size={520} left="50%" top="93%" color="#E07F73" alpha={0.18} opacity={reminderOpacity} scale={scale} />
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
  opacity,
  scale,
  extraTranslateY,
}: {
  size: number;
  left: string;
  top: string;
  color: string;
  alpha: number;
  opacity: Animated.AnimatedInterpolation<number>;
  scale: Animated.AnimatedInterpolation<number>;
  extraTranslateY?: Animated.AnimatedInterpolation<number>;
}) {
  const gradientId = useRef(`onbGlow${glowIdCounter++}`).current;
  const transform: Animated.WithAnimatedArray<{ translateY?: Animated.AnimatedInterpolation<number>; scale?: Animated.AnimatedInterpolation<number> }> =
    extraTranslateY ? [{ translateY: extraTranslateY }, { scale }] : [{ scale }];

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: left as unknown as number,
        top: top as unknown as number,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        opacity,
        transform: transform as never,
      }}
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
    </Animated.View>
  );
}

/* ───────────────────────── S1 · Welcome ───────────────────────── */

function WelcomeSlide({ active, copy, colors, styles, onNext }: SlideProps & { onNext: () => void }) {
  const entries = useStagger(active, 6);

  return (
    <View style={styles.slide}>
      <View style={styles.welcomeCenter}>
        <Animated.View style={staggerStyle(entries[0])}>
          <BrandWordmark height={48} />
        </Animated.View>
        <View style={styles.titleBlock}>
          <Animated.Text style={[styles.heroTitle, staggerStyle(entries[1])]}>{copy.welcomeTitleA}</Animated.Text>
          <Animated.Text style={[styles.heroTitle, staggerStyle(entries[2])]}>{copy.welcomeTitleB}</Animated.Text>
        </View>
        <Animated.Text style={[styles.heroBody, staggerStyle(entries[3])]}>{copy.welcomeBody}</Animated.Text>
        <Animated.View style={[styles.welcomeBullets, staggerStyle(entries[4])]}>
          {copy.welcomeBullets.map((bullet, i) => (
            <View key={i} style={styles.welcomeBulletRow}>
              <View style={[styles.welcomeBulletDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.welcomeBulletText}>{bullet}</Text>
            </View>
          ))}
        </Animated.View>
      </View>
      <Animated.View style={[styles.bottomCta, staggerStyle(entries[5])]}>
        <PrimaryCTA label={copy.start} onPress={onNext} colors={colors} styles={styles} />
      </Animated.View>
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
        <Animated.Text style={[styles.languageTitle, staggerStyle(entries[0])]}>{copy.languageTitle}</Animated.Text>
        <Animated.Text style={[styles.slideBody, staggerStyle(entries[1])]}>{copy.languageBody}</Animated.Text>
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
      <Animated.View style={[styles.bottomCta, staggerStyle(entries[6])]}>
        <PrimaryCTA label={copy.continue} onPress={onNext} colors={colors} styles={styles} />
      </Animated.View>
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
  entry: Animated.Value;
  onPress: () => void;
}) {
  // Selected rows lift slightly (scale 1.02) and the check mark pops in.
  const lift = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const check = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(lift, {
      toValue: selected ? 1 : 0,
      duration: 280,
      easing: SPRING,
      useNativeDriver: true,
    }).start();
    Animated.timing(check, {
      toValue: selected ? 1 : 0,
      duration: 350,
      easing: OVERSHOOT,
      useNativeDriver: true,
    }).start();
  }, [selected, lift, check]);

  const rowScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
  const checkScale = check.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });

  return (
    <Animated.View style={[staggerStyle(entry), { transform: [...staggerTransform(entry), { scale: rowScale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.languageRow, selected && styles.languageRowSelected, pressed && styles.pressedScale]}
      >
        <FlagIcon code={option.code} />
        <Text style={[styles.languageText, selected && styles.languageTextSelected]}>{option.label}</Text>
        <Animated.View
          style={[styles.languageCheck, selected && styles.languageCheckSelected, { opacity: check, transform: [{ scale: checkScale }] }]}
        >
          {selected ? <Icon name="check" size={14} color={colors.textOnAccent} /> : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/* ───────────────────────── S3 · Scan reveal ───────────────────────── */

function ScanSlide({ active, copy, colors, styles, onNext }: SlideProps & { onNext: () => void }) {
  const entries = useStagger(active, 4);

  return (
    <View style={styles.slide}>
      <View style={styles.slideHeader}>
        <Animated.Text style={[styles.slideTitle, staggerStyle(entries[0])]}>{copy.scanTitle}</Animated.Text>
        <Animated.Text style={[styles.slideBody, staggerStyle(entries[1])]}>{copy.scanBody}</Animated.Text>
      </View>
      <Animated.View style={[styles.scanHeroWrap, staggerStyle(entries[2])]}>
        <ScanReveal active={active} copy={copy} colors={colors} styles={styles} />
      </Animated.View>
      <Animated.View style={[styles.ctaSpacing, staggerStyle(entries[3])]}>
        <PrimaryCTA label={copy.next} onPress={onNext} colors={colors} styles={styles} />
      </Animated.View>
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
  const scanned = useRef(new Animated.Value(0)).current;
  const morph = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const run = () => {
    clearTimers();
    scanned.setValue(0);
    morph.setValue(0);
    setPhase(1);
    Animated.timing(scanned, {
      toValue: 1,
      delay: SCAN_SWEEP_DELAY,
      duration: SCAN_SWEEP_DURATION,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
    SCAN_PHASES.forEach(({ at, phase: p }) => {
      timers.current.push(
        setTimeout(() => {
          setPhase(p);
          if (p === 2) {
            Animated.timing(morph, { toValue: 1, duration: 500, easing: SPRING, useNativeDriver: true }).start();
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
      scanned.setValue(0);
      morph.setValue(0);
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
  const paperOpacity = morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const paperScale = morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });
  const paperShift = morph.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const cardOpacity = morph;
  const cardScale = morph.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const lineTranslate = scanned.interpolate({ inputRange: [0, 1], outputRange: [0, paperHeight] });
  const washHeight = scanned.interpolate({ inputRange: [0, 1], outputRange: [0, paperHeight] });

  return (
    <View style={styles.scanStage}>
      <Animated.View
        style={[
          stylesStatic.scanLayer,
          { opacity: paperOpacity, transform: [{ translateY: paperShift }, { scale: paperScale }] },
        ]}
      >
        <View onLayout={onPaperLayout}>
          <PaperDoc colors={colors} />
          {phase === 1 ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[stylesStatic.scanWash, { height: washHeight, backgroundColor: colors.blueSoft }]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  stylesStatic.scanLine,
                  { backgroundColor: colors.primary, shadowColor: colors.primary, transform: [{ translateY: lineTranslate }] },
                ]}
              />
            </>
          ) : null}
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[stylesStatic.scanLayer, { opacity: cardOpacity, transform: [{ translateY: -20 }, { scale: cardScale }] }]}
      >
        <AssemblingCard phase={phase} copy={copy} colors={colors} styles={styles} />
      </Animated.View>

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
  const slots = useRef(SECTION_SLOTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    SECTION_SLOTS.forEach((threshold, index) => {
      if (phase >= threshold) {
        Animated.timing(slots[index], {
          toValue: 1,
          duration: 420,
          delay: index === 2 ? 120 : 0,
          easing: OVERSHOOT,
          useNativeDriver: true,
        }).start();
      } else {
        slots[index].setValue(0);
      }
    });
  }, [phase, slots]);

  const reveal = (value: Animated.Value) => ({
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  });

  return (
    <View style={styles.resultCard}>
      <Animated.View style={[styles.resultHeader, reveal(slots[0])]}>
        <IconTile icon="doc-text" tone="blue" colors={colors} styles={styles} />
        <View style={styles.resultHeaderText}>
          <Text style={styles.resultEyebrow}>{copy.cardEyebrow}</Text>
          <Text style={styles.resultTitle}>{copy.cardTitle}</Text>
        </View>
      </Animated.View>
      <View style={styles.resultSections}>
        <ResultSection label={copy.cardLabelPayment} tone="blue" colors={colors} styles={styles} animatedStyle={reveal(slots[1])}>
          <Text style={styles.paymentDate}>{copy.cardPaymentDate}</Text>
          <Animated.View style={[styles.reminderButton, reveal(slots[2])]}>
            <Icon name="bell" size={13} color={colors.textOnAccent} />
            <Text style={styles.reminderButtonText}>{copy.cardReminderCta}</Text>
          </Animated.View>
        </ResultSection>
        <ResultSection label={copy.cardLabelWhere} tone="blue" colors={colors} styles={styles} animatedStyle={reveal(slots[3])}>
          <Text style={styles.sectionMain}>{copy.cardWhereMain}</Text>
        </ResultSection>
        <ResultSection label={copy.cardLabelWhat} tone="amber" colors={colors} styles={styles} animatedStyle={reveal(slots[4])}>
          <Text style={styles.sectionMain}>{copy.cardWhatMain}</Text>
        </ResultSection>
        <ResultSection label={copy.cardLabelMiss} tone="red" colors={colors} styles={styles} animatedStyle={reveal(slots[5])}>
          <Text style={styles.sectionMain}>{copy.cardMissMain}</Text>
        </ResultSection>
        <ResultSection label={copy.cardLabelTip} tone="green" colors={colors} styles={styles} animatedStyle={reveal(slots[6])}>
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
  animatedStyle,
  children,
}: {
  label: string;
  tone: Tone;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  animatedStyle: { opacity: Animated.Value; transform: { translateY: Animated.AnimatedInterpolation<number> }[] };
  children: React.ReactNode;
}) {
  const toneStyle = getToneStyle(tone, colors);
  return (
    <Animated.View style={[styles.resultSection, { backgroundColor: toneStyle.bg, borderColor: toneStyle.border }, animatedStyle]}>
      <Text style={[styles.resultSectionLabel, { color: toneStyle.color }]}>{label}</Text>
      {children}
    </Animated.View>
  );
}

/* ───────────────────────── S4 · Reminders ───────────────────────── */

function RemindersSlide({ active, copy, colors, styles, onNext }: SlideProps & { onNext: () => void }) {
  const entries = useStagger(active, 3);

  return (
    <View style={styles.slide}>
      <View style={styles.slideHeader}>
        <Animated.Text style={[styles.slideTitle, staggerStyle(entries[0])]}>{copy.remindersTitle}</Animated.Text>
        <Animated.Text style={[styles.slideBody, staggerStyle(entries[1])]}>{copy.remindersBody}</Animated.Text>
      </View>
      <View style={styles.remindersMain}>
        <View style={styles.reminderStack}>
          <NotificationBanner active={active} index={0} tone="green" title={copy.banners[0].title} body={copy.banners[0].body} colors={colors} styles={styles} />
          <NotificationBanner active={active} index={1} tone="amber" title={copy.banners[1].title} body={copy.banners[1].body} colors={colors} styles={styles} />
          <NotificationBanner active={active} index={2} tone="amber" title={copy.banners[2].title} body={copy.banners[2].body} colors={colors} styles={styles} />
          <NotificationBanner active={active} index={3} tone="red" title={copy.banners[3].title} body={copy.banners[3].body} colors={colors} styles={styles} />
        </View>
      </View>
      <Animated.View style={[styles.remindersCta, staggerStyle(entries[2])]}>
        <PrimaryCTA label={copy.next} onPress={onNext} colors={colors} styles={styles} />
      </Animated.View>
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
  const enter = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    enter.setValue(0);
    ring.setValue(0);
    if (!active) return;
    const delay = 120 + index * 150;
    const entrance = Animated.timing(enter, { toValue: 1, delay, duration: 520, easing: OVERSHOOT, useNativeDriver: true });
    const bell = Animated.sequence(
      [0, -15, 11, -8, 5, -3, 0].map((deg, i) =>
        Animated.timing(ring, {
          toValue: deg,
          duration: i === 0 ? 0 : 110,
          delay: i === 0 ? delay + 320 : 0,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      )
    );
    Animated.parallel([entrance, bell]).start();
  }, [active, index, enter, ring]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const rotate = ring.interpolate({ inputRange: [-20, 20], outputRange: ["-20deg", "20deg"] });

  return (
    <Animated.View style={[styles.notificationBanner, { transform: [{ translateY }, { scale }] }]}>
      {/* Opacity lives on this inner row, never on the card View — applying it
          to the card would make its surface bg translucent and let the warm
          background glow bleed through (visible as a lighter patch on one
          side). */}
      <Animated.View style={[styles.notificationInner, { opacity: enter }]}>
        <Animated.View style={[styles.notificationIcon, { backgroundColor: toneStyle.bg, transform: [{ rotate }] }]}>
          <Icon name="bell" size={18} color={toneStyle.color} />
        </Animated.View>
        <View style={styles.notificationTextBlock}>
          <Text style={styles.notificationTitle}>{title}</Text>
          <Text style={styles.notificationBody}>{body}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/* ───────────────────────── S5 · Guides ───────────────────────── */

function GuidesSlide({ active, copy, lang, colors, styles, onNext }: SlideProps & { lang: LanguageCode; onNext: () => void }) {
  const entries = useStagger(active, 3);
  const topics = GUIDE_TOPICS[lang];

  return (
    <View style={styles.slide}>
      <View style={styles.slideHeader}>
        <Animated.Text style={[styles.slideTitle, staggerStyle(entries[0])]}>{copy.guidesTitle}</Animated.Text>
        <Animated.Text style={[styles.slideBody, staggerStyle(entries[1])]}>{copy.guidesBody}</Animated.Text>
      </View>
      <View style={styles.guideGroup}>
        {topics.map((topic, index) => (
          <GuideRow key={topic.title} topic={topic} index={index} active={active} colors={colors} styles={styles} />
        ))}
      </View>
      <Animated.View style={[styles.ctaSpacing, staggerStyle(entries[2])]}>
        <PrimaryCTA label={copy.next} onPress={onNext} colors={colors} styles={styles} />
      </Animated.View>
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
  const enter = useRef(new Animated.Value(0)).current;
  const toneStyle = getToneStyle(topic.tone, colors);

  useEffect(() => {
    enter.setValue(0);
    if (!active) return;
    Animated.timing(enter, {
      toValue: 1,
      delay: 60 + index * 70,
      duration: 520,
      easing: SPRING,
      useNativeDriver: true,
    }).start();
  }, [active, index, enter]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View style={[styles.guideRow, { transform: [{ translateY }] }]}>
      {/* Opacity on the inner row, never on the card View — keeps the card's
          surface bg opaque so the background glow can't bleed through. */}
      <Animated.View style={[styles.guideRowInner, { opacity: enter }]}>
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
      </Animated.View>
    </Animated.View>
  );
}

/* ───────────────────────── S6 · Auth ───────────────────────── */

function AuthLandingSlide({
  active,
  copy,
  colors,
  styles,
  onComplete,
}: SlideProps & {
  onRestart: () => void;
  onComplete: () => void;
}) {
  const entries = useStagger(active, 8);

  const legalParts = copy.authLegal.split(/\{terms\}|\{privacy\}/);

  return (
    <View style={styles.slide}>
      <View style={styles.authCenter}>
        <Animated.View style={staggerStyle(entries[0])}>
          <BrandWordmark height={46} />
        </Animated.View>
        <View style={styles.authHeading}>
          <Animated.Text style={[styles.authTitle, staggerStyle(entries[1])]}>{copy.authTitle}</Animated.Text>
          <Animated.Text style={[styles.authBody, staggerStyle(entries[2])]}>{copy.authBody}</Animated.Text>
        </View>
        <View style={styles.authButtons}>
          <Animated.View style={staggerStyle(entries[3])}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.authApple}
              onPress={onComplete}
              style={({ pressed }) => [styles.socialButton, pressed && styles.pressedScale]}
            >
              <AppleMark size={22} color={colors.text} />
              <Text style={styles.socialButtonText}>{copy.authApple}</Text>
            </Pressable>
          </Animated.View>
          <Animated.View style={staggerStyle(entries[4])}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.authGoogle}
              onPress={onComplete}
              style={({ pressed }) => [styles.socialButton, pressed && styles.pressedScale]}
            >
              <GoogleMark size={22} />
              <Text style={styles.socialButtonText}>{copy.authGoogle}</Text>
            </Pressable>
          </Animated.View>
          <Animated.View style={staggerStyle(entries[5])}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.authEmail}
              onPress={onComplete}
              style={({ pressed }) => [styles.emailButton, pressed && styles.pressed]}
            >
              <Text style={styles.emailButtonText}>{copy.authEmail}</Text>
            </Pressable>
          </Animated.View>
        </View>
        <Animated.View style={[styles.authTrust, staggerStyle(entries[6])]}>
          <Icon name="lock-small" size={15} color={colors.green} />
          <Text style={styles.authTrustText}>{copy.authTrust}</Text>
        </Animated.View>
      </View>
      <View style={styles.authFooter}>
        <Animated.Text style={[styles.legalText, staggerStyle(entries[7])]}>
          {legalParts[0]}
          <Text style={styles.legalLink} onPress={() => Linking.openURL("https://jasne.app/terms")}>
            {copy.authTermsLabel}
          </Text>
          {legalParts[1]}
          <Text style={styles.legalLink} onPress={() => Linking.openURL("https://jasne.app/privacy")}>
            {copy.authPrivacyLabel}
          </Text>
          {legalParts[2]}
        </Animated.Text>
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
  const sheen = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(sheen, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sheen, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(2500),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sheen]);

  const sheenTranslate = sheen.interpolate({ inputRange: [0, 1], outputRange: [-160, 360] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryCta, pressed && styles.pressedScale]}
    >
      <Text style={styles.primaryCtaText}>{label}</Text>
      <Icon name="arrow-right" size={18} color={colors.textOnAccent} />
      <Animated.View pointerEvents="none" style={[styles.ctaSheen, { transform: [{ translateX: sheenTranslate }, { skewX: "-18deg" }] }]}>
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.22)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
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

function useStagger(active: boolean, count: number, baseDelay = 90, delayStep = 95) {
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;

  useEffect(() => {
    values.forEach((value) => value.setValue(0));
    if (!active) return;

    const animations = values.map((value, index) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 520,
        delay: baseDelay + index * delayStep,
        easing: SPRING,
        useNativeDriver: true,
      })
    );
    Animated.parallel(animations).start();
  }, [active, baseDelay, delayStep, values]);

  return values;
}

function staggerTransform(value: Animated.Value) {
  return [
    { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
    { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
  ];
}

function staggerStyle(value: Animated.Value) {
  return {
    opacity: value,
    transform: staggerTransform(value),
  };
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
  grain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.025,
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

function createStyles(colors: ColorPalette, topInset: number) {
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
      paddingBottom: 28,
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
      backgroundColor: colors.primaryDark,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      overflow: "hidden",
      shadowColor: colors.primaryDark,
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
      borderColor: colors.primary,
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
      backgroundColor: colors.primaryDark,
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
      backgroundColor: colors.primaryDark,
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
    emailButton: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    emailButtonText: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
      textDecorationLine: "underline" as const,
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
