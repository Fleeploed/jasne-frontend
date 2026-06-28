import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Screen, fonts, typeStyles, useColors, type ColorPalette } from "@/components/ui";
import { normalizeLocale, t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";
import { checkOampStatus, type OampStatusResponse } from "@/features/help/statusApi";
import { OampStatusResultBody } from "@/features/oamp/OampStatusResultScreen";
import { HELP_TEXT_SCALE } from "@/features/help/constants";
import type { OampStatus } from "@/constants/oamp";

const CASE_TYPES = ["ZM","ST", "CC", "CD", "DO", "DP", "DV", "MK", "PP", "TP", "VP", "ZK"] as const;
const CASE_YEARS = Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() + 1 - index));

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type CaseType = (typeof CASE_TYPES)[number];
type OpenDropdown = "type" | "year" | null;
type FocusedField = "sequence" | "optional" | "visa" | null;
type CaseParts = {
  sequence: string;
  optional: string;
  type: CaseType | "";
  year: string;
  visaNumber: string;
};

const INITIAL_CASE_PARTS: CaseParts = {
  sequence: "",
  optional: "",
  type: "",
  year: "",
  visaNumber: "",
};

export function HelpStatusScreen() {
  const colors = useColors();
  const { locale } = useLocale();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [caseParts, setCaseParts] = useState<CaseParts>(INITIAL_CASE_PARTS);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [result, setResult] = useState<OampStatusResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against setState-after-unmount when the OAMP lookup is slow.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const showInput = !result;

  const handleSubmit = useCallback(async (parts: CaseParts) => {
    const caseNumber = buildCaseNumber(parts);
    const visa = parts.visaNumber.trim().toUpperCase();
    if (!caseNumber && !visa) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = caseNumber
        ? await checkOampStatus({ caseNumber, language: normalizeLocale(locale) })
        : await checkOampStatus({ visaNumber: visa, language: normalizeLocale(locale) });
      if (!aliveRef.current) return;
      setSubmittedQuery(response.query || caseNumber || visa);
      setResult(response);
    } catch (err) {
      if (!aliveRef.current) return;
      const detail = err instanceof Error ? err.message : t("help.status.checkError");
      setError(detail || t("help.status.checkError"));
    } finally {
      if (aliveRef.current) setSubmitting(false);
    }
  }, [locale]);

  return (
    <Screen>
      <StatusTopBar title={t("help.status.title")} styles={styles} colors={colors} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={[styles.content, showInput ? styles.inputContent : styles.resultContent]}
        >
          {showInput ? (
            <StatusInput
              caseParts={caseParts}
              setCaseParts={setCaseParts}
              submitting={submitting}
              error={error}
              onSubmit={handleSubmit}
              styles={styles}
              colors={colors}
            />
          ) : (
            <StatusResultView
              caseNumber={submittedQuery}
              result={result}
              onEdit={() => {
                setResult(null);
                setError(null);
              }}
              styles={styles}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function StatusTopBar({ title, styles, colors }: {
  title: string;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </Pressable>
      <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={1} style={styles.topTitle}>{title}</Text>
      <View style={styles.topSpacer} />
    </View>
  );
}

function StatusInput({
  caseParts,
  setCaseParts,
  submitting,
  error,
  onSubmit,
  styles,
  colors,
}: {
  caseParts: CaseParts;
  setCaseParts: (value: CaseParts | ((current: CaseParts) => CaseParts)) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (parts: CaseParts) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const [focused, setFocused] = useState<FocusedField>(null);
  const formattedCaseNumber = buildCaseNumber(caseParts);
  const visaNumber = caseParts.visaNumber.trim().toUpperCase();
  const submitValue = formattedCaseNumber || visaNumber;
  const canSubmit = submitValue.length > 0 && !submitting;
  const submit = () => onSubmit(caseParts);

  function updatePart<K extends keyof CaseParts>(key: K, value: CaseParts[K]) {
    setCaseParts((current) => ({ ...current, [key]: value }));
  }

  function updateSequence(value: string) {
    const parsed = parseCaseNumber(value);
    if (parsed) {
      setCaseParts((current) => ({
        ...current,
        ...parsed,
        sequence: parsed.sequence?.slice(0, 5) ?? current.sequence,
        optional: parsed.optional?.slice(0, 2) ?? current.optional,
        visaNumber: "",
      }));
      return;
    }
    updatePart("sequence", value.replace(/\D/g, "").slice(0, 5));
  }

  function updateOptional(value: string) {
    updatePart("optional", value.replace(/\D/g, "").slice(0, 2));
  }

  return (
    <>
      <View style={styles.intro}>
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.formTitle}>{t("help.status.formTitle")}</Text>
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.formSubtitle}>{t("help.status.formSubtitle")}</Text>
      </View>

      <View style={styles.fieldBlock}>
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.inputLabel}>{t("help.status.caseLabel")}</Text>
        <View style={styles.caseFormCard}>
          <View style={styles.caseFormRow}>
            <View style={[styles.caseField, styles.casePrefixField]}>
              <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.caseFieldLabel}>{t("help.status.prefixLabel")}</Text>
              <Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={HELP_TEXT_SCALE}
                minimumFontScale={0.82}
                numberOfLines={1}
                style={styles.casePrefixValue}
              >
                OAM-
              </Text>
            </View>
            <View
              style={[
                styles.caseField,
                styles.caseNumberField,
                focused === "sequence" && styles.caseFieldFocused,
              ]}
            >
              <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={1} style={styles.caseFieldLabel}>
                {t("help.status.sequenceLabel")}
              </Text>
              <TextInput
                value={caseParts.sequence}
                onChangeText={updateSequence}
                onFocus={() => setFocused("sequence")}
                onBlur={() => setFocused((current) => (current === "sequence" ? null : current))}
                contextMenuHidden
                keyboardType="number-pad"
                maxLength={5}
                returnKeyType="done"
                placeholder="12345"
                placeholderTextColor={colors.muted3}
                maxFontSizeMultiplier={HELP_TEXT_SCALE}
                style={styles.caseInlineInput}
              />
            </View>
            <View
              style={[
                styles.caseField,
                styles.caseOptionalField,
                focused === "optional" && styles.caseFieldFocused,
              ]}
            >
              <Text
                maxFontSizeMultiplier={HELP_TEXT_SCALE}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.caseFieldLabel}
              >
                {t("help.status.optionalLabel")}
              </Text>
              <TextInput
                value={caseParts.optional}
                onChangeText={updateOptional}
                onFocus={() => setFocused("optional")}
                onBlur={() => setFocused((current) => (current === "optional" ? null : current))}
                contextMenuHidden
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardType="number-pad"
                maxLength={2}
                returnKeyType="done"
                placeholder="XX"
                placeholderTextColor={colors.muted3}
                maxFontSizeMultiplier={HELP_TEXT_SCALE}
                style={styles.caseInlineInput}
              />
            </View>
          </View>
          <View style={[styles.caseFormRow, styles.caseDropdownRow]}>
            <CaseDropdown
              label={t("help.status.typeLabel")}
              value={caseParts.type}
              placeholder={t("help.status.typePlaceholder")}
              options={CASE_TYPES}
              open={openDropdown === "type"}
              onToggle={() => setOpenDropdown((current) => (current === "type" ? null : "type"))}
              onSelect={(value) => {
                updatePart("type", value as CaseType);
                setOpenDropdown(null);
              }}
              styles={styles}
              colors={colors}
            />
            <CaseDropdown
              label={t("help.status.yearLabel")}
              value={caseParts.year}
              placeholder={t("help.status.yearPlaceholder")}
              options={CASE_YEARS}
              open={openDropdown === "year"}
              onToggle={() => setOpenDropdown((current) => (current === "year" ? null : "year"))}
              onSelect={(value) => {
                updatePart("year", value);
                setOpenDropdown(null);
              }}
              styles={styles}
              colors={colors}
              compact
            />
          </View>
        </View>
        <View style={styles.hintRow}>
          <Ionicons name="information-circle-outline" size={15} color={colors.muted3} />
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.inputHint}>{t("help.status.caseHint")}</Text>
        </View>
      </View>

      <View style={styles.orDivider}>
        <View style={styles.orLine} />
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.orText}>{t("help.status.or")}</Text>
        <View style={styles.orLine} />
      </View>

      <View style={styles.visaBlock}>
        <View style={styles.visaLabelRow}>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.visaLabel}>{t("help.status.visaLabel")}</Text>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.visaLabelGloss}>{t("help.status.visaGloss")}</Text>
        </View>
        <TextInput
          value={caseParts.visaNumber}
          onChangeText={(value) => {
            setOpenDropdown(null);
            updatePart("visaNumber", value.trimStart().toUpperCase());
          }}
          onFocus={() => setFocused("visa")}
          onBlur={() => setFocused((current) => (current === "visa" ? null : current))}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={canSubmit ? submit : undefined}
          placeholder={t("help.status.visaPlaceholder")}
          placeholderTextColor={colors.muted3}
          maxFontSizeMultiplier={HELP_TEXT_SCALE}
          style={[styles.visaInput, focused === "visa" && styles.visaInputFocused]}
        />
      </View>

      <PrimaryButton
        icon="search-outline"
        label={submitting ? t("help.status.checking") : t("help.status.checkButton")}
        disabled={!canSubmit}
        loading={submitting}
        onPress={submit}
        styles={styles}
        colors={colors}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/scan/new")}
        style={({ pressed }) => [styles.scanPrompt, pressed && styles.pressed]}
      >
        <View style={styles.scanPromptIcon}>
          <Ionicons name="scan-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.scanPromptBody}>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.scanPromptTitle}>{t("help.status.scanUnknownTitle")}</Text>
          <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.scanPromptText}>{t("help.status.scanUnknownSubtitle")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={21} color={colors.muted3} />
      </Pressable>

      <View style={styles.privacyNote}>
        <Ionicons name="information-circle-outline" size={18} color={colors.muted3} />
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.privacyText}>{t("help.status.privacyNote")}</Text>
      </View>
    </>
  );
}

