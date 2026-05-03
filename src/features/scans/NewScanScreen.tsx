import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Button, ErrorText, Screen, colors } from "@/components/ui";
import {
  type PickedUpload,
  type ScanProgressEvent,
  getLimits,
  pickDocument,
  pickImage,
  scanWithCamera,
  streamScan,
  uploadToStorage
} from "@/features/scans/scansApi";
import { t } from "@/lib/i18n";

type LiveDeadline = {
  date?: string;
  description: string;
};

type LiveScanPreview = {
  documentType?: string;
  summary?: string;
  actions: string[];
  deadlines: LiveDeadline[];
  whereToGo?: string;
  penalty?: string;
  tips?: string;
};

const stepLabels: Record<string, ReturnType<typeof t>> = {
  preparing_inputs: t("scan.step.preparing_inputs"),
  ocr: t("scan.step.ocr"),
  classified: t("scan.step.classified"),
  rag: t("scan.step.rag"),
  analysis: t("scan.step.analysis"),
  saving: t("scan.step.saving")
};

export function NewScanScreen() {
  const [files, setFiles] = useState<PickedUpload[]>([]);
  const [pageLimit, setPageLimit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [preview, setPreview] = useState<LiveScanPreview>(() => emptyPreview());
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);

  async function addDocument() {
    try {
      setError(null);
      const availableSlots = await getAvailableSlots();
      if (availableSlots <= 0) return;
      const pickedFiles = await pickDocument();
      if (pickedFiles) appendFiles(pickedFiles, availableSlots);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : t("scan.pickDocumentError"));
    }
  }

  async function addImage() {
    try {
      setError(null);
      const availableSlots = await getAvailableSlots();
      if (availableSlots <= 0) return;
      const pickedFiles = await pickImage(availableSlots);
      if (pickedFiles) appendFiles(pickedFiles, availableSlots);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : t("scan.pickPhotoError"));
    }
  }

  async function addCameraScan() {
    try {
      setError(null);
      const availableSlots = await getAvailableSlots();
      if (availableSlots <= 0) return;
      const scanned = await scanWithCamera();
      if (scanned) appendFiles(scanned, availableSlots);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : t("scan.scannerUnavailable"));
    }
  }

  async function startScan() {
    setBusy(true);
    setError(null);
    setUpgradeNeeded(false);
    setProgress([]);
    setPreview(emptyPreview());

    try {
      const limits = await getLimits();
      setPageLimit(limits.max_pages_per_scan);
      if (limits.scans_remaining <= 0 || files.length > limits.max_pages_per_scan) {
        setUpgradeNeeded(true);
        if (files.length > limits.max_pages_per_scan) {
          setError(t("scan.pageLimitError", { count: limits.max_pages_per_scan }));
        }
        return;
      }

      pushProgress(t("scan.uploading"));
      const paths = await uploadToStorage(files);
      if (paths.length !== files.length) {
        throw new Error(t("scan.uploadCountMismatch"));
      }

      await streamScan(paths, (event) => handleScanEvent(event));
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : t("scan.failed");
      setError(message);
      if (message.includes("plan") || message.includes("limit")) setUpgradeNeeded(true);
    } finally {
      setBusy(false);
    }
  }

  function handleScanEvent(event: ScanProgressEvent) {
    if (event.type === "status") {
      const label = event.step ? stepLabels[event.step] ?? event.message ?? event.step : event.message;
      if (label) pushProgress(label);
      return;
    }
    if (event.type === "field") {
      setPreview((current) => updatePreview(current, event.field, event.value));
      return;
    }
    if (event.type === "error") {
      setError(event.detail);
      if (event.status_code === 402) setUpgradeNeeded(true);
      return;
    }
    router.replace(`/scan/${event.scan.id}`);
  }

  function pushProgress(next: string) {
    setProgress((current) => (current[current.length - 1] === next ? current : [...current, next]));
  }

  async function getAvailableSlots() {
    const limits = await getLimits();
    setPageLimit(limits.max_pages_per_scan);

    if (limits.scans_remaining <= 0) {
      setUpgradeNeeded(true);
      setError(t("documents.limitReached"));
      return 0;
    }

    const remaining = limits.max_pages_per_scan - files.length;
    if (remaining <= 0) {
      setError(t("scan.pageLimitError", { count: limits.max_pages_per_scan }));
      return 0;
    }

    return remaining;
  }

  function appendFiles(nextFiles: PickedUpload[], availableSlots: number) {
    if (!nextFiles.length) return;

    const accepted = nextFiles.slice(0, availableSlots);
    setFiles((current) => {
      const existingUris = new Set(current.map((file) => file.uri));
      const uniqueAccepted = accepted.filter((file) => !existingUris.has(file.uri));
      return [...current, ...uniqueAccepted];
    });

    if (nextFiles.length > availableSlots) {
      setError(t("scan.partialAdd", { count: availableSlots, limit: pageLimit ?? files.length + availableSlots }));
    }
  }

  function removeFile(indexToRemove: number) {
    if (busy) return;
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
  }

  const maxPagesText = pageLimit ? t("scan.maxPages", { count: pageLimit }) : t("scan.pickOneOrMore");
  const addDisabled = busy || Boolean(pageLimit && files.length >= pageLimit);

  return (
    <Screen>
      <View style={styles.scannerShell}>
        <View style={styles.scannerTop}>
          <Pressable onPress={() => router.back()} style={styles.scannerBack}>
            <Text style={styles.scannerBackText}>{t("common.back")}</Text>
          </Pressable>
          <Text style={styles.scannerTitle}>{t("scan.title")}</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.scannerViewport}>
          <View style={styles.paper}>
            <View style={styles.paperTitle} />
            {[90, 76, 88, 65, 82, 56, 72, 84].map((width, index) => (
              <View key={index} style={[styles.paperLine, { width: `${width}%` }]} />
            ))}
          </View>
          {busy ? <View style={styles.scanLine} /> : null}
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>

        <View style={styles.thumbStrip}>
          {files.map((file, index) => (
            <Pressable key={`${file.uri}-${index}`} onPress={() => removeFile(index)} style={[styles.pageThumb, index === files.length - 1 && styles.pageThumbActive]}>
              <Text style={styles.pageThumbText}>{index + 1}</Text>
              <Text style={styles.removeThumbText}>x</Text>
            </Pressable>
          ))}
          <Pressable onPress={addImage} disabled={addDisabled} style={[styles.addPage, addDisabled && styles.disabledControl]}>
            <Text style={styles.addPageText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.scannerToolbar}>
          <Pressable onPress={addImage} disabled={addDisabled} style={[styles.toolButton, addDisabled && styles.disabledControl]}>
            <Text style={styles.toolLabel}>{t("scan.photos")}</Text>
          </Pressable>
          <Pressable onPress={addCameraScan} disabled={addDisabled} style={[styles.camButton, addDisabled && styles.disabledControl]}>
            <Text style={styles.camText}>SCAN</Text>
          </Pressable>
          <Pressable onPress={addDocument} disabled={addDisabled} style={[styles.toolButton, addDisabled && styles.disabledControl]}>
            <Text style={styles.toolIcon}>PDF</Text>
            <Text style={styles.toolLabel}>{t("scan.file")}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {upgradeNeeded ? <Text style={styles.warning}>{t("scan.limitReached")}</Text> : null}
        <ErrorText message={error} />

        {files.length ? (
          <View style={styles.selectedSheet}>
            <Text style={styles.label}>{t("scan.selected", { count: files.length })}</Text>
            <Text style={styles.subtle}>{t("scan.selectedHint", { maxPagesText })}</Text>
            <View style={styles.fileList}>
              {files.map((file, index) => (
                <View key={`${file.uri}-row-${index}`} style={styles.fileRow}>
                  <Text style={styles.fileIndex}>{index + 1}</Text>
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <Pressable onPress={() => removeFile(index)} disabled={busy} style={styles.removeButton}>
                    <Text style={styles.removeButtonText}>{t("scan.remove")}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.selectedSheet}>
            <Text style={styles.label}>{t("scan.noDocument")}</Text>
            <Text style={styles.subtle}>{t("scan.emptyHint", { maxPagesText })}</Text>
          </View>
        )}

        <Button title={busy ? t("scan.analyzing") : `${t("scan.analyze")}${files.length ? ` (${files.length})` : ""}`} onPress={startScan} disabled={!files.length || busy || Boolean(pageLimit && files.length > pageLimit)} />

        {busy || progress.length ? (
          <View style={styles.progress}>
            {busy ? <ActivityIndicator color={colors.primary} /> : null}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progress.length ? `${Math.min(progress.length * 18, 88)}%` : "5%" }]} />
            </View>
            {progress.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.progressRow}>
                <View style={styles.progressDot} />
                <Text style={styles.progressText}>{item}</Text>
              </View>
            ))}
            <LiveResultCard preview={preview} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function emptyPreview(): LiveScanPreview {
  return {
    actions: [],
    deadlines: []
  };
}

