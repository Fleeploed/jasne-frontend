import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { listDeadlines } from "@/features/deadlines/deadlinesApi";
import { deleteAllScans, listScans } from "@/features/scans/scansApi";
import { invalidateChatCache } from "@/features/chat/chatThreadCache";
import { t } from "@/lib/i18n";

const PRIVACY_POLICY_URL = "https://jasne.app/privacy";

type IconSource =
  | { kind: "app"; name: AppIconName }
  | { kind: "ion"; name: keyof typeof Ionicons.glyphMap };

type InfoRow = {
  icon: IconSource;
  title: string;
  body?: string;
};

export function PrivacyScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [scansCount, setScansCount] = useState<number | null>(null);
  const [deadlinesCount, setDeadlinesCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const [scans, deadlines] = await Promise.all([listScans(), listDeadlines(false)]);
      if (!aliveRef.current) return;
      setScansCount(scans.length);
      setDeadlinesCount(deadlines.length);
    } catch {
      if (!aliveRef.current) return;
      setScansCount(0);
      setDeadlinesCount(0);
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const runDeleteAll = useCallback(async () => {
    setDeleting(true);
    try {
      const result = await deleteAllScans();
      invalidateChatCache();
      if (!aliveRef.current) return;
      setScansCount(0);
      setDeadlinesCount(0);
      // TODO: once push notifications are wired, cancel any locally scheduled
      // reminders for the deleted deadlines here. The backend has already
      // removed the rows; only client-side scheduled notifications remain.
      Alert.alert(
        t("privacy.deleteAll.successToast", {
          scans: result.deleted_scans,
          deadlines: result.deleted_deadlines,
        }),
      );
    } catch (error) {
      if (!aliveRef.current) return;
      const detail = error instanceof Error ? error.message : String(error);
      console.warn("deleteAllScans failed", error);
      Alert.alert(t("privacy.deleteAll.errorToast"), detail);
      void loadCounts();
    } finally {
      if (aliveRef.current) setDeleting(false);
    }
  }, [loadCounts]);

  const confirmDeleteAll = useCallback(() => {
    Alert.alert(
      t("privacy.deleteAll.confirmTitle", {
        scans: scansCount ?? 0,
        deadlines: deadlinesCount ?? 0,
      }),
      t("privacy.deleteAll.confirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("privacy.deleteAll.confirmCta"), style: "destructive", onPress: () => void runDeleteAll() },
      ],
      { cancelable: true },
    );
  }, [deadlinesCount, runDeleteAll, scansCount]);

  const hasDataToDelete = (scansCount ?? 0) > 0 || (deadlinesCount ?? 0) > 0;

  const processedRows: InfoRow[] = [
    {
      icon: { kind: "app", name: "doc" },
      title: t("privacy.processed.photosTitle"),
      body: t("privacy.processed.photosBody"),
    },
    {
      icon: { kind: "app", name: "doc-text" },
      title: t("privacy.processed.ocrTitle"),
      body: t("privacy.processed.ocrBody"),
    },
    {
      icon: { kind: "ion", name: "paper-plane-outline" },
      title: t("privacy.processed.chatTitle"),
      body: t("privacy.processed.chatBody"),
    },
    {
      icon: { kind: "app", name: "calendar" },
      title: t("privacy.processed.deadlinesTitle"),
      body: t("privacy.processed.deadlinesBody"),
    },
  ];

  const aiRows: InfoRow[] = [
    {
      icon: { kind: "ion", name: "eye-outline" },
      title: t("privacy.ai.ocrTitle"),
      body: t("privacy.ai.ocrBody"),
    },
    {
      icon: { kind: "app", name: "sparkles" },
      title: t("privacy.ai.analysisTitle"),
      body: t("privacy.ai.analysisBody"),
    },
    {
      icon: { kind: "ion", name: "paper-plane-outline" },
      title: t("privacy.ai.answersTitle"),
      body: t("privacy.ai.answersBody"),
    },
  ];

  const storageRows: InfoRow[] = [
    {
      icon: { kind: "app", name: "doc" },
      title: t("privacy.storage.docsTitle"),
      body: t("privacy.storage.docsBody"),
    },
    {
      icon: { kind: "app", name: "sparkles" },
      title: t("privacy.storage.resultsTitle"),
      body: t("privacy.storage.resultsBody"),
    },
    {
      icon: { kind: "app", name: "calendar" },
      title: t("privacy.storage.deadlinesTitle"),
      body: t("privacy.storage.deadlinesBody"),
    },
    {
      icon: { kind: "app", name: "lock" },
      title: t("privacy.storage.accessTitle"),
      body: t("privacy.storage.accessBody"),
    },
  ];

  const notDoItems = [
    t("privacy.notDo.sell"),
    t("privacy.notDo.ads"),
    t("privacy.notDo.share"),
    t("privacy.notDo.publish"),
    t("privacy.notDo.replace"),
  ];

  return (
    <Screen>
      <View style={styles.backBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <AppIcon name="chevron-left" size={22} color={colors.primary} />
          <Text style={styles.backText}>{t("profile.title")}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text style={styles.title}>{t("privacy.title")}</Text>
          <Text style={styles.subtitle}>{t("privacy.subtitle")}</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <AppIcon name="shield" size={26} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>{t("privacy.heroTitle")}</Text>
          <Text style={styles.heroBody}>{t("privacy.heroBody")}</Text>
        </View>

        <Section title={t("privacy.processedSection")} styles={styles}>
          <Card styles={styles}>
            {processedRows.map((row, idx) => (
              <Row
                key={row.title}
                row={row}
                isLast={idx === processedRows.length - 1}
                colors={colors}
                styles={styles}
              />
            ))}
          </Card>
        </Section>

        <Section title={t("privacy.aiSection")} styles={styles}>
          <Card styles={styles}>
            <Text style={styles.aiIntro}>{t("privacy.aiIntro")}</Text>
            {aiRows.map((row, idx) => (
              <Row
                key={row.title}
                row={row}
                isLast={idx === aiRows.length - 1}
                colors={colors}
                styles={styles}
              />
            ))}
          </Card>
        </Section>

        <Section title={t("privacy.storageSection")} styles={styles}>
          <Card styles={styles}>
            {storageRows.map((row, idx) => (
              <Row
                key={row.title}
                row={row}
                isLast={idx === storageRows.length - 1}
                colors={colors}
                styles={styles}
              />
            ))}
          </Card>
        </Section>

        <Section title={t("privacy.notDoSection")} styles={styles}>
          <Card styles={styles}>
            {notDoItems.map((item, idx) => (
              <View
                key={item}
                style={[styles.notDoRow, idx < notDoItems.length - 1 && styles.rowDivider]}
              >
                <View style={styles.checkBadge}>
                  <AppIcon name="check" size={16} color={colors.greenDark} strokeWidth={2.4} />
                </View>
                <Text style={styles.notDoText}>{item}</Text>
              </View>
            ))}
          </Card>
        </Section>

        <Section title={t("privacy.controlSection")} styles={styles}>
          <Card styles={styles}>
            {hasDataToDelete && (
              <DestructiveRow
                icon={{ kind: "app", name: "trash" }}
                title={t("privacy.control.deleteAllDocsTitle")}
                body={t("privacy.control.deleteAllDocsBody")}
                disabled={deleting}
                loading={deleting}
                onPress={confirmDeleteAll}
                isLast={false}
                colors={colors}
                styles={styles}
              />
            )}
            <ControlRow
              icon={{ kind: "app", name: "user" }}
              title={t("privacy.control.deleteAccountTitle")}
              body={t("privacy.control.deleteAccountBody")}
              isLast={true}
              destructive
              colors={colors}
              styles={styles}
            />
          </Card>
        </Section>

        <Pressable
          onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }}
          style={({ pressed }) => [styles.policyLink, pressed && styles.pressed]}
        >
          <Text style={styles.policyLinkText}>{t("privacy.policyLink")}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children, styles }: { title: string; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Card({ children, styles }: { children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.card}>{children}</View>;
}

function RowIcon({ icon, colors, styles }: { icon: IconSource; colors: ColorPalette; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.rowIcon}>
      {icon.kind === "app" ? (
        <AppIcon name={icon.name} size={20} color={colors.primary} />
      ) : (
        <Ionicons name={icon.name} size={20} color={colors.primary} />
      )}
    </View>
  );
}

