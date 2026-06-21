import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { Icon, type IconName } from "@/components/Icon";
import { SelectableText } from "@/components/SelectableText";
import { fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { ProBlurSection } from "@/features/help/ProBlurSection";
import { HELP_TEXT_SCALE } from "@/features/help/constants";
import { triggerSelectionHaptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type {
  CtaAction,
  HelpPopularCategory,
  HelpScanCta,
  HelpSearchResult,
  HelpUsefulAction,
  Section,
} from "@/features/help/types";
import type { UserPlan } from "@/lib/types";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type HelpIconTone = "blue" | "amber" | "green" | "purple" | "red" | "neutral";

export function HelpCard({
  title,
  subtitle,
  badge,
  badgeTone = "blue",
  icon,
  iconTone = "blue",
  onPress,
  disabled,
  children,
  style,
  titleNumberOfLines,
  subtitleNumberOfLines,
}: {
  title?: string | null;
  subtitle?: string | null;
  badge?: string | null;
  badgeTone?: "blue" | "green";
  icon?: IoniconName;
  iconTone?: HelpIconTone;
  onPress?: () => void;
  disabled?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  titleNumberOfLines?: number;
  subtitleNumberOfLines?: number;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const content = (
    <View style={[styles.card, disabled && styles.disabled, style]}>
      {icon ? (
        <View style={[styles.iconBox, iconToneStyle(iconTone, colors)]}>
          <Ionicons name={icon} size={22} color={iconColor(iconTone, colors)} />
        </View>
      ) : null}
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          {title ? <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={titleNumberOfLines} style={styles.cardTitle}>{title}</Text> : null}
          {badge ? (
            <View style={[styles.badge, badgeTone === "green" && styles.badgeGreen]}>
              {badgeTone === "green" ? <View style={styles.badgeDot} /> : null}
              <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={[styles.badgeText, badgeTone === "green" && styles.badgeTextGreen]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={subtitleNumberOfLines} style={styles.cardSubtitle}>{subtitle}</Text> : null}
        {children}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={22} color={colors.muted3} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => pressed && !disabled ? styles.pressed : undefined}
    >
      {content}
    </Pressable>
  );
}

type CategoryRowPosition = "single" | "first" | "middle" | "last";

export function HelpCategoryCard({ category, onPress }: {
  category: HelpPopularCategory;
  onPress?: () => void;
}) {
  return (
    <HelpCard
      title={category.title}
      subtitle={category.subtitle}
      badge={category.badge}
      icon={iconForCategory(category.icon ?? category.slug)}
      iconTone={toneForCategory(category.icon ?? category.slug)}
      onPress={onPress}
    />
  );
}

export function HelpHomeCategoryRow({ category, onPress, position }: {
  category: HelpPopularCategory;
  onPress?: () => void;
  position: CategoryRowPosition;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tone = toneForCategory(category.icon ?? category.slug);
  const guideIcon = guideIconForCategory(category.icon ?? category.slug);
  const isLast = position === "last" || position === "single";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.homeListItem, !isLast && styles.homeListDivider, pressed && styles.pressed]}
    >
      <View style={[styles.homeIconBox, iconToneStyle(tone, colors)]}>
        <Icon name={guideIcon} size={22} color={iconColor(tone, colors)} />
      </View>
      <View style={styles.homeListBody}>
        <View style={styles.titleRow}>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={1} style={styles.homeListTitle}>{category.title}</Text>
          {category.badge ? (
            <View style={styles.badge}>
              <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={1} style={styles.badgeText}>{category.badge}</Text>
            </View>
          ) : null}
        </View>
        {category.subtitle ? <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={1} style={styles.homeListSubtitle}>{category.subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.muted3} />
    </Pressable>
  );
}

export function HelpGuideCard({ title, subtitle, label, icon = "document-text-outline", onPress }: {
  title: string;
  subtitle?: string | null;
  label?: string | null;
  icon?: IoniconName;
  onPress?: () => void;
}) {
  return (
    <HelpCard title={title} subtitle={subtitle} badge={label} icon={icon} iconTone="blue" onPress={onPress} />
  );
}

export function HelpActionCard({ action, onPress }: {
  action: HelpUsefulAction;
  onPress?: () => void;
}) {
  return (
    <HelpCard
      title={action.title}
      subtitle={action.subtitle}
      icon={action.highlighted ? "camera-outline" : iconForAction(action.action)}
      iconTone={action.highlighted ? "blue" : "neutral"}
      onPress={onPress}
      disabled={!onPress}
    />
  );
}

export function HelpQuickActionCard({ title, subtitle, actionKey, onPress, disabled }: {
  title: string;
  subtitle: string;
  actionKey: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const displayTitle = actionKey === "check_status" ? t("help.home.checkStatusTitle") : title;
  const displaySubtitle = actionKey === "check_status" ? t("help.home.checkStatusSubtitle") : subtitle;
  return (
    <HelpCard
      title={displayTitle}
      subtitle={displaySubtitle}
      badge={actionKey === "check_status" ? t("help.home.onlineBadge") : undefined}
      badgeTone={actionKey === "check_status" ? "green" : "blue"}
      icon={iconForQuickAction(actionKey)}
      iconTone="blue"
      onPress={onPress}
      disabled={disabled}
      titleNumberOfLines={2}
      subtitleNumberOfLines={2}
      style={{
        minHeight: 84,
        backgroundColor: colors.surface,
        borderColor: colors.borderSoft,
        borderWidth: 1,
      }}
    />
  );
}

export function ScanCtaCard({ cta, onPress }: {
  cta: HelpScanCta;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.scanCta}>
      <View style={styles.scanCtaText}>
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.scanTitle}>{cta.title}</Text>
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.scanSubtitle}>{cta.subtitle}</Text>
        {cta.helper_text ? <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.helper}>{cta.helper_text}</Text> : null}
      </View>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Ionicons name="camera-outline" size={21} color={colors.textOnAccent} />
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.primaryButtonText}>{cta.primary_button}</Text>
      </Pressable>
      {cta.pro_hint ? <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.proHint}>{cta.pro_hint}</Text> : null}
    </View>
  );
}

