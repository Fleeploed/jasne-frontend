import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Text, View } from "react-native";
import type { DimensionValue } from "react-native";
import { SelectableText } from "@/components/SelectableText";
import type { ColorPalette } from "@/components/ui";
import { extractOampIdentifier } from "@/features/chat/oampIdentifier";
import { OampTrackingOffer } from "@/features/chat/OampTrackingOffer";
import { formatCategoryLabel, t } from "@/lib/i18n";
import type { DeadlineResponse, ScanResponse, UserPlan } from "@/lib/types";
import type { ChatStyles } from "@/features/chat/components/chatStyles";
import { deadlineDistance, formatDocTitle, pendingPipelineIndex, pendingPipelineSteps, urgencyPillColors } from "@/features/chat/components/chatData";
import { CopyButton } from "@/features/chat/components/CopyButton";
import { DeadlineReminderRow } from "@/features/chat/components/ReminderSheet";

export function ResultCard({ scan, plan, existingDeadlines, deadlinesReady, onReminderCreated, colors, styles }: { scan: ScanResponse; plan: UserPlan; existingDeadlines: DeadlineResponse[]; deadlinesReady: boolean; onReminderCreated: (created: DeadlineResponse) => void; colors: ColorPalette; styles: ChatStyles }) {
  const result = scan.result;
  // Detect a trackable OAMP číslo jednací in the document's OCR text so we can
  // offer one-tap automatic status tracking. Hooks inside OampTrackingOffer
  // only run when an identifier is found (component is conditionally mounted).
  const oampIdentifier = useMemo(() => extractOampIdentifier(scan.ocr_text ?? ""), [scan.ocr_text]);
  if (!result) return null;

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View style={styles.resultIcon}>
          <Text style={styles.resultIconText}>DOC</Text>
        </View>
        <View style={styles.resultHeaderText}>
          <Text style={styles.docKind}>{result.document_type_cz ?? formatCategoryLabel(scan.category)}</Text>
          {result.sender ? <Text style={styles.docFrom}>{result.sender}</Text> : null}
        </View>
        {result.deadlines[0] ? <Text style={[styles.urgencyPill, urgencyPillColors(result.deadlines[0].date, colors)]}>{deadlineDistance(result.deadlines[0].date)}</Text> : null}

      </View>
      <SelectableText style={styles.resultTitle}>{result.document_type_cz ?? result.document_type_localized ?? formatDocTitle(result.document_type ?? scan.doc_type)}</SelectableText>
      <View style={styles.summaryRow}>
        <SelectableText style={[styles.resultSummary, styles.flex1]}>{result.summary}</SelectableText>
        {result.summary ? <CopyButton text={result.summary} colors={colors} styles={styles} compact /> : null}
      </View>
      {oampIdentifier ? <OampTrackingOffer identifier={oampIdentifier} plan={plan} /> : null}
      {result.actions_required.length ? (
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{t("chat.actions")}</Text>
          <CopyButton
            text={result.actions_required.map((action, index) => `${index + 1}. ${action}`).join("\n")}
            colors={colors}
            styles={styles}
            compact
          />
        </View>
      ) : null}
      {result.actions_required.map((action, index) => (
        <View key={`${action}-${index}`} style={styles.actionRow}>
          <View style={styles.actionIndex}>
            <Text style={styles.actionIndexText}>{index + 1}</Text>
          </View>
          <SelectableText style={styles.resultLine}>{action}</SelectableText>
        </View>
      ))}
      {result.deadlines.length ? <Text style={styles.sectionTitle}>{t("chat.deadlines")}</Text> : null}
      {result.deadlines.map((deadline, index) => (
        <DeadlineReminderRow
          key={`${deadline.date}-${index}`}
          deadline={deadline}
          scanId={scan.id}
          whereToGo={result.where_to_go ?? null}
          plan={plan}
          existingDeadlines={existingDeadlines}
          deadlinesReady={deadlinesReady}
          onReminderCreated={onReminderCreated}
          styles={styles}
          colors={colors}
        />
      ))}
      {result.where_to_go ? (
        <ResultInfoBlock
          tone="blue"
          title={t("chat.whereToGoLabel")}
          value={result.where_to_go}
          colors={colors}
          styles={styles}
        />
      ) : null}
      {result.documents_needed.length ? (
        <ResultInfoBlock
          tone="amber"
          title={t("chat.documentsNeededLabel")}
          value={result.documents_needed.join(", ")}
          colors={colors}
          styles={styles}
        />
      ) : null}
      {result.penalty ? (
        <ResultInfoBlock
          tone="danger"
          title={t("chat.penaltyLabel")}
          value={result.penalty}
          colors={colors}
          styles={styles}
        />
      ) : null}
      {result.tips ? (
        <ResultInfoBlock
          tone="green"
          title={t("chat.tipLabel")}
          value={result.tips}
          colors={colors}
          styles={styles}
        />
      ) : null}
    </View>
  );
}