function CaseDropdown({
  label,
  value,
  placeholder,
  options,
  open,
  onToggle,
  onSelect,
  styles,
  colors,
  compact,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: readonly string[];
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
  compact?: boolean;
}) {
  return (
    <View style={[styles.dropdownWrap, compact && styles.dropdownWrapCompact, open && styles.dropdownWrapOpen]}>
      <Pressable
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [
          styles.caseField,
          styles.caseDropdown,
          open && styles.caseFieldFocused,
          pressed && styles.pressed,
        ]}
      >
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} numberOfLines={1} style={styles.caseFieldLabel}>
          {label}
        </Text>
        <View style={styles.dropdownValueRow}>
          <Text
            maxFontSizeMultiplier={HELP_TEXT_SCALE}
            numberOfLines={1}
            style={[styles.dropdownValue, !value && styles.dropdownPlaceholder]}
          >
            {value || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.muted2} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.dropdownMenu}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const active = option === value;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => onSelect(option)}
                  style={({ pressed }) => [
                    styles.dropdownOption,
                    active && styles.dropdownOptionActive,
                    pressed && styles.dropdownOptionPressed,
                  ]}
                >
                  <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.dropdownOptionText}>{option}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function StatusResultView({
  caseNumber,
  result,
  onEdit,
  styles,
}: {
  caseNumber: string;
  result: OampStatusResponse;
  onEdit: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const status = toOampStatus(resolveDisplayStatus(result));
  const cisloJednaci = result.query || caseNumber;

  return (
    <>
      <CaseNumberStrip caseNumber={caseNumber} onEdit={onEdit} styles={styles} />
      <OampStatusResultBody
        cisloJednaci={cisloJednaci}
        onEdit={onEdit}
        onRescan={() => router.push("/scan/new")}
        status={status}
      />
    </>
  );
}

function toOampStatus(status: OampStatusResponse["status"]): OampStatus {
  if (status === "approved") return "schvaleno";
  if (status === "rejected") return "zamitnuto";
  if (status === "not_found") return "not_found";
  if (status === "unknown") return "error";
  return "probiha";
}

function CaseNumberStrip({ caseNumber, onEdit, styles }: {
  caseNumber: string;
  onEdit: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const label = caseNumber.trim().toUpperCase().startsWith("OAM")
    ? t("help.status.caseLabel")
    : t("help.status.visaLabel");
  return (
    <View style={styles.caseStrip}>
      <View style={styles.caseStripText}>
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.caseStripLabel}>{label}</Text>
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} selectable style={styles.caseStripValue}>{caseNumber.trim()}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("help.status.edit")}
        onPress={onEdit}
        style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
      >
        <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={styles.editButtonText}>{t("help.status.edit")}</Text>
      </Pressable>
    </View>
  );
}