function Row({ row, isLast, colors, styles }: { row: InfoRow; isLast: boolean; colors: ColorPalette; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <RowIcon icon={row.icon} colors={colors} styles={styles} />
      <View style={styles.rowTextBlock}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        {row.body ? <Text style={styles.rowBody}>{row.body}</Text> : null}
      </View>
    </View>
  );
}

function DestructiveRow({
  icon,
  title,
  body,
  disabled,
  loading,
  onPress,
  isLast,
  colors,
  styles,
}: {
  icon: IconSource;
  title: string;
  body: string;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  isLast: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const tint = disabled ? colors.muted3 : colors.danger;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowDivider,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[styles.controlIcon, { backgroundColor: colors.dangerLight }]}>
        {icon.kind === "app" ? (
          <AppIcon name={icon.name} size={20} color={tint} />
        ) : (
          <Ionicons name={icon.name} size={20} color={tint} />
        )}
      </View>
      <View style={styles.rowTextBlock}>
        <Text style={[styles.rowTitle, { color: tint }]}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
      {loading ? <ActivityIndicator size="small" color={tint} /> : null}
    </Pressable>
  );
}

function ControlRow({
  icon,
  title,
  body,
  isLast,
  destructive,
  colors,
  styles,
}: {
  icon: IconSource;
  title: string;
  body: string;
  isLast: boolean;
  destructive?: boolean;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const iconTint = destructive ? colors.danger : colors.muted;
  const iconBg = destructive ? colors.dangerLight : undefined;
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={[styles.controlIcon, iconBg ? { backgroundColor: iconBg } : null]}>
        {icon.kind === "app" ? (
          <AppIcon name={icon.name} size={20} color={iconTint} />
        ) : (
          <Ionicons name={icon.name} size={20} color={iconTint} />
        )}
      </View>
      <View style={styles.rowTextBlock}>
        <Text style={[styles.rowTitle, destructive && { color: colors.danger }]}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
      {destructive ? null : <AppIcon name="chevron-right" size={20} color={colors.muted3} />}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backBar: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 6,
      backgroundColor: colors.bg,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      alignSelf: "flex-start",
      paddingVertical: 8,
      paddingRight: 12,
    },
    backText: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowTitle,
      fontWeight: "600",
    },
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: 24, paddingBottom: 60 },
    heading: { paddingTop: 8, paddingBottom: 18, gap: 8 },
    title: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.screenTitle,
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    subtitle: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowSecondary,
      fontWeight: "500",
    },
    hero: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.blueSoft,
      padding: 20,
      gap: 12,
      marginBottom: 24,
    },
    heroIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.blueMid,
      alignItems: "center",
      justifyContent: "center",
    },
    heroTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.title3,
      fontWeight: "700",
      marginTop: 4,
    },
    heroBody: {
      color: colors.muted,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowSecondary,
      fontWeight: "500",
    },
    section: { marginBottom: 22, gap: 10 },
    sectionTitle: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 3,
    },
    card: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    aiIntro: {
      color: colors.muted,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowSecondary,
      fontWeight: "500",
      paddingTop: 14,
      paddingBottom: 10,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
      paddingVertical: 14,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.blueSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    controlIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    rowTextBlock: { flex: 1, minWidth: 0, gap: 3 },
    rowTitle: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowTitle,
      fontWeight: "600",
    },
    rowBody: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowMeta,
      fontWeight: "500",
    },
    notDoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 14,
    },
    checkBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.greenLight,
      alignItems: "center",
      justifyContent: "center",
    },
    notDoText: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowSecondary,
      fontWeight: "600",
    },
    policyLink: {
      alignSelf: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginTop: 4,
    },
    policyLinkText: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowSecondary,
      fontWeight: "600",
    },
    pressed: { opacity: 0.72 },
  });
}