function updatePreview(current: LiveScanPreview, field: string, value: unknown): LiveScanPreview {
  const normalized = field.trim();

  if (normalized === "summary") {
    return { ...current, summary: asText(value) ?? current.summary };
  }
  if (normalized === "document_type" || normalized === "document_type_localized" || normalized === "doc_type") {
    return { ...current, documentType: asText(value) ?? current.documentType };
  }
  if (normalized === "actions_required") {
    return { ...current, actions: asTextList(value) };
  }
  if (normalized === "deadlines") {
    return { ...current, deadlines: asDeadlines(value) };
  }
  if (normalized === "where_to_go") {
    return { ...current, whereToGo: asText(value) ?? current.whereToGo };
  }
  if (normalized === "penalty") {
    return { ...current, penalty: asText(value) ?? current.penalty };
  }
  if (normalized === "tips") {
    return { ...current, tips: asText(value) ?? current.tips };
  }

  return current;
}

function LiveResultCard({ preview }: { preview: LiveScanPreview }) {
  const hasContent = Boolean(
    preview.documentType ||
      preview.summary ||
      preview.actions.length ||
      preview.deadlines.length ||
      preview.whereToGo ||
      preview.penalty ||
      preview.tips
  );

  if (!hasContent) return null;

  return (
    <View style={styles.liveCard}>
      <Text style={styles.liveEyebrow}>{t("scan.liveResult")}</Text>
      {preview.documentType ? <Text style={styles.liveTitle}>{preview.documentType}</Text> : null}
      {preview.summary ? <Text style={styles.liveSummary}>{preview.summary}</Text> : null}

      {preview.actions.length ? <Text style={styles.liveSection}>{t("scan.actions")}</Text> : null}
      {preview.actions.map((action, index) => (
        <View key={`${action}-${index}`} style={styles.liveActionRow}>
          <View style={styles.liveIndex}>
            <Text style={styles.liveIndexText}>{index + 1}</Text>
          </View>
          <Text style={styles.liveLine}>{action}</Text>
        </View>
      ))}

      {preview.deadlines.length ? <Text style={styles.liveSection}>{t("scan.deadlines")}</Text> : null}
      {preview.deadlines.map((deadline, index) => (
        <View key={`${deadline.date ?? "deadline"}-${index}`} style={styles.liveDeadline}>
          {deadline.date ? <Text style={styles.liveDeadlineDate}>{deadline.date}</Text> : null}
          <Text style={styles.liveLine}>{deadline.description}</Text>
        </View>
      ))}

      {preview.whereToGo ? <Text style={styles.liveLine}>{t("scan.whereToGo", { value: preview.whereToGo })}</Text> : null}
      {preview.penalty ? <Text style={styles.liveLine}>{t("scan.penalty", { value: preview.penalty })}</Text> : null}
      {preview.tips ? <Text style={styles.liveLine}>{t("scan.tip", { value: preview.tips })}</Text> : null}
    </View>
  );
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asTextList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asDeadlines(value: unknown): LiveDeadline[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ description: item }];
    if (!isRecord(item)) return [];

    const description = asText(item.description) ?? asText(item.title);
    if (!description) return [];

    return [
      {
        date: asText(item.date) ?? asText(item.due_date),
        description
      }
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const styles = StyleSheet.create({
  scannerShell: {
    height: 520,
    backgroundColor: "#0A0906"
  },
  scannerTop: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  scannerTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800"
  },
  topSpacer: {
    width: 52,
    height: 40
  },
  scannerBack: {
    minWidth: 52,
    minHeight: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(253,251,248,0.14)"
  },
  scannerBackText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  content: {
    padding: 18,
    gap: 16
  },
  section: {
    gap: 8
  },
  subtle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  scannerViewport: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  paper: {
    width: 154,
    height: 196,
    borderRadius: 4,
    backgroundColor: "#F8F2EA",
    padding: 14,
    gap: 5,
    transform: [{ rotate: "-1.5deg" }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 32
  },
  paperTitle: {
    width: "55%",
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginBottom: 5
  },
  paperLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#C9C2B9"
  },
  scanLine: {
    position: "absolute",
    left: 54,
    right: 54,
    top: 205,
    height: 2,
    backgroundColor: colors.amber
  },
  corner: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: colors.amber
  },
  cornerTopLeft: {
    top: 78,
    left: 24,
    borderTopWidth: 3,
    borderLeftWidth: 3
  },
  cornerTopRight: {
    top: 78,
    right: 24,
    borderTopWidth: 3,
    borderRightWidth: 3
  },
  cornerBottomLeft: {
    bottom: 120,
    left: 24,
    borderBottomWidth: 3,
    borderLeftWidth: 3
  },
  cornerBottomRight: {
    bottom: 120,
    right: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  thumbStrip: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 12
  },
  pageThumb: {
    width: 44,
    height: 58,
    borderRadius: 6,
    backgroundColor: "#2A2520",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  pageThumbActive: {
    borderColor: colors.amber
  },
  pageThumbText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800"
  },
  removeThumbText: {
    position: "absolute",
    right: 4,
    top: 2,
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900"
  },
  addPage: {
    width: 44,
    height: 58,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center"
  },
  addPageText: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 26
  },
  disabledControl: {
    opacity: 0.42
  },
  scannerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 30,
    backgroundColor: "rgba(13,11,9,0.95)"
  },
  toolButton: {
    width: 72,
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    justifyContent: "center"
  },
  toolIcon: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  toolLabel: {
    color: "rgba(253,250,247,0.72)",
    fontSize: 11,
    fontWeight: "700"
  },
  camButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 24
  },
  camText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900"
  },
  selectedSheet: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 9
  },
  fileList: {
    gap: 8
  },
  fileRow: {
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10
  },
  fileIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 22
  },
  fileName: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "700"
  },
  removeButton: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  removeButtonText: {
    color: colors.dangerDark,
    fontSize: 12,
    fontWeight: "800"
  },
  warning: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.warningBg,
    color: colors.warningText
  },
  progress: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 8
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 999,
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 999
  },
  progressText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.amber,
    marginTop: 7
  },
  liveCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    gap: 6
  },
  liveEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  liveTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800"
  },
  liveSummary: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  liveSection: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4
  },
  liveLine: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  liveActionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9
  },
  liveIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  liveIndexText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900"
  },
  liveDeadline: {
    backgroundColor: colors.amberLight,
    borderRadius: 10,
    padding: 10,
    gap: 3
  },
  liveDeadlineDate: {
    color: colors.amberDark,
    fontSize: 14,
    fontWeight: "800"
  }
});
