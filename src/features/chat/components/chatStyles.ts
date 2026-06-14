import { Platform, StyleSheet } from "react-native";
import { fonts, typeStyles } from "@/components/ui";
import type { ColorPalette } from "@/components/ui";
import { attachmentKind, reminderOptionTitle, reminderSheetTitle } from "@/features/chat/components/chatData";

export function createStyles(colors: ColorPalette) {
  const isDark = colors.bg === "#0F0D0B";

  return StyleSheet.create({
    wrap: { flex: 1 },
    list: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    pendingScroll: { flex: 1 },
    pendingWrap: {
      flexGrow: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 16,
      gap: 14
    },
    pendingResultCard: {
      alignSelf: "flex-start",
      width: "92%",
      borderTopLeftRadius: 6,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14,
      gap: 14
    },
    pendingSkeletonHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    pendingSkeletonIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.blueSoft
    },
    pendingSkeletonTitleLines: { flex: 1, gap: 8, paddingTop: 2 },
    pendingSkeletonSection: { gap: 8 },
    pendingProgressBlock: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: 12,
      marginTop: 2,
      gap: 10
    },
    pendingProgressTitle: {
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      letterSpacing: 2,
      textTransform: "uppercase"
    },
    pendingSteps: { gap: 8 },
    pendingStepRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    pendingStepIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center"
    },
    pendingStepIconDone: { backgroundColor: colors.greenLight },
    pendingStepIconActive: {
      backgroundColor: "transparent",
      borderWidth: 0,
      borderColor: "transparent"
    },
    pendingStepCheck: {
      color: colors.greenDark,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
    },
    pendingStepDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.muted3
    },
    pendingStepText: {
      flex: 1,
      minWidth: 0,
      color: colors.muted3,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.rowMeta,
    },
    pendingStepTextDone: { color: colors.muted2 },
    pendingStepTextActive: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold
    },
    pendingProgressHint: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.caption1,
      paddingTop: 2
    },
    pendingErrorBubble: {
      alignSelf: "flex-start",
      width: "92%",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.dangerDark,
      backgroundColor: colors.dangerLight,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    pendingErrorText: {
      color: colors.dangerDeep,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
    },
    messages: {
      flexGrow: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
      gap: 12
    },
    resultCard: {
      alignSelf: "flex-start",
      maxWidth: "92%",
      borderTopLeftRadius: 6,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 18,
      gap: 10,
      shadowColor: "#1E1B17",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1
    },
    resultHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    resultIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.blueSoft,
      alignItems: "center",
      justifyContent: "center"
    },
    resultIconText: { color: colors.primary, fontFamily: fonts.bodyExtraBold, ...typeStyles.caption2, fontWeight: "900" },
    resultHeaderText: { flex: 1, gap: 4 },
    docKind: {
      alignSelf: "flex-start",
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase"
    },
    docFrom: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowMeta },
    urgencyPill: {
      alignSelf: "flex-start",
      borderRadius: 999,
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "800"
    },
    resultTitle: { color: colors.text, fontFamily: fonts.displayBold, ...typeStyles.compactTitle, fontWeight: "700" },
    resultSummary: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowSecondary },
    sectionTitle: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1.6
    },
    actionRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    actionIndex: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.blue100,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1
    },
    actionIndexText: { color: colors.primary, fontFamily: fonts.bodyBold, ...typeStyles.caption1, fontWeight: "700" },
    resultLine: { flex: 1, color: colors.text, fontFamily: fonts.body, ...typeStyles.rowSecondary },
    deadlineCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.blueMid,
      padding: 14,
    },
    deadlineCardLabel: {
      color: colors.primary,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "700",
      letterSpacing: 1.54,
      textTransform: "uppercase",
    },
    deadlineCardDate: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: 26,
      fontWeight: "600",
      letterSpacing: -0.52,
      marginTop: 6,
    },
    deadlineCardAddress: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      marginTop: 4,
    },
    deadlineCardPin: {
      color: colors.primary,
      fontSize: 11,
      lineHeight: 15,
    },
    deadlineCardAddressText: {
      flex: 1,
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    deadlineCardBtn: {
      marginTop: 12,
      height: 38,
      borderRadius: 10,
      backgroundColor: colors.primaryDark,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
    },
    deadlineCardBtnSaved: { backgroundColor: colors.greenLight },
    deadlineCardBtnText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    deadlineCardBtnTextSaved: { color: colors.greenDark },
    reminderOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: isDark ? "rgba(0,0,0,0.74)" : "rgba(30,27,23,0.45)",
    },
    reminderSheet: {
      maxHeight: "90%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: isDark ? 0.32 : 0.12,
      shadowRadius: 22,
      elevation: 12,
    },
    reminderHandleWrap: {
      alignItems: "center",
      paddingTop: 14,
      paddingBottom: 12,
    },
    reminderHandle: {
      width: 42,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: isDark ? "#6F675D" : "#C0B9AF",
    },
    reminderSheetContent: {
      paddingHorizontal: 22,
      gap: 16,
    },
    reminderSheetTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.compactTitle,
      fontWeight: "700",
    },
    reminderDueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: -4,
    },
    reminderTypePill: {
      minHeight: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.amber200,
      backgroundColor: colors.amberLight,
      paddingHorizontal: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderTypePillText: {
      color: colors.amberDark,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      letterSpacing: 0.9,
      fontWeight: "800",
    },
    reminderDueDate: {
      flex: 1,
      minWidth: 0,
      color: colors.muted,
      fontFamily: fonts.body,
      ...typeStyles.callout,
    },
    reminderSectionTitle: {
      color: colors.amberDark,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      letterSpacing: 1.8,
      textTransform: "uppercase",
    },
    reminderOptions: {
      gap: 0,
    },
    reminderNoOptionsText: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      paddingVertical: 12,
    },
    reminderOptionRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 9,
    },
    reminderOptionDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    reminderPressed: {
      opacity: 0.76,
    },
    reminderIconTile: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderIconTileLocked: {
      opacity: 0.46,
    },
    reminderOptionTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    reminderOptionTitle: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
    },
    reminderOptionTitleLocked: {
      color: colors.muted3,
      opacity: 0.7,
    },
    reminderOptionDate: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    reminderOptionDateLocked: {
      color: colors.muted3,
      opacity: 0.7,
    },
    reminderLockedBadge: {
      height: 26,
      minWidth: 60,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.proLight,
      backgroundColor: isDark ? "rgba(168,147,224,0.08)" : "rgba(124,58,237,0.05)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 8,
    },
    reminderLockedBadgeText: {
      color: colors.pro,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      fontWeight: "800",
    },
    reminderToggle: {
      width: 48,
      height: 28,
      borderRadius: 14,
      padding: 3,
      flexDirection: "row",
      alignItems: "center",
    },
    reminderToggleOn: {
      backgroundColor: colors.primaryMid,
    },
    reminderToggleOff: {
      backgroundColor: colors.surface2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    reminderToggleDisabled: {
      opacity: 0.55,
    },
    reminderToggleKnob: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.12 : 0.16,
      shadowRadius: 4,
      elevation: 3,
    },
    reminderProHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 2,
    },
    reminderProHintText: {
      flex: 1,
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
    },
    reminderErrorText: {
      color: colors.dangerDark,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
    },
    reminderCta: {
      minHeight: 52,
      borderRadius: 17,
      backgroundColor: colors.primaryMid,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    reminderCtaDisabled: {
      opacity: 0.5,
    },
    reminderCtaText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
      textAlign: "center",
    },
    reminderUpgradeButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    reminderUpgradeText: {
      color: colors.pro,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
    },
    placeLine: {
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.caption1,
      backgroundColor: colors.blueSoft,
      borderRadius: 8,
      padding: 9
    },
    penalty: {
      backgroundColor: colors.dangerLight,
      color: colors.dangerDeep,
      fontFamily: fonts.body,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      ...typeStyles.rowMeta,
    },
    verifyNote: {
      backgroundColor: colors.blueSoft,
      color: colors.primary,
      fontFamily: fonts.body,
      borderRadius: 10,
      padding: 10,
      ...typeStyles.caption1,
    },
    infoBlock: {
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6
    },
    infoBlockBlue: { backgroundColor: colors.blueSoft, borderColor: colors.blueMid },
    infoBlockAmber: { backgroundColor: colors.amberLight, borderColor: colors.amber },
    infoBlockNeutral: { backgroundColor: colors.surface2, borderColor: colors.border },
    infoBlockDanger: { backgroundColor: colors.dangerLight, borderColor: colors.dangerDark },
    infoBlockGreen: { backgroundColor: colors.greenLight, borderColor: colors.greenDark },
    infoBlockTitle: {
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      letterSpacing: 1.8,
      textTransform: "uppercase"
    },
    infoBlockTitleBlue: { color: colors.primary },
    infoBlockTitleAmber: { color: colors.amberDark },
    infoBlockTitleNeutral: { color: colors.muted2 },
    infoBlockTitleDanger: { color: colors.dangerDark },
    infoBlockTitleGreen: { color: colors.greenDark },
    infoBlockText: {
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    bubble: { maxWidth: "84%", paddingHorizontal: 12, paddingVertical: 10 },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: colors.primary,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 4
    },
    assistantBubble: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18
    },
    bubbleText: { color: colors.text, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
    userText: { color: colors.textOnAccent },
    messageColAssistant: { alignItems: "flex-start" },
    messageColUser: { alignItems: "flex-end" },
    messageCopyRow: { marginTop: 2, marginLeft: 2 },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    flex1: { flex: 1 },
    copyChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 7, borderRadius: 8 },
    copyChipText: { fontFamily: fonts.bodyBold, fontSize: 11.5, fontWeight: "600", letterSpacing: 0.2 },
    copyIconBtn: { padding: 5, borderRadius: 8 },
    copyPressed: { opacity: 0.5 },
    markdownBold: { fontFamily: fonts.bodyBold },
    markdownItalic: { fontStyle: "italic" },
    markdownCode: {
      color: colors.text,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
      fontSize: 12.5,
      lineHeight: 18,
      backgroundColor: colors.surface2,
      borderRadius: 4,
      paddingHorizontal: 3
    },
    markdownLink: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      textDecorationLine: "underline"
    },
    imageBubble: {
      alignSelf: "flex-end",
      width: 176,
      height: 236,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border
    },
    sentImage: {
      width: "100%",
      height: "100%"
    },
    imageCountBadge: {
      position: "absolute",
      right: 8,
      bottom: 8,
      minWidth: 34,
      height: 28,
      borderRadius: 14,
      paddingHorizontal: 9,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center"
    },
    imageCountText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      fontWeight: "800"
    },
    attachmentBubble: {
      alignSelf: "flex-end",
      maxWidth: "78%",
      minWidth: 164,
      borderRadius: 18,
      borderBottomRightRadius: 4,
      backgroundColor: colors.primary,
      padding: 12,
      gap: 5
    },
    attachmentKind: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      fontWeight: "900",
      letterSpacing: 0.4
    },
    attachmentName: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowMeta,
      fontWeight: "700"
    },
    attachmentMeta: {
      color: colors.textOnAccent,
      opacity: 0.78,
      fontFamily: fonts.bodyBold,
      ...typeStyles.caption1,
      fontWeight: "700"
    },
    footer: {
      paddingHorizontal: 28,
      paddingTop: 8,
      backgroundColor: colors.bg,
      gap: 8
    },
    composerPill: {
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 18,
      paddingRight: 6,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 }
    },
    composerInput: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 17,
      paddingVertical: 0
    },
    composerCounter: {
      color: colors.muted3,
      fontFamily: fonts.body,
      ...typeStyles.caption2,
      minWidth: 24,
      textAlign: "right"
    },
    lockedComposer: {
      gap: 8
    },
    lockedComposerLabel: {
      color: colors.muted3,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      paddingHorizontal: 2
    },
    lockedInputPill: {
      minHeight: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingLeft: 16,
      paddingRight: 8
    },
    lockGlyph: {
      width: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center"
    },
    lockShackle: {
      position: "absolute",
      top: 1,
      width: 12,
      height: 10,
      borderWidth: 1.6,
      borderBottomWidth: 0,
      borderColor: colors.muted3,
      borderTopLeftRadius: 7,
      borderTopRightRadius: 7
    },
    lockBody: {
      position: "absolute",
      bottom: 2,
      width: 15,
      height: 11,
      borderWidth: 1.6,
      borderColor: colors.muted3,
      borderRadius: 3
    },
    lockedInputText: {
      flex: 1,
      minWidth: 0,
      color: colors.muted2,
      fontFamily: fonts.body,
      fontSize: 15.5,
      lineHeight: 20
    },
    proBadge: {
      minWidth: 62,
      height: 34,
      paddingHorizontal: 14,
      borderRadius: 17,
      backgroundColor: colors.proLight,
      alignItems: "center",
      justifyContent: "center"
    },
    proBadgeText: {
      color: colors.pro,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      letterSpacing: 0.2
    }
  });
}

export type ChatStyles = ReturnType<typeof createStyles>;