function resolveDisplayStatus(result: OampStatusResponse): OampStatusResponse["status"] {
  const message = normalizeStatusMessage(result.message);
  if (message.includes("nebylo nalezeno") || message.includes("nebyl") || message.includes("nenalezen")) {
    return "not_found";
  }
  if (message.includes("not found")) return "not_found";
  if (message.includes("kladn")) return "approved";
  if (message.includes("preliminarily assessed positively")) return "approved";
  if (
    message.includes("nepovol")
    || message.includes("zamit")
    || message.includes("nevyhov")
    || message.includes("zastavil")
    || message.includes("rejected")
    || message.includes("have been closed")
  ) {
    return "rejected";
  }
  if (message.includes("zpracovava se") || message.includes("v rizeni") || message.includes("being processed")) return "processing";
  return result.status;
}

function normalizeStatusMessage(message: string): string {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function PrimaryButton({ label, onPress, styles, colors, disabled, icon, loading }: {
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
  disabled?: boolean;
  icon?: IoniconName;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && !loading && styles.primaryButtonDisabled,
        pressed && !disabled && styles.primaryPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.textOnAccent} />
      ) : icon ? (
        <Ionicons name={icon} size={20} color={disabled ? colors.muted2 : colors.textOnAccent} />
      ) : null}
      <Text maxFontSizeMultiplier={HELP_TEXT_SCALE} style={[styles.primaryText, disabled && !loading && styles.primaryTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function buildCaseNumber(parts: CaseParts) {
  const sequence = parts.sequence.trim();
  const type = parts.type.trim();
  const year = parts.year.trim();
  if (!sequence || !type || !year) return "";
  const optional = parts.optional.trim().toUpperCase();
  return `OAM-${sequence}${optional ? `-${optional}` : ""}/${type}-${year}`;
}

function parseCaseNumber(value: string): Partial<CaseParts> | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "").replace(/^0AM/, "OAM");
  const match = normalized.match(/^OAM-?(\d{1,5})(?:-?([A-Z0-9]{1,2}))?\/?([A-Z]{2})?-?(\d{4})?$/);
  if (!match) return null;
  const [, sequence, optional = "", type = "", year = ""] = match;
  const parsedType = CASE_TYPES.includes(type as CaseType) ? (type as CaseType) : "";
  return {
    sequence,
    optional,
    type: parsedType,
    year,
  };
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    topBar: {
      minHeight: 50,
      paddingHorizontal: 12,
      paddingTop: 5,
      paddingBottom: 5,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg,
    },
    backLink: {
      width: 44,
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
    },
    topTitle: { flex: 1, marginHorizontal: 6, textAlign: "center", color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.headline },
    topSpacer: { width: 44 },
    keyboard: { flex: 1 },
    pressed: { opacity: 0.72 },
    scroll: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: 18, paddingBottom: 44 },
    inputContent: { paddingTop: 14, gap: 20 },
    resultContent: { paddingTop: 10, gap: 18 },
    intro: { gap: 8 },
    formTitle: { color: colors.text, fontFamily: fonts.displayBold, ...typeStyles.title1 },
    formSubtitle: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.callout },
    fieldBlock: { gap: 10, zIndex: 4 },
    // Mixed-case label per design; section-style emphasis comes from font weight, not from
    // uppercase + letterSpacing as in other screens.
    inputLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
    },
    caseFormCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 8,
      zIndex: 4,
    },
    caseFormRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 7,
      zIndex: 2,
    },
    caseDropdownRow: { zIndex: 8 },
    caseField: {
      minHeight: 56,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bg,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 5,
      gap: 2,
    },
    // ONLY borderColor changes on focus. Do NOT toggle elevation/shadow here:
    // on Android, adding elevation to the View that wraps a focused EditText
    // forces RN to re-back the native view, which detaches/reattaches the
    // EditText and instantly dismisses the keyboard. Border-color-only is a
    // pure paint change with no native view churn.
    caseFieldFocused: {
      borderColor: colors.primary,
    },
    casePrefixField: {
      width: 84,
      backgroundColor: colors.surface2,
    },
    caseNumberField: { flex: 1 },
    caseOptionalField: { width: 82 },
    caseFieldLabel: {
      color: colors.muted3,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.caption1,
    },
    casePrefixValue: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.title3,
      fontVariant: ["tabular-nums"],
    },
    caseInlineInput: {
      minHeight: 26,
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.title3,
      padding: 0,
      fontVariant: ["tabular-nums"],
    },
    dropdownWrap: { flex: 1, position: "relative", zIndex: 20 },
    dropdownWrapCompact: { flex: 0.82 },
    dropdownWrapOpen: { zIndex: 40 },
    caseDropdown: {
      // The dropdown is a Pressable wearing the same base style as caseField.
      // No extra styling needed here beyond what caseField provides.
    },
    dropdownValueRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    dropdownValue: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.title3,
      fontVariant: ["tabular-nums"],
    },
    dropdownPlaceholder: { color: colors.muted3, fontFamily: fonts.bodyMedium },
    dropdownMenu: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 60,
      maxHeight: 288,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 18,
      elevation: 12,
      zIndex: 50,
    },
    dropdownOption: {
      minHeight: 42,
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    dropdownOptionActive: { backgroundColor: colors.blueSoft },
    dropdownOptionPressed: { backgroundColor: colors.surface3 },
    dropdownOptionText: {
      color: colors.text,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.callout,
    },
    hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
    inputHint: { flex: 1, color: colors.muted3, fontFamily: fonts.body, ...typeStyles.footnote },
    orDivider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginTop: -2,
    },
    orLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSoft,
    },
    orText: {
      color: colors.muted2,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.footnote,
      textTransform: "lowercase",
    },
    visaBlock: { gap: 9, zIndex: 1, marginTop: -1 },
    visaLabelRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
    // Same mixed-case treatment as the case label.
    visaLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
    },
    // Czech term shown as a small inline gloss next to the localized label.
    visaLabelGloss: {
      color: colors.muted3,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.footnote,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    visaInput: {
      minHeight: 56,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      color: colors.text,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.headline,
      paddingHorizontal: 13,
    },
    // Border-color-only focus — see caseFieldFocused for why no elevation/shadow.
    visaInputFocused: {
      borderColor: colors.primary,
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 11,
      paddingHorizontal: 18,
    },
    primaryPressed: { opacity: 0.86 },
    primaryButtonDisabled: {
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    primaryText: { color: colors.textOnAccent, fontFamily: fonts.bodyBold, ...typeStyles.button },
    primaryTextDisabled: { color: colors.muted2 },
    errorBox: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.dangerLight,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      paddingHorizontal: 13,
      paddingVertical: 12,
    },
    errorText: {
      flex: 1,
      color: colors.danger,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.footnote,
    },
    scanPrompt: {
      minHeight: 86,
      marginTop: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
    },
    scanPromptIcon: {
      width: 46,
      height: 46,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.blueSoft,
    },
    scanPromptBody: { flex: 1, minWidth: 0, gap: 2 },
    scanPromptTitle: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.callout },
    scanPromptText: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.subhead },
    privacyNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 8 },
    privacyText: { flex: 1, color: colors.muted3, fontFamily: fonts.body, ...typeStyles.footnote },
    caseStrip: {
      minHeight: 62,
      borderRadius: 18,
      backgroundColor: colors.surface2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    caseStripText: { flex: 1, minWidth: 0, gap: 2 },
    caseStripLabel: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    caseStripValue: { color: colors.text, fontFamily: fonts.bodyMedium, ...typeStyles.callout, fontVariant: ["tabular-nums"] },
    editButton: { minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
    editButtonText: { color: colors.primary, fontFamily: fonts.bodyMedium, ...typeStyles.callout },
    heroCard: {
      minHeight: 188,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 13,
      paddingHorizontal: 22,
      paddingVertical: 24,
    },
    heroNeutral: { backgroundColor: colors.surface, borderColor: colors.borderSoft },
    heroGreen: { backgroundColor: colors.greenLight, borderColor: colors.green },
    heroAmber: { backgroundColor: colors.warningBg, borderColor: colors.amberDark },
    heroRed: { backgroundColor: colors.dangerLight, borderColor: colors.danger },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconNeutral: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    heroIconGreen: { backgroundColor: colors.green },
    heroIconAmber: { backgroundColor: colors.amber },
    heroIconRed: { backgroundColor: colors.danger },
    heroTitle: { color: colors.text, fontFamily: fonts.displayBold, ...typeStyles.title1, textAlign: "center" },
    heroBody: { color: colors.muted, fontFamily: fonts.body, ...typeStyles.callout, textAlign: "center" },
    infoPanel: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.primaryDark,
      backgroundColor: colors.blueSoft,
      padding: 18,
      gap: 9,
    },
    panelTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    infoTitle: { color: colors.primary, fontFamily: fonts.bodyBold, ...typeStyles.callout },
    infoBody: { color: colors.muted, fontFamily: fonts.body, ...typeStyles.callout, paddingLeft: 29 },
    sectionTitle: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      letterSpacing: 2.4,
      textTransform: "uppercase",
      marginTop: -2,
    },
    listCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    listRow: {
      minHeight: 62,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    listRowLast: { borderBottomWidth: 0 },
    bullet: { color: colors.muted3, fontFamily: fonts.bodyBold, ...typeStyles.title3 },
    listText: { flex: 1, color: colors.muted, fontFamily: fonts.body, ...typeStyles.callout },
    numberBubble: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.greenLight,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    numberText: { color: colors.greenDark, fontFamily: fonts.bodyBold, ...typeStyles.rowMeta },
    detailCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    detailRow: {
      minHeight: 54,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
      paddingHorizontal: 16,
    },
    detailRowLast: { borderBottomWidth: 0 },
    detailLabel: { flex: 1, color: colors.muted2, fontFamily: fonts.body, ...typeStyles.callout },
    detailValue: { color: colors.text, fontFamily: fonts.bodyMedium, ...typeStyles.callout, textAlign: "right" },
    sourceLink: {
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 14,
    },
    sourceLinkText: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
    },
    warningPanel: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.amberDark,
      backgroundColor: colors.warningBg,
      padding: 18,
      gap: 8,
    },
    warningTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    warningTitle: { color: colors.amberDark, fontFamily: fonts.bodyBold, ...typeStyles.callout },
    warningBody: { color: colors.muted, fontFamily: fonts.body, ...typeStyles.callout, paddingLeft: 31 },
    textLink: { minHeight: 42, alignItems: "center", justifyContent: "center" },
    textLinkText: { color: colors.primary, fontFamily: fonts.bodyMedium, ...typeStyles.callout },
  });
}
