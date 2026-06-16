import { StyleSheet } from "react-native";
import { fonts, typeStyles } from "@/components/ui";
import type { ColorPalette } from "@/components/ui";
import { DEADLINE_ROW_RADIUS, SWIPE_LEFT_ACTION_WIDTH, SWIPE_LEFT_WIDTH, SWIPE_RIGHT_WIDTH } from "@/features/deadlines/components/deadlinesData";

export function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 18,
      backgroundColor: colors.bg,
      gap: 14
    },
    headerTitleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    screenTitle: {
      color: colors.primaryDark,
      fontFamily: fonts.displayBold,
      ...typeStyles.largeScreenTitle,
      fontWeight: "800",
      letterSpacing: -1
    },
    headerIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center"
    },
    headerIconText: {
      color: colors.muted,
      fontSize: 26,
      lineHeight: 28,
      fontWeight: "400"
    },
    urgencyRow: {
      flexDirection: "row",
      gap: 18,
      flexWrap: "wrap",
    },
    urgencyChip: { flexDirection: "row", alignItems: "center", gap: 6 },
    urgencyDot: { width: 7, height: 7, borderRadius: 4 },
    urgencyChipText: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowMeta },
    urgencyChipCount: { color: colors.text, fontWeight: "700" },
    heading: { color: colors.text, fontFamily: fonts.displayBold, ...typeStyles.screenTitle, fontWeight: "800" },
    scroll: {
      flex: 1,
      backgroundColor: colors.bg
    },
    list: {
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 100,
      gap: 24
    },
    emptyList: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: colors.bg },
    section: { gap: 12, backgroundColor: colors.bg },
    sectionCards: { gap: 12 },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionTitle: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase" as const,
    },
    sectionCount: {
      minWidth: 24,
      height: 22,
      paddingHorizontal: 8,
      borderRadius: 11,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionCountText: {
      color: colors.muted2,
      fontFamily: fonts.bodyBold,
      ...typeStyles.caption1,
      fontWeight: "700",
    },
    completedSection: { gap: 12 },
    clearCompletedButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      alignSelf: "center",
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: colors.dangerLight,
    },
    clearCompletedText: {
      color: colors.danger,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "600",
    },
    completedToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    completedToggleRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    completedGroups: { gap: 22 },
    completedGroup: { gap: 10 },
    completedMonthTitle: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
      paddingHorizontal: 4,
    },
    // Outer wrapper clips the action layer + card to the same radius so
    // nothing peeks past the rounded corners. Background transparent —
    // any color underneath would bleed through translucent rgba action tints.
    rowShell: {
      minHeight: 96,
      borderRadius: DEADLINE_ROW_RADIUS,
      overflow: "hidden",
      backgroundColor: "transparent"
    },
    rowShellCompleted: { minHeight: 86 },
    // Undo snackbar shown after a swipe-to-delete (floats above the tab bar).
    undoBar: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 18,
      alignItems: "center",
    },
    undoCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      alignSelf: "stretch",
      maxWidth: 460,
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 8,
      borderRadius: 14,
      backgroundColor: colors.surface3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
    undoText: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowSecondary,
    },
    undoButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    undoButtonText: {
      color: colors.primary,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
    },
    // Underlay holding the action buttons. Buttons sit at flex-start (done)
    // and flex-end (edit/delete); the visible middle band is intentionally
    // covered by the card itself, so transparent here means no bg-color
    // hairline ever shows on rounded corners.
    swipeActionLayer: {
      ...StyleSheet.absoluteFillObject,
      minHeight: 96,
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "space-between",
      backgroundColor: "transparent"
    },
    // Soft tinted backgrounds matching the urgency date-tile aesthetic.
    // Auto-adapts per theme: in dark mode the *Light tokens are rgba ~12%
    // (subtle); in light mode they're solid pale colors. Card on top is
    // fully opaque (surface) so there's no actual bleed-through — the soft
    // tints only show in the revealed area after swipe.
    swipeDoneArea: {
      width: SWIPE_RIGHT_WIDTH,
      height: "100%",
      minHeight: 96,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.greenLight,
    },
    swipeLeftActions: {
      width: SWIPE_LEFT_WIDTH,
      height: "100%",
      minHeight: 96,
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "flex-end",
      backgroundColor: "transparent",
    },
    // Completed cards only reveal the delete action (single button, half width).
    swipeLeftActionsCompact: { width: SWIPE_LEFT_ACTION_WIDTH },
    swipeDonePlaceholder: { width: 0, height: "100%" },
    swipeEditArea: {
      width: SWIPE_LEFT_ACTION_WIDTH,
      height: "100%",
      minHeight: 96,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.blueSoft,
    },
    swipeDeleteArea: {
      width: SWIPE_LEFT_ACTION_WIDTH,
      height: "100%",
      minHeight: 96,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerLight,
    },
    // White-on-color contrast for solid action button backgrounds.
    swipeDoneText: {
      color: colors.textOnAccent,
      fontSize: 30,
      lineHeight: 32,
      fontWeight: "900"
    },
    swipeEditText: {
      color: colors.textOnAccent,
      fontSize: 27,
      lineHeight: 29,
      fontWeight: "900"
    },
    swipeDeleteText: {
      color: colors.textOnAccent,
      fontSize: 34,
      lineHeight: 34,
      fontWeight: "900"
    },
    // Animated wrapper that slides the card. Transparent — the inner
    // `deadline` View carries `colors.surface`. If we set bg here it would
    // form a 1-2px halo on the rounded corners when translateX moves it
    // over the action layer (the underlay tint would bleed at the curve).
    swipeCard: {
      borderRadius: DEADLINE_ROW_RADIUS,
      overflow: "hidden",
      // Solid surface so the action layer behind doesn't bleed through
      // when the inner card has `opacity: 0.62` (completed deadlines).
      backgroundColor: colors.surface,
    },
    // When swiping the card sits flush against the action buttons —
    // zero the corners so there's no visible rounded gap between them.
    // The outer rowShell still clips the row's outer perimeter to the
    // full radius, so the row's outline stays rounded.
    swipeCardActive: { borderRadius: 0 },
    // Card: solid surface, hairline border, generous corner radius.
    // flex-row so the date tile sits left of the body.
    deadline: {
      flexDirection: "row",
      alignItems: "stretch",
      minHeight: 96,
      borderRadius: DEADLINE_ROW_RADIUS,
      backgroundColor: colors.surface,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 12,
      gap: 14,
    },
    // Same logic as swipeCardActive: inner card squares off when actively
    // swiping; the rowShell clips the outer silhouette to the row radius.
    deadlineSwiping: { borderRadius: 0 },
    deadlineDone: { opacity: 0.62 },
    deadlineCompleted: {
      minHeight: 86,
      paddingVertical: 10,
    },
    // Square date tile on the left — urgency-tinted background.
    dateTile: {
      width: 60,
      minHeight: 72,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      gap: 2,
    },
    dateTileCompleted: {
      width: 52,
      minHeight: 56,
      borderRadius: 12,
    },
    dateTileDay: {
      fontFamily: fonts.displayBold,
      fontSize: 26,
      lineHeight: 30,
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    dateTileMonth: {
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
      opacity: 0.85,
    },
    deadlineBody: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      gap: 4,
    },
    relativeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    completedMetaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    completedMetaText: {
      color: colors.muted2,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowMeta,
      fontWeight: "700",
      letterSpacing: -0.1,
    },
    relativeText: {
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
      letterSpacing: -0.1,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
      fontWeight: "600",
      letterSpacing: -0.25,
      minWidth: 0,
    },
    titleDone: { textDecorationLine: "line-through" as const, color: colors.muted2 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    metaText: {
      flex: 1,
      color: colors.muted3,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
      minWidth: 0,
    },
    metaTextManual: { marginTop: 2 },
    descriptionDone: { color: colors.muted3 },

    // ── Long-press context menu (Screenshot 3 style) ─────────────────
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    menuContainer: {
      position: "absolute",
      backgroundColor: colors.surface2,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 20,
      elevation: 12,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    menuRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuRowPressed: { backgroundColor: colors.surface3 },
    menuIconTile: {
      width: 32,
      height: 32,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    menuLabel: { fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500", flex: 1 },

    manualDetailBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.62)",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingBottom: 28,
    },
    manualDetailCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 18,
      gap: 16,
      // Cap height so very long descriptions don't push the header (title +
      // close button) off the top of the screen. Middle content scrolls.
      maxHeight: "85%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.42,
      shadowRadius: 28,
      elevation: 18,
    },
    manualDetailScroll: {
      flexShrink: 1,
    },
    manualDetailScrollContent: {
      gap: 16,
    },
    manualDetailHandle: {
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.muted3,
      opacity: 0.45,
      alignSelf: "center",
      marginBottom: 4,
    },
    manualDetailTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
    },
    manualDetailDateTile: {
      width: 72,
      minHeight: 84,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      gap: 3,
    },
    manualDetailDateDay: {
      fontFamily: fonts.displayBold,
      fontSize: typeStyles.largeTitle.fontSize,
      lineHeight: 38,
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    manualDetailDateMonth: {
      fontFamily: fonts.bodyExtraBold,
      fontSize: 14,
      lineHeight: 17,
      fontWeight: "800",
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
    },
    manualDetailTitleBlock: {
      flex: 1,
      minWidth: 0,
      gap: 6,
      paddingTop: 2,
    },
    manualDetailRelativePill: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 2,
    },
    manualDetailRelative: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.rowMeta,
      fontWeight: "800",
    },
    manualDetailTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "800",
      letterSpacing: -0.35,
    },
    manualDetailClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    manualDetailDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    manualDetailSection: {
      gap: 10,
    },
    manualDetailLabel: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption2,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
    },
    manualDetailValue: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.callout,
      fontWeight: "600",
    },
    manualDetailMuted: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    manualReminderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
    },
    manualReminderIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: colors.blueSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    manualReminderTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    manualTypeChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 10,
      minHeight: 42,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
    },
    manualTypeIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    manualTypeIconText: {
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.caption1,
      fontWeight: "800",
    },
    manualTypeChipText: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
      fontWeight: "700",
    },
    manualAddedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingTop: 2,
    },
    manualDetailActions: {
      gap: 10,
    },
    manualDetailActionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginHorizontal: -18,
    },
    manualDoneButton: {
      minHeight: 50,
      borderRadius: 15,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    manualDoneText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
      fontWeight: "700",
    },
    manualSecondaryActions: {
      flexDirection: "row",
      gap: 10,
    },
    manualSecondaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    manualEditText: {
      color: colors.primary,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
      fontWeight: "700",
    },
    manualDeleteText: {
      color: colors.danger,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowSecondary,
      fontWeight: "700",
    },

    deleteBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
      paddingBottom: 32,
      paddingHorizontal: 16,
    },
    deleteCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
    },
    deletePreview: { flexDirection: "row", gap: 12, alignItems: "center" },
    deletePreviewText: { flex: 1, gap: 2 },
    deletePreviewTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, ...typeStyles.callout, fontWeight: "600" },
    deletePreviewMeta: { color: colors.muted3, fontFamily: fonts.body, ...typeStyles.rowMeta },
    deleteDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
    deleteQuestion: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.rowTitle, fontWeight: "700", letterSpacing: -0.25, marginTop: 6 },
    deleteHint: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.rowMeta, marginBottom: 8 },
    deleteConfirmButton: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.danger, alignItems: "center", justifyContent: "center" },
    deleteConfirmText: { color: colors.danger, fontFamily: fonts.bodySemiBold, ...typeStyles.callout, fontWeight: "600" },
    deleteCancelButton: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 2 },
    deleteCancelText: { color: colors.muted2, fontFamily: fonts.body, ...typeStyles.callout, fontWeight: "400" },
    modal: { padding: 20, gap: 12, backgroundColor: colors.bg, paddingBottom: 48 },

    // ── ManualDeadlineModal — bottom sheet ───────────────────────────
    sheetBackdrop: {
      flex: 1,
      // Deeper dim so the tab bar underneath doesn't show through the area
      // between the rounded top of the sheet and the status bar.
      backgroundColor: "rgba(0,0,0,0.72)",
      justifyContent: "flex-end",
    },
    sheetKAV: {
      // Flex-end so the sheet hugs the bottom even when KAV is active.
      width: "100%",
      justifyContent: "flex-end",
    },
    sheetContainer: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      // Cap to leave space for the status bar but give as much room as
      // possible — the calendar + note both need to fit.
      maxHeight: "95%",
      // Footer carries the safe-area inset, container pins to screen bottom.
    },
    sheetHandle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.muted3,
      opacity: 0.5,
      marginTop: 10,
      marginBottom: 8,
    },
    sheetScrollContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 8,
      gap: 18,
    },
    sheetHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.compactTitle,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    sheetTitleInputWrap: {
      borderRadius: 14,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      minHeight: 52,
      justifyContent: "center",
    },
    sheetTitleInput: {
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.input,
      paddingVertical: 12,
    },
    sheetSectionLabel: {
      color: colors.muted3,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase" as const,
      marginTop: 4,
      marginBottom: -4,
    },
    chipRow: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
    },
    // Two-line chip block: label on top, resolved date below. Equal width so
    // the row fits 4 chips comfortably on iPhone widths.
    chipBlock: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,           // let chips shrink fully so 4 fit on iPhone width
      paddingVertical: 12,
      paddingHorizontal: 6,  // tighter padding gives text more breathing room
      borderRadius: 14,
      backgroundColor: colors.surface2,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      gap: 2,
    },
    chipBlockActive: {
      borderColor: colors.primary,
      backgroundColor: colors.blueSoft,
    },
    chipLabel: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    chipLabelActive: { color: colors.primary },
    chipSubLabel: {
      color: colors.muted2,
      fontFamily: fonts.bodyMedium,
      ...typeStyles.caption2,
      fontWeight: "500",
    },
    chipSubLabelActive: { color: colors.primary, opacity: 0.85 },
    sheetCalendarAnimated: { overflow: "hidden", marginTop: -4 },
    sheetCalendarWrap: {},

    // Reminder toggle row
    reminderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingLeft: 14,
      paddingRight: 14,
      borderRadius: 14,
      backgroundColor: colors.surface2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
    },
    reminderPickerTrigger: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 2,
    },
    reminderIconTile: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: colors.surface3,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderTextBlock: { flex: 1, minWidth: 0, gap: 2 },
    reminderTitle: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowSecondary,
      fontWeight: "600",
    },
    reminderSubtitle: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    reminderSwitchWrap: {
      width: 58,
      flexShrink: 0,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    reminderSwitch: { flexShrink: 0 },
    reminderPickerBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      backgroundColor: "rgba(0,0,0,0.22)",
    },
    reminderPickerCard: {
      width: "100%",
      maxWidth: 360,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.32,
      shadowRadius: 26,
    },
    reminderPickerHeader: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    reminderPickerTitle: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.bodyBold,
      ...typeStyles.rowTitle,
      fontWeight: "700",
    },
    reminderPickerClose: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderPickerOptions: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
    },
    reminderPickerOption: {
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.surface2,
    },
    reminderPickerOptionDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    reminderPickerCheck: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    reminderPickerCheckSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    reminderPickerOptionText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    reminderPickerOptionTitle: {
      color: colors.text,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowSecondary,
      fontWeight: "600",
    },
    reminderPickerOptionDate: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowMeta,
    },
    reminderPickerEmpty: {
      color: colors.muted2,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      padding: 14,
      backgroundColor: colors.surface2,
    },
    reminderPickerDone: {
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderPickerDoneText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
    },

    // Note field at bottom
    sheetNoteWrap: {
      borderRadius: 14,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 56,
    },
    sheetNoteInput: {
      color: colors.text,
      fontFamily: fonts.body,
      ...typeStyles.rowSecondary,
      paddingVertical: 4,
      textAlignVertical: "top" as const,
    },

    sheetPrimaryButton: { marginTop: 4 },
    sheetFooter: {
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: colors.surface,
    },

    // ── (legacy full-screen variant — kept for the editing flow if needed) ──
    modalHeader: {
      paddingHorizontal: 22,
      paddingTop: 8,
      paddingBottom: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    modalTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      ...typeStyles.compactTitle,
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    modalCloseButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    modalBody: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 24,
      gap: 22,
    },
    modalSection: { gap: 10 },
    modalLabel: {
      color: colors.muted2,
      fontFamily: fonts.bodyExtraBold,
      ...typeStyles.sectionHeader,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
    },
    presetRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
    presetChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    presetChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    presetChipText: {
      color: colors.muted,
      fontFamily: fonts.bodySemiBold,
      ...typeStyles.rowMeta,
      fontWeight: "600",
    },
    presetChipTextActive: { color: colors.textOnAccent },
    modalFooter: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
    },
    modalPrimaryButton: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    modalPrimaryButtonDisabled: { opacity: 0.45 },
    modalPrimaryText: {
      color: colors.textOnAccent,
      fontFamily: fonts.bodyBold,
      ...typeStyles.callout,
      fontWeight: "700",
    },

    calWrap: { backgroundColor: colors.surface2, borderRadius: 14, padding: 12, gap: 8 },
    calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 4 },
    calNav: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    calNavText: { color: colors.text, fontSize: 22, fontWeight: "700", lineHeight: 24 },
    calMonth: { color: colors.text, fontFamily: fonts.bodyBold, ...typeStyles.callout, fontWeight: "700", textTransform: "capitalize" },
    calWeekRow: { flexDirection: "row" },
    calWeekday: { flex: 1, textAlign: "center", color: colors.muted2, fontFamily: fonts.bodySemiBold, ...typeStyles.caption1, fontWeight: "600", textTransform: "uppercase", paddingVertical: 6 },
    calGrid: { gap: 4 },
    calGridRow: { flexDirection: "row" },
    calCell: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", padding: 2 },
    calDay: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    calDaySelected: { backgroundColor: colors.primary },
    calDayToday: { borderWidth: 1.5, borderColor: colors.primary },
    calDayText: { color: colors.text, fontFamily: fonts.bodyMedium, ...typeStyles.rowSecondary, fontWeight: "500" },
    calDayTextSelected: { color: colors.textOnAccent, fontWeight: "800" },
    calDayPast: { color: colors.muted3 },
    pressed: { opacity: 0.72 },
    // Card press state: subtle scale, NO opacity. Opacity here would expose
    // the colored swipe-action layer (green/blue/red) sitting under the card
    // through the card's translucent body — looks like a coloured halo.
    cardPressed: { transform: [{ scale: 0.985 }] },
  });
}

export type DeadlinesStyles = ReturnType<typeof createStyles>;