// Joins an optional block title with its body/items into one clipboard string.
function blockPlainText(title: string | null | undefined, lines: string[]) {
  const out: string[] = [];
  const heading = title?.trim();
  if (heading) out.push(heading);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed) out.push(trimmed);
  });
  return out.join("\n");
}

function GuideCopyButton({ text }: { text: string }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = useCallback(async () => {
    const value = text.trim();
    if (!value) return;
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      return;
    }
    triggerSelectionHaptic();
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <Pressable
      onPress={handleCopy}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t(copied ? "chat.copied" : "chat.copy")}
      style={({ pressed }) => [styles.guideCopyBtn, pressed && styles.pressed]}
    >
      <Icon name={copied ? "check" : "copy"} size={15} color={copied ? colors.green : colors.muted2} />
    </Pressable>
  );
}

export function WarningCard({ title, body, info = false }: {
  title?: string | null;
  body: string;
  info?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.warningCard, info && styles.infoCard]}>
      <Ionicons name={info ? "information-circle-outline" : "alert-circle-outline"} size={22} color={info ? colors.muted2 : colors.amberDark} />
      <View style={styles.warningBody}>
        {title ? <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.warningTitle}>{title}</SelectableText> : null}
        <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.warningText}>{body}</SelectableText>
      </View>
      <GuideCopyButton text={blockPlainText(title, [body])} />
    </View>
  );
}

