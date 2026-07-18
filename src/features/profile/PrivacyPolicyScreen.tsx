import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { Screen, fonts, type ColorPalette, typeStyles, useColors } from "@/components/ui";
import { normalizeLocale, t } from "@/lib/i18n";

type PolicyLocale = ReturnType<typeof normalizeLocale>;

type PolicySection = {
  number: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type PolicyDocument = {
  title: string;
  meta: {
    effective: string;
    version: string;
  };
  footer: string;
  sections: PolicySection[];
};

const PRIVACY_POLICY: Record<PolicyLocale, PolicyDocument> = {
  ru: {
    title: "Политика конфиденциальности",
    meta: { effective: "Действует с 28 июня 2026", version: "Версия 1.0" },
    footer: "По вопросам о персональных данных и конфиденциальности: info@jasne.app.",
    sections: [
      {
        number: "01",
        title: "Кто мы",
        paragraphs: [
          "Jasně — мобильное приложение, которое помогает пользователям в Чехии понимать официальные документы, находить важные сроки и получать напоминания.",
          "По вопросам обработки персональных данных вы можете написать на info@jasne.app.",
        ],
      },
      {
        number: "02",
        title: "Какие данные обрабатываются",
        paragraphs: [
          "Мы обрабатываем данные, которые нужны для работы приложения и вашего аккаунта.",
        ],
        bullets: [
          "данные аккаунта: email, выбранный язык, настройки и статус подписки;",
          "документы: фотографии, PDF, распознанный текст, тип документа, результат анализа и найденные сроки;",
          "чат по документу: ваши вопросы и ответы Jasně;",
          "технические данные: события приложения, ошибки, лимиты использования и данные, нужные для безопасности.",
        ],
      },
      {
        number: "03",
        title: "Зачем это нужно",
        paragraphs: [
          "Данные используются, чтобы создать и обслуживать аккаунт, распознавать документы, объяснять их простым языком, сохранять историю, показывать сроки, отправлять напоминания и управлять лимитами Free/Pro.",
        ],
      },
      {
        number: "04",
        title: "AI-обработка",
        paragraphs: [
          "Чтобы распознать и объяснить документ, Jasně может отправлять изображение, PDF или распознанный текст поставщикам AI и инфраструктуры, которые помогают выполнять OCR, анализ и ответы в чате.",
          "Документы не используются для рекламы, не продаются и не показываются другим пользователям.",
        ],
      },
      {
        number: "05",
        title: "Хранение и удаление",
        paragraphs: [
          "Документы, результаты анализа, чаты и сроки хранятся в вашем аккаунте, пока вы используете приложение или пока они нужны для безопасности, поддержки и выполнения обязательств сервиса.",
          "Вы можете удалить отдельные документы, все документы или аккаунт в разделе профиля. После удаления данные удаляются без возможности восстановления, кроме случаев, когда их временное хранение требуется законом или технической безопасностью.",
        ],
      },
      {
        number: "06",
        title: "Ваши права",
        paragraphs: [
          "Вы можете запросить доступ к своим данным, исправление, удаление, ограничение обработки, переносимость данных или возразить против обработки. Вы также можете подать жалобу в надзорный орган по защите персональных данных.",
        ],
      },
      {
        number: "07",
        title: "Безопасность",
        paragraphs: [
          "Доступ к документам ограничен вашим аккаунтом. Мы используем защищённое хранилище, авторизацию и технические меры, чтобы снизить риск несанкционированного доступа.",
        ],
      },
      {
        number: "08",
        title: "Изменения политики",
        paragraphs: [
          "Мы можем обновлять эту политику при изменении функций приложения, поставщиков или требований закона. Актуальная версия будет доступна в приложении.",
        ],
      },
    ],
  },
  cs: {
    title: "Zásady ochrany osobních údajů",
    meta: { effective: "Účinné od 28. června 2026", version: "Verze 1.0" },
    footer: "Dotazy k osobním údajům a soukromí: info@jasne.app.",
    sections: [
      {
        number: "01",
        title: "Kdo jsme",
        paragraphs: [
          "Jasně je mobilní aplikace, která pomáhá uživatelům v Česku porozumět úředním dokumentům, najít důležité lhůty a nastavit připomenutí.",
          "V otázkách zpracování osobních údajů nás můžete kontaktovat na info@jasne.app.",
        ],
      },
      {
        number: "02",
        title: "Jaké údaje zpracováváme",
        paragraphs: ["Zpracováváme údaje potřebné pro fungování aplikace a vašeho účtu."],
        bullets: [
          "údaje účtu: email, zvolený jazyk, nastavení a stav předplatného;",
          "dokumenty: fotografie, PDF, rozpoznaný text, typ dokumentu, výsledek analýzy a nalezené lhůty;",
          "chat k dokumentu: vaše otázky a odpovědi Jasně;",
          "technické údaje: události v aplikaci, chyby, limity používání a údaje potřebné pro bezpečnost.",
        ],
      },
      {
        number: "03",
        title: "Proč údaje používáme",
        paragraphs: [
          "Údaje používáme k vytvoření a provozu účtu, rozpoznání dokumentů, jejich vysvětlení jednoduchým jazykem, uložení historie, zobrazení lhůt, zasílání připomenutí a správě limitů Free/Pro.",
        ],
      },
      {
        number: "04",
        title: "Zpracování pomocí AI",
        paragraphs: [
          "Aby Jasně dokument rozpoznalo a vysvětlilo, může odesílat obrázek, PDF nebo rozpoznaný text poskytovatelům AI a infrastruktury, kteří pomáhají s OCR, analýzou a odpověďmi v chatu.",
          "Dokumenty nepoužíváme pro reklamu, neprodáváme je a nezpřístupňujeme jiným uživatelům.",
        ],
      },
      {
        number: "05",
        title: "Uložení a smazání",
        paragraphs: [
          "Dokumenty, výsledky analýzy, chaty a lhůty jsou uložené ve vašem účtu po dobu používání aplikace nebo po dobu potřebnou pro bezpečnost, podporu a plnění povinností služby.",
          "Jednotlivé dokumenty, všechny dokumenty nebo účet můžete smazat v profilu. Po smazání jsou data odstraněna nevratně, kromě případů, kdy dočasné uchování vyžaduje zákon nebo technická bezpečnost.",
        ],
      },
      {
        number: "06",
        title: "Vaše práva",
        paragraphs: [
          "Můžete požádat o přístup ke svým údajům, opravu, výmaz, omezení zpracování, přenositelnost údajů nebo vznést námitku proti zpracování. Můžete také podat stížnost u dozorového úřadu pro ochranu osobních údajů.",
        ],
      },
      {
        number: "07",
        title: "Bezpečnost",
        paragraphs: [
          "Přístup k dokumentům je omezen na váš účet. Používáme chráněné úložiště, autorizaci a technická opatření ke snížení rizika neoprávněného přístupu.",
        ],
      },
      {
        number: "08",
        title: "Změny zásad",
        paragraphs: [
          "Tyto zásady můžeme aktualizovat při změně funkcí aplikace, poskytovatelů nebo právních požadavků. Aktuální verze bude dostupná v aplikaci.",
        ],
      },
    ],
  },
  uk: {
    title: "Політика конфіденційності",
    meta: { effective: "Діє з 28 червня 2026", version: "Версія 1.0" },
    footer: "Питання щодо персональних даних і конфіденційності: info@jasne.app.",
    sections: [
      {
        number: "01",
        title: "Хто ми",
        paragraphs: [
          "Jasně — мобільний застосунок, який допомагає користувачам у Чехії розуміти офіційні документи, знаходити важливі терміни та отримувати нагадування.",
          "З питань обробки персональних даних ви можете написати на info@jasne.app.",
        ],
      },
      {
        number: "02",
        title: "Які дані обробляються",
        paragraphs: ["Ми обробляємо дані, потрібні для роботи застосунку та вашого акаунта."],
        bullets: [
          "дані акаунта: email, обрана мова, налаштування та статус підписки;",
          "документи: фотографії, PDF, розпізнаний текст, тип документа, результат аналізу та знайдені терміни;",
          "чат щодо документа: ваші питання та відповіді Jasně;",
          "технічні дані: події застосунку, помилки, ліміти використання та дані, потрібні для безпеки.",
        ],
      },
      {
        number: "03",
        title: "Навіщо це потрібно",
        paragraphs: [
          "Дані використовуються, щоб створити й обслуговувати акаунт, розпізнавати документи, пояснювати їх простою мовою, зберігати історію, показувати терміни, надсилати нагадування та керувати лімітами Free/Pro.",
        ],
      },
      {
        number: "04",
        title: "AI-обробка",
        paragraphs: [
          "Щоб розпізнати й пояснити документ, Jasně може надсилати зображення, PDF або розпізнаний текст постачальникам AI та інфраструктури, які допомагають виконувати OCR, аналіз і відповіді в чаті.",
          "Документи не використовуються для реклами, не продаються і не показуються іншим користувачам.",
        ],
      },
      {
        number: "05",
        title: "Зберігання та видалення",
        paragraphs: [
          "Документи, результати аналізу, чати та терміни зберігаються у вашому акаунті, поки ви користуєтесь застосунком або поки вони потрібні для безпеки, підтримки та виконання зобов'язань сервісу.",
          "Ви можете видалити окремі документи, всі документи або акаунт у профілі. Після видалення дані видаляються безповоротно, крім випадків, коли тимчасове зберігання потрібне законом або технічною безпекою.",
        ],
      },
      {
        number: "06",
        title: "Ваші права",
        paragraphs: [
          "Ви можете запросити доступ до своїх даних, виправлення, видалення, обмеження обробки, перенесення даних або заперечити проти обробки. Ви також можете подати скаргу до наглядового органу із захисту персональних даних.",
        ],
      },
      {
        number: "07",
        title: "Безпека",
        paragraphs: [
          "Доступ до документів обмежений вашим акаунтом. Ми використовуємо захищене сховище, авторизацію та технічні заходи, щоб знизити ризик несанкціонованого доступу.",
        ],
      },
      {
        number: "08",
        title: "Зміни політики",
        paragraphs: [
          "Ми можемо оновлювати цю політику при зміні функцій застосунку, постачальників або вимог закону. Актуальна версія буде доступна в застосунку.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    meta: { effective: "Effective June 28, 2026", version: "Version 1.0" },
    footer: "Questions about personal data and privacy: info@jasne.app.",
    sections: [
      {
        number: "01",
        title: "Who we are",
        paragraphs: [
          "Jasně is a mobile app that helps users in Czechia understand official documents, find important deadlines, and receive reminders.",
          "For questions about personal data processing, contact info@jasne.app.",
        ],
      },
      {
        number: "02",
        title: "What data we process",
        paragraphs: ["We process data needed to operate the app and your account."],
        bullets: [
          "account data: email, chosen language, settings, and subscription status;",
          "documents: photos, PDFs, recognized text, document type, analysis result, and detected deadlines;",
          "document chat: your questions and Jasně answers;",
          "technical data: app events, errors, usage limits, and data needed for security.",
        ],
      },
      {
        number: "03",
        title: "Why we use data",
        paragraphs: [
          "Data is used to create and maintain your account, recognize documents, explain them in plain language, store history, show deadlines, send reminders, and manage Free/Pro limits.",
        ],
      },
      {
        number: "04",
        title: "AI processing",
        paragraphs: [
          "To recognize and explain a document, Jasně may send the image, PDF, or recognized text to AI and infrastructure providers that help provide OCR, analysis, and chat answers.",
          "Documents are not used for advertising, are not sold, and are not shown to other users.",
        ],
      },
      {
        number: "05",
        title: "Storage and deletion",
        paragraphs: [
          "Documents, analysis results, chats, and deadlines are stored in your account while you use the app or while needed for security, support, and service obligations.",
          "You can delete individual documents, all documents, or your account in Profile. After deletion, data is removed permanently except where temporary retention is required by law or technical security.",
        ],
      },
      {
        number: "06",
        title: "Your rights",
        paragraphs: [
          "You can request access to your data, correction, deletion, restriction of processing, data portability, or object to processing. You may also lodge a complaint with a data protection supervisory authority.",
        ],
      },
      {
        number: "07",
        title: "Security",
        paragraphs: [
          "Access to documents is limited to your account. We use protected storage, authorization, and technical measures to reduce the risk of unauthorized access.",
        ],
      },
      {
        number: "08",
        title: "Policy changes",
        paragraphs: [
          "We may update this policy when app features, providers, or legal requirements change. The current version will be available in the app.",
        ],
      },
    ],
  },
};

export function PrivacyPolicyScreen({
  onBack,
  backLabel,
  localeOverride,
}: {
  onBack?: () => void;
  backLabel?: string;
  localeOverride?: string;
} = {}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const locale = normalizeLocale(localeOverride);
  const content = PRIVACY_POLICY[locale] ?? PRIVACY_POLICY.cs;

  return (
    <Screen>
      <View style={styles.backBar}>
        <Pressable
          onPress={onBack ?? (() => router.back())}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <AppIcon name="chevron-left" size={22} color={colors.brandBlue} />
          <Text style={styles.backText}>{backLabel ?? t("profile.title")}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={2} style={styles.title}>
            {content.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{content.meta.effective}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.meta}>{content.meta.version}</Text>
          </View>
        </View>

        <View style={styles.sections}>
          {content.sections.map((section, index) => (
            <View key={section.number} style={styles.section}>
              <Text style={styles.sectionNumber}>{section.number}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionBody}>
                {section.paragraphs.map((paragraph, paragraphIndex) => (
                  <Text key={`${section.number}-${paragraphIndex}`} selectable style={styles.paragraph}>
                    {paragraph.trim()}
                  </Text>
                ))}
                {section.bullets ? (
                  <View style={styles.bulletList}>
                    {section.bullets.map((bullet, bulletIndex) => (
                      <View key={`${section.number}-bullet-${bulletIndex}`} style={styles.bulletRow}>
                        <Text style={styles.bulletMark}>•</Text>
                        <Text selectable style={styles.bulletText}>{bullet.trim()}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              {index < content.sections.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </View>

        <Text style={styles.footer}>{content.footer}</Text>
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backBar: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 6,
      minHeight: 54,
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      alignSelf: "flex-start",
      minHeight: 44,
      paddingRight: 12,
    },
    backText: {
      color: colors.brandBlue,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowTitle,
      fontWeight: "600",
    },
    pressed: { opacity: 0.72 },
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 120,
    },
    hero: {
      gap: 8,
      marginBottom: 32,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.screenTitle,
      fontWeight: "800",
      letterSpacing: 0,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      columnGap: 14,
      rowGap: 4,
    },
    meta: {
      color: colors.muted3,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    metaDot: {
      color: colors.muted3,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    sections: { gap: 30 },
    section: { gap: 12 },
    sectionNumber: {
      color: colors.muted3,
      fontFamily: fonts.displayBold,
      ...typeStyles.largeScreenTitle,
      fontWeight: "800",
    },
    sectionTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.title3,
      fontWeight: "800",
      letterSpacing: 0,
    },
    sectionBody: { gap: 14 },
    paragraph: {
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.body,
      lineHeight: 26,
      fontWeight: "400",
    },
    bulletList: {
      gap: 8,
      paddingTop: 2,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    bulletMark: {
      color: colors.muted3,
      fontFamily: fonts.bodyBold,
      ...typeStyles.body,
      lineHeight: 26,
      fontWeight: "700",
    },
    bulletText: {
      flex: 1,
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.body,
      lineHeight: 26,
      fontWeight: "400",
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: 16,
    },
    footer: {
      color: colors.muted3,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.caption1,
      fontWeight: "500",
      textAlign: "center",
      marginTop: 44,
    },
  });
}