export function ResultInfoBlock({ tone, title, value, colors, styles }: {
  tone: "blue" | "amber" | "neutral" | "danger" | "green";
  title: string;
  value: string;
  colors: ColorPalette;
  styles: ChatStyles;
}) {
  const toneStyle =
    tone === "blue"
      ? styles.infoBlockBlue
      : tone === "danger"
        ? styles.infoBlockDanger
        : tone === "green"
          ? styles.infoBlockGreen
          : tone === "amber"
            ? styles.infoBlockAmber
            : styles.infoBlockNeutral;
  const titleStyle =
    tone === "blue"
      ? styles.infoBlockTitleBlue
      : tone === "danger"
        ? styles.infoBlockTitleDanger
        : tone === "green"
          ? styles.infoBlockTitleGreen
          : tone === "amber"
            ? styles.infoBlockTitleAmber
            : styles.infoBlockTitleNeutral;

  return (
    <View style={[styles.infoBlock, toneStyle]}>
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.infoBlockTitle, titleStyle]}>{title}</Text>
        <CopyButton text={value} colors={colors} styles={styles} compact />
      </View>
      <SelectableText style={styles.infoBlockText}>{value}</SelectableText>
    </View>
  );
}


export function SkeletonResultCard({ progress, colors, styles }: {
  progress: string[];
  colors: ColorPalette;
  styles: ChatStyles;
}) {
  const shimmer = useRef(new Animated.Value(0.35)).current;
  const steps = pendingPipelineSteps();
  const activeIndex = pendingPipelineIndex(progress);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.35,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <View style={styles.pendingResultCard}>
      <View style={styles.pendingSkeletonHeader}>
        <Animated.View style={[styles.pendingSkeletonIcon, { opacity: shimmer }]} />
        <View style={styles.pendingSkeletonTitleLines}>
          <SkeletonLine width="48%" height={13} shimmer={shimmer} colors={colors} />
          <SkeletonLine width="72%" height={12} shimmer={shimmer} colors={colors} />
        </View>
      </View>

      <View style={styles.pendingSkeletonSection}>
        <SkeletonLine width="78%" height={24} shimmer={shimmer} colors={colors} />
        <SkeletonLine width="58%" height={24} shimmer={shimmer} colors={colors} />
      </View>

      <View style={styles.pendingSkeletonSection}>
        <SkeletonLine width="96%" height={16} shimmer={shimmer} colors={colors} />
        <SkeletonLine width="90%" height={16} shimmer={shimmer} colors={colors} />
        <SkeletonLine width="72%" height={16} shimmer={shimmer} colors={colors} />
      </View>

      <View style={styles.pendingProgressBlock}>
        <Text style={styles.pendingProgressTitle}>{t("scan.pipelineTitle")}</Text>
        <View style={styles.pendingSteps}>
          {steps.map((label, index) => {
            const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "waiting";
            return (
              <View key={`${label}-${index}`} style={styles.pendingStepRow}>
                <View
                  style={[
                    styles.pendingStepIcon,
                    state === "done" && styles.pendingStepIconDone,
                    state === "active" && styles.pendingStepIconActive
                  ]}
                >
                  {state === "done" ? (
                    <Text style={styles.pendingStepCheck}>✓</Text>
                  ) : state === "active" ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <View style={styles.pendingStepDot} />
                  )}
                </View>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.pendingStepText,
                    state === "done" && styles.pendingStepTextDone,
                    state === "active" && styles.pendingStepTextActive
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.pendingProgressHint}>{t("scan.pipelineHint")}</Text>
      </View>
    </View>
  );
}


export function SkeletonLine({ width, height, shimmer, colors }: {
  width: DimensionValue;
  height: number;
  shimmer: Animated.Value;
  colors: ColorPalette;
}) {
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: Math.max(4, height / 2),
        backgroundColor: colors.surface2,
        opacity: shimmer,
      }}
    />
  );
}