export function StepsList({ title, items }: { title?: string | null; items: string[] }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.contentCard}>
      <View style={styles.blockHeader}>
        <View style={styles.blockHeaderTitle}>
          {title ? <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentTitle}>{title}</SelectableText> : null}
        </View>
        <GuideCopyButton text={blockPlainText(title, items.map((item, index) => `${index + 1}. ${item}`))} />
      </View>
      <View style={styles.listBlock}>
        {items.map((item, index) => (
          <View key={`${index}-${item}`} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentText}>{item}</SelectableText>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ChecklistList({ title, items }: { title?: string | null; items: string[] }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.contentCard}>
      <View style={styles.blockHeader}>
        <View style={styles.blockHeaderTitle}>
          {title ? <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentTitle}>{title}</SelectableText> : null}
        </View>
        <GuideCopyButton text={blockPlainText(title, items.map((item) => `• ${item}`))} />
      </View>
      <View style={styles.listBlock}>
        {items.map((item, index) => (
          <View key={`${index}-${item}`} style={styles.checkRow}>
            <Ionicons name="checkmark-outline" size={24} color={colors.primary} />
            <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentText}>{item}</SelectableText>
          </View>
        ))}
      </View>
    </View>
  );
}

export function HelpContentRenderer({ sections, onAction, plan = "pro", onUpgraded }: {
  sections: Section[];
  onAction: (action: CtaAction) => void;
  plan?: UserPlan;
  // Bubbled up from a gated section's paywall after a successful purchase.
  onUpgraded?: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.renderer}>
      {sections.map((section, index) => {
        const key = `${index}-${section.type}`;
        let rendered: ReactNode;
        if (section.type === "text") {
          rendered = (
            <View style={styles.contentCard}>
              <View style={styles.blockHeader}>
                <View style={styles.blockHeaderTitle}>
                  {section.title ? <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.eyebrow}>{section.title}</SelectableText> : null}
                </View>
                <GuideCopyButton text={blockPlainText(section.title, [section.body])} />
              </View>
              <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentText}>{section.body}</SelectableText>
            </View>
          );
        } else if (section.type === "steps") {
          rendered = <StepsList title={section.title} items={section.items} />;
        } else if (section.type === "checklist") {
          rendered = <ChecklistList title={section.title} items={section.items} />;
        } else if (section.type === "warning") {
          rendered = <WarningCard title={section.title} body={section.body} />;
        } else {
          rendered = (
            <View style={styles.ctaSection}>
              {section.title ? <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentTitle}>{section.title}</SelectableText> : null}
              {section.actions.map((action) => (
                <CtaActionButton key={action} action={action} onPress={() => onAction(action)} />
              ))}
            </View>
          );
        }

        // warning/cta are always open regardless of gating flags. A section is
        // gated when the backend flagged it `locked` (authoritative — only ever
        // set for free users) or when it's `pro_only` and this is a free user.
        // `locked` is the stronger contract: trust it directly.
        const gateable = section.type !== "warning" && section.type !== "cta";
        const gated = gateable && (section.locked || (section.pro_only && plan === "free"));
        if (gated) {
          // For free users the backend sends the full Pro content flagged
          // locked; we render it blurred behind the upgrade gate (the blur is
          // cosmetic, not a security boundary). Title is passed separately
          // (rendered crisp above the blur), so the node here omits it to avoid
          // a duplicate heading. If no content arrived, ProBlurSection falls
          // back to a content-free skeleton.
          //
          // Chrome-free nodes: no contentCard background (it would hide the
          // blur) and no copy button (the content is non-interactive behind the
          // gate). Reuses the row styles for a real look.
          let gatedContent: ReactNode = null;
          if (section.type === "text" && section.body) {
            gatedContent = (
              <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentText}>
                {section.body}
              </SelectableText>
            );
          } else if (section.type === "steps" && section.items?.length) {
            gatedContent = (
              <View style={styles.listBlock}>
                {section.items.map((item, i) => (
                  <View key={`${i}-${item}`} style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.stepNumberText}>{i + 1}</Text>
                    </View>
                    <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentText}>{item}</SelectableText>
                  </View>
                ))}
              </View>
            );
          } else if (section.type === "checklist" && section.items?.length) {
            gatedContent = (
              <View style={styles.listBlock}>
                {section.items.map((item, i) => (
                  <View key={`${i}-${item}`} style={styles.checkRow}>
                    <Ionicons name="checkmark-outline" size={24} color={colors.primary} />
                    <SelectableText maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.contentText}>{item}</SelectableText>
                  </View>
                ))}
              </View>
            );
          }
          return (
            <ProBlurSection key={key} title={section.title ?? null} onUpgraded={onUpgraded}>
              {gatedContent}
            </ProBlurSection>
          );
        }
        return <View key={key}>{rendered}</View>;
      })}
    </View>
  );
}

function CtaActionButton({ action, onPress }: { action: CtaAction; onPress: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const label = labelForCtaAction(action);
  if (!label) {
    logger.warn("Unknown help CTA action", action);
    return null;
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
      <Ionicons name={iconForCtaAction(action)} size={20} color={colors.primary} />
      <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function HelpSearchInput({ value, placeholder, onChangeText, onClear }: {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search-outline" size={21} color={colors.primary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted2}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxFontSizeMultiplier={HELP_TEXT_SCALE}
        style={styles.searchInput}
      />
      {value.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("documents.searchClearAria")} onPress={onClear} style={styles.clearButton}>
          <Ionicons name="close-circle" size={22} color={colors.muted2} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function HelpChip({ label, selected, onPress }: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function HelpEmptyState({ title, subtitle, heroIcon, primaryLabel, primaryIcon, secondaryLabel, onPrimary, onSecondary }: {
  title: string;
  subtitle: string;
  heroIcon?: IoniconName;
  primaryLabel: string;
  primaryIcon?: IoniconName;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.emptyState}>
      {heroIcon ? (
        <View style={styles.emptyHeroIconWrap}>
          <Ionicons name={heroIcon} size={40} color={colors.muted2} />
        </View>
      ) : null}
      <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.emptyTitle}>{title}</Text>
      <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.emptySubtitle}>{subtitle}</Text>
      <Pressable onPress={onPrimary} style={({ pressed }) => [styles.emptyPrimaryButton, pressed && styles.pressed]}>
        <Ionicons name={primaryIcon ?? "camera-outline"} size={20} color={colors.textOnAccent} />
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.emptyPrimaryButtonText}>{primaryLabel}</Text>
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable onPress={onSecondary} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.textButtonText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function HelpErrorState({ onRetry }: {
  onRetry: () => void;
  onScan?: () => void;
}) {
  return (
    <HelpEmptyState
      heroIcon="alert-circle-outline"
      title={t("common.offlineTitle")}
      subtitle={t("common.offlineDetail")}
      primaryLabel={t("common.tryAgain")}
      primaryIcon="refresh-outline"
      onPrimary={onRetry}
    />
  );
}

export function HelpLoadingState() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function HelpSearchResultCard({ result, onPress }: {
  result: HelpSearchResult;
  onPress: () => void;
}) {
  return (
    <HelpCard
      title={result.title}
      subtitle={[result.category_title, result.subtitle].filter(Boolean).join(" · ")}
      icon={result.type === "guide" ? "document-text-outline" : "folder-open-outline"}
      iconTone="blue"
      onPress={onPress}
    />
  );
}

function iconForQuickAction(key: string): IoniconName {
  if (key === "check_status") return "navigate-circle-outline";
  if (key === "prepare_documents") return "clipboard-outline";
  if (key === "understand_letter") return "mail-outline";
  return "help-circle-outline";
}

function iconForCategory(value: string): IoniconName {
  if (value === "passport" || value === "visa-pobyt") return "id-card-outline";
  if (value === "receipt" || value === "taxes") return "receipt-outline";
  if (value === "zap" || value === "bills") return "cash-outline";
  if (value === "briefcase" || value === "urad-prace") return "briefcase-outline";
  if (value === "shield" || value === "health-insurance") return "shield-outline";
  if (value === "doc" || value === "contracts") return "document-text-outline";
  return "folder-open-outline";
}

function guideIconForCategory(value: string): IconName {
  if (value === "passport" || value === "visa-pobyt" || value === "cizinecka") return "globe";
  if (value === "receipt" || value === "taxes" || value === "danove") return "doc-text";
  if (value === "zap" || value === "bills" || value === "ucty") return "zap";
  if (value === "briefcase" || value === "urad-prace" || value === "urad_prace") return "briefcase";
  if (value === "shield" || value === "health-insurance" || value === "zdravotni") return "shield";
  if (value === "doc" || value === "contracts" || value === "smlouvy") return "pages";
  return "pages";
}

function toneForCategory(value: string): HelpIconTone {
  if (value === "receipt" || value === "taxes" || value === "danove") return "amber";
  if (value === "zap" || value === "bills" || value === "ucty") return "green";
  if (value === "briefcase" || value === "urad-prace" || value === "urad_prace") return "purple";
  if (value === "shield" || value === "health-insurance" || value === "zdravotni") return "red";
  return "blue";
}

function iconForAction(action: string): IoniconName {
  if (action === "deadline_new" || action === "deadlines_tab") return "calendar-outline";
  return "arrow-forward-circle-outline";
}

function iconForCtaAction(action: CtaAction): IoniconName {
  if (action === "check_status_visa") return "search-outline";
  if (action === "add_deadline" || action === "add_deadline_manual" || action === "open_deadlines") return "calendar-outline";
  if (action === "open_help_center") return "book-outline";
  return "camera-outline";
}

function labelForCtaAction(action: CtaAction) {
  if (action === "check_status_visa") return t("help.guide.ctaCheckStatus");
  if (action === "scan_document" || action === "scan_oamp_letter" || action === "scan_tax_letter" || action === "scan_bill" || action === "scan_contract") {
    return t("help.guide.ctaScan");
  }
  if (action === "add_deadline" || action === "add_deadline_manual") return t("help.guide.ctaManualDeadline");
  if (action === "open_deadlines") return t("help.guide.ctaOpenDeadlines");
  if (action === "open_help_center") return t("help.guide.ctaOpenHelp");
  return null;
}

function iconToneStyle(tone: HelpIconTone, colors: ColorPalette) {
  if (tone === "amber") return { backgroundColor: colors.amberLight };
  if (tone === "green") return { backgroundColor: colors.greenLight };
  if (tone === "purple") return { backgroundColor: colors.proLight };
  if (tone === "red") return { backgroundColor: colors.dangerLight };
  if (tone === "neutral") return { backgroundColor: colors.surface2 };
  return { backgroundColor: colors.blueSoft };
}

function iconColor(tone: HelpIconTone, colors: ColorPalette) {
  if (tone === "amber") return colors.amberDark;
  if (tone === "green") return colors.greenDark;
  if (tone === "purple") return colors.pro;
  if (tone === "red") return colors.danger;
  if (tone === "neutral") return colors.muted2;
  return colors.primary;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      minHeight: 72,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.72 },
    iconBox: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center"
    },
    cardBody: { flex: 1, minWidth: 0, gap: 3 },
    titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    cardTitle: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.callout },
    cardSubtitle: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowMeta },
    badge: {
      borderRadius: 12,
      backgroundColor: colors.blueSoft,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 2
    },
    badgeGreen: { backgroundColor: colors.greenLight },
    badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.greenDark },
    badgeText: { color: colors.primary, fontFamily: fonts.bodySemiBold, ...typeStyles.caption2 },
    badgeTextGreen: { color: colors.greenDark },
    homeListItem: {
      minHeight: 64,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    homeListDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border
    },
    homeIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center"
    },
    homeListBody: { flex: 1, minWidth: 0, gap: 2 },
    homeListTitle: { flexShrink: 1, color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.headline },
    homeListSubtitle: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.subhead },
    scanCta: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12
    },
    scanCtaText: { gap: 6 },
    scanTitle: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.rowTitle },
    scanSubtitle: { color: colors.muted, fontFamily: fonts.body, ...typeStyles.rowMeta },
    helper: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.caption1 },
    proHint: { color: colors.muted3, fontFamily: fonts.body, ...typeStyles.caption2 },
    primaryButton: {
      minHeight: 48,
      borderRadius: 18,
      backgroundColor: colors.primaryDark,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 18
    },
    primaryButtonText: { color: colors.textOnAccent, fontFamily: fonts.bodyBold, ...typeStyles.rowSecondary },
    warningCard: {
      borderRadius: 18,
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.amberMid,
      padding: 15,
      flexDirection: "row",
      gap: 10
    },
    infoCard: {
      backgroundColor: colors.surface2,
      borderColor: colors.borderSoft
    },
    warningBody: { flex: 1, gap: 4 },
    warningTitle: { color: colors.amberDeep, fontFamily: fonts.bodyBold, ...typeStyles.rowMeta },
    warningText: { color: colors.muted, fontFamily: fonts.body, ...typeStyles.rowMeta },
    renderer: { gap: 12 },
    contentCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12
    },
    blockHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8
    },
    blockHeaderTitle: {
      flex: 1
    },
    guideCopyBtn: {
      padding: 4,
      borderRadius: 8,
      alignSelf: "flex-start"
    },
    eyebrow: {
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      letterSpacing: 1.8,
      textTransform: "uppercase"
    },
    contentTitle: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.rowTitle },
    contentText: { flex: 1, color: colors.muted, fontFamily: fonts.body, ...typeStyles.rowSecondary, lineHeight: 22 },
    listBlock: { gap: 13 },
    stepRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    stepNumber: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.blueSoft,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1
    },
    stepNumberText: { color: colors.primary, fontFamily: fonts.bodyBold, ...typeStyles.rowMeta },
    checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    ctaSection: {
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: 15,
      gap: 10
    },
    secondaryButton: {
      minHeight: 46,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.blueSoft,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 9,
      paddingHorizontal: 16
    },
    secondaryButtonText: { color: colors.primary, fontFamily: fonts.bodyBold, ...typeStyles.rowSecondary },
    searchBox: {
      minHeight: 52,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.primaryMid,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16
    },
    searchInput: { flex: 1, color: colors.text, fontFamily: fonts.body, ...typeStyles.input, minHeight: 48 },
    clearButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    chip: {
      minHeight: 34,
      borderRadius: 17,
      backgroundColor: colors.surface2,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center"
    },
    chipSelected: {
      borderWidth: 1,
      borderColor: colors.primaryMid,
      backgroundColor: colors.blueSoft
    },
    chipText: { color: colors.muted2, fontFamily: fonts.bodySemiBold, ...typeStyles.rowMeta },
    chipTextSelected: { color: colors.primary },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 32,
      paddingBottom: 48,
    },
    emptyHeroIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 22,
      backgroundColor: colors.surface3,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    emptyTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.compactTitle,
      fontWeight: "700",
      textAlign: "center",
      maxWidth: 280,
    },
    emptySubtitle: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      textAlign: "center",
      maxWidth: 300,
    },
    emptyPrimaryButton: {
      marginTop: 8,
      minHeight: 52,
      paddingHorizontal: 28,
      borderRadius: 16,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
    },
    emptyPrimaryButtonText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.button,
      fontWeight: "700",
    },
    textButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
    textButtonText: { color: colors.primary, fontFamily: fonts.bodyBold, ...typeStyles.rowSecondary }
  });
}
