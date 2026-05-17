import { useEffect, useMemo, useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";

import { PaywallSheet } from "@/components/PaywallSheet";
import { ChatThreadScreen } from "@/features/chat/ChatThreadScreen";
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
import {
  getPendingScan,
  pushPendingProgress,
  resetPendingScan,
  updatePendingScan,
} from "@/features/scans/pendingScanStore";
import { getLocale, t } from "@/lib/i18n";
import type { UserPlan } from "@/lib/types";

type ScannerCopy = ReturnType<typeof getScannerCopy>;

const scannerDark = {
  bg: "#0F0D0B",
  bgDeep: "#0A0907",
  surface: "#181512",
  surface2: "#211D19",
  surface3: "#2A2520",
  hairline: "#2C2722",
  blue: "#6FA0E6",
  blueDeep: "#3E6FB8",
  amber: "#E0B45A",
  red: "#E07F73",
  green: "#7FBE9A",
  purple: "#A893E0",
  ink: "#F4EFE6",
  ink2: "#D9D2C5",
  ink3: "#A39A8C",
  ink4: "#6F675D",
  ink5: "#4A443D",
  paper: "#F1EAD9",
  greenSoft: "rgba(127,190,154,0.12)",
  greenLine: "rgba(127,190,154,0.28)",
  redSoft: "rgba(224,127,115,0.13)",
  redLine: "rgba(224,127,115,0.32)",
  amberSoft: "rgba(224,180,90,0.13)",
  amberLine: "rgba(224,180,90,0.30)",
  purpleSoft: "rgba(168,147,224,0.13)",
  purpleLine: "rgba(168,147,224,0.30)",
  blueSoft: "rgba(111,160,230,0.13)",
  blueLine: "rgba(111,160,230,0.28)",
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
  const params = useLocalSearchParams<{ fresh?: string }>();
  const insets = useSafeAreaInsets();
  const copy = useMemo(() => getScannerCopy(getLocale()), []);

  const [files, setFiles] = useState<PickedUpload[]>([]);
  const [pageLimit, setPageLimit] = useState<number | null>(null);
  const [plan, setPlan] = useState<UserPlan>("free");
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<PickedUpload[] | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showPendingChat, setShowPendingChat] = useState(() => getPendingScan().active);
  // Transient "page added" feedback — pill auto-hides 2s after each capture.
  const [pillFlash, setPillFlash] = useState<{ label: string; key: number } | null>(null);

  useEffect(() => {
    if (!pillFlash) return;
    const timer = setTimeout(() => setPillFlash((current) => (current?.key === pillFlash.key ? null : current)), 2000);
    return () => clearTimeout(timer);
  }, [pillFlash]);

  useEffect(() => {
    const pending = getPendingScan();
    if (pending.active) return;

    setFiles([]);
    setBusy(false);
    setError(null);
    setImportSheetOpen(false);
    setPdfFiles(null);
    setPermissionDenied(false);
    setShowPendingChat(false);
    resetPendingScan();
  }, [params.fresh]);

  useEffect(() => {
    let alive = true;

    getLimits()
      .then((limits) => {
        if (!alive) return;
        setPageLimit(limits.max_pages_per_scan);
        setPlan(limits.plan);
        setScansRemaining(limits.scans_remaining);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [params.fresh]);

  async function addDocument() {
    try {
      setError(null);
      const availableSlots = await getAvailableSlots();
      if (availableSlots <= 0) return;

      const pickedFiles = await pickDocument();
      if (!pickedFiles?.length) return;

      setImportSheetOpen(false);
      if (pickedFiles.some(isPdfUpload)) {
        setPdfFiles(pickedFiles);
        return;
      }

      appendFiles(pickedFiles, availableSlots);
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
      if (pickedFiles) {
        setImportSheetOpen(false);
        appendFiles(pickedFiles, availableSlots);
      }
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : t("scan.pickPhotoError"));
    }
  }

  async function addCameraScan() {
    try {
      setError(null);
      setPermissionDenied(false);
      const availableSlots = await getAvailableSlots();
      if (availableSlots <= 0) return;
      const scanned = await scanWithCamera();
      if (scanned) appendFiles(scanned, availableSlots);
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : t("scan.scannerUnavailable");
      setError(message);
      setPermissionDenied(true);
    }
  }

  async function startScan() {
    if (!files.length || busy) return;

    setBusy(true);
    setError(null);

    try {
      const limits = await getLimits();
      setPageLimit(limits.max_pages_per_scan);
      setPlan(limits.plan);
      setScansRemaining(limits.scans_remaining);
      if (limits.scans_remaining <= 0 || files.length > limits.max_pages_per_scan) {
        if (limits.scans_remaining <= 0) {
          setError(t("documents.limitReached"));
        } else {
          setError(t("scan.pageLimitError", { count: limits.max_pages_per_scan }));
        }
        return;
      }

      resetPendingScan();
      updatePendingScan({
        active: true,
        attachments: files.map((file) => ({
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType,
        })),
      });
      setShowPendingChat(true);

      pushPendingProgress(t("scan.uploading"));
      const paths = await uploadToStorage(files);
      if (paths.length !== files.length) {
        throw new Error(t("scan.uploadCountMismatch"));
      }

      await streamScan(paths, (event) => handleScanEvent(event));
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : t("scan.failed");
      setError(message);
      updatePendingScan({ error: message, active: false });
    } finally {
      setBusy(false);
    }
  }

  function handleScanEvent(event: ScanProgressEvent) {
    if (event.type === "status") {
      const label = event.step ? stepLabels[event.step] ?? event.message ?? event.step : event.message;
      if (label) {
        pushPendingProgress(label);
      }
      return;
    }

    if (event.type === "field") {
      if (event.field === "summary") {
        updatePendingScan({ preview: { ...getPendingPreview(), summary: String(event.value ?? "") } });
      }
      if (event.field === "document_type_localized" || event.field === "document_type") {
        updatePendingScan({ preview: { ...getPendingPreview(), documentType: String(event.value ?? "") } });
      }
      if (event.field === "actions_required" && Array.isArray(event.value)) {
        updatePendingScan({
          preview: {
            ...getPendingPreview(),
            actions: event.value.filter((value): value is string => typeof value === "string"),
          },
        });
      }
      return;
    }

    if (event.type === "error") {
      setError(event.detail);
      updatePendingScan({ error: event.detail, active: false });
      return;
    }

    updatePendingScan({ scanId: event.scan.id, active: false });
  }

  function getPendingPreview() {
    return getPendingScan().preview;
  }

  async function getAvailableSlots() {
    const limits = await getLimits();
    setPageLimit(limits.max_pages_per_scan);
    setPlan(limits.plan);
    setScansRemaining(limits.scans_remaining);

    if (limits.scans_remaining <= 0) {
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
    let acceptedCount = 0;
    setFiles((current) => {
      const existingUris = new Set(current.map((file) => file.uri));
      const uniqueAccepted = accepted.filter((file) => !existingUris.has(file.uri));
      acceptedCount = uniqueAccepted.length;
      const next = [...current, ...uniqueAccepted];
      if (acceptedCount > 0) {
        setPillFlash({ label: copy.pageAdded(next.length), key: Date.now() });
      }
      return next;
    });

    if (nextFiles.length > availableSlots) {
      setError(t("scan.partialAdd", { count: availableSlots, limit: pageLimit ?? files.length + availableSlots }));
    }
  }

  function removeFile(indexToRemove: number) {
    if (busy) return;
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setError(null);
  }

  function confirmPdfImport() {
    if (!pdfFiles?.length) return;
    const limit = pageLimit ?? 3;
    appendFiles(pdfFiles, Math.max(limit - files.length, 0));
    setPdfFiles(null);
  }

  const maxPages = pageLimit ?? 3;
  const isPro = plan === "pro";
  const limitReached = files.length >= maxPages;
  const nearLimit = isPro && maxPages - files.length === 1;

  if (permissionDenied) {
    return (
      <PermissionDeniedScreen
        copy={copy}
        error={error}
        onClose={() => router.back()}
        onOpenSettings={() => void Linking.openSettings()}
        onPickGallery={() => {
          setPermissionDenied(false);
          void addImage();
        }}
      />
    );
  }

  if (showPendingChat) return <ChatThreadScreen />;

  return (
    <View style={scannerStyles.root}>
      <View style={scannerStyles.appBackground} />
      <ScannerAppBar
        copy={copy}
        count={files.length}
        maxPages={maxPages}
        isPro={isPro}
        limitReached={limitReached}
        onClose={() => router.back()}
        topInset={insets.top}
      />

      <ScannerCamera
        copy={copy}
        isPro={isPro}
        files={files}
        limitReached={limitReached}
        flashPill={pillFlash ? { label: pillFlash.label, visible: true } : undefined}
      >
        {files.length > 0 ? <ThumbnailStrip files={files} onRemove={removeFile} /> : null}
      </ScannerCamera>

      {error ? (
        <View style={scannerStyles.inlineError}>
          <Text style={scannerStyles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}

      {limitReached ? (
        <ProcessBar
          copy={copy}
          count={files.length}
          isPro={isPro}
          onProcess={startScan}
          onUpgrade={() => setShowPaywall(true)}
          bottomInset={insets.bottom}
        />
      ) : (
        <BottomBar
          copy={copy}
          doneActive={files.length > 0}
          nearLimitLabel={nearLimit ? copy.onePageRemaining : undefined}
          onImport={() => setImportSheetOpen(true)}
          onShutter={() => void addCameraScan()}
          onDone={startScan}
          bottomInset={insets.bottom}
        />
      )}

      <ImportSheet
        visible={importSheetOpen}
        copy={copy}
        maxPages={maxPages}
        onClose={() => setImportSheetOpen(false)}
        onPickPdf={() => void addDocument()}
        onPickPhotos={() => void addImage()}
      />
      <PdfSheet
        visible={Boolean(pdfFiles)}
        copy={copy}
        isPro={isPro}
        maxPages={maxPages}
        count={pdfFiles?.length ?? 0}
        onCancel={() => setPdfFiles(null)}
        onConfirm={confirmPdfImport}
        onUpgrade={() => setShowPaywall(true)}
      />
      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </View>
  );
}

function ScannerAppBar({
  copy,
  count,
  maxPages,
  isPro,
  limitReached,
  onClose,
  topInset,
}: {
  copy: ScannerCopy;
  count: number;
  maxPages: number;
  isPro: boolean;
  limitReached: boolean;
  onClose: () => void;
  topInset: number;
}) {
  const subtitle = subtitleForState(copy, count, maxPages, isPro, limitReached);

  return (
    <View style={[scannerStyles.appBar, { height: topInset + 56, paddingTop: topInset }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={scannerStyles.appBarButton}>
        <Icon name="x" size={20} color={scannerDark.ink2} />
      </Pressable>

      <View style={scannerStyles.appBarTitleBlock}>
        <Text style={scannerStyles.appBarTitle}>{copy.newScan}</Text>
        <View style={scannerStyles.subtitleRow}>
          {isPro ? <Icon name="star" size={11} color={scannerDark.purple} /> : null}
          <Text style={[scannerStyles.appBarSubtitle, subtitle.tone === "red" && scannerStyles.redText, subtitle.tone === "amber" && scannerStyles.amberText]}>
            {subtitle.label}
          </Text>
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={copy.flash} style={scannerStyles.appBarButton}>
        <Icon name="zap" size={18} color={scannerDark.ink2} />
      </Pressable>
    </View>
  );
}

function ScannerCamera({
  copy,
  files,
  flashPill,
  children,
}: {
  copy: ScannerCopy;
  isPro: boolean;
  files: PickedUpload[];
  limitReached: boolean;
  flashPill?: { label: string; visible: boolean };
  children?: React.ReactNode;
}) {
  const hasDocument = files.length > 0;

  return (
    <View style={scannerStyles.camera}>
      <View style={[scannerStyles.corner, scannerStyles.cornerTL]} />
      <View style={[scannerStyles.corner, scannerStyles.cornerTR]} />
      <View style={[scannerStyles.corner, scannerStyles.cornerBL]} />
      <View style={[scannerStyles.corner, scannerStyles.cornerBR]} />

      {hasDocument ? (
        <FilePreview file={files[files.length - 1]} totalCount={files.length} />
      ) : (
        <View style={scannerStyles.emptyState}>
          <Icon name="doc-text" size={48} color={scannerDark.ink3} />
          <Text style={scannerStyles.emptyHint}>{copy.pointCamera}</Text>
        </View>
      )}

      {/* Children (thumbnail strip) — rendered absolute-bottom inside camera viewport */}
      {children}

      {/* Transient "page added" pill — shown for ~2s after each capture */}
      {flashPill?.visible ? (
        <View style={[scannerStyles.statusPill, scannerStyles.statusPillGreen]}>
          <Icon name="check" size={14} color={scannerDark.green} />
          <Text style={[scannerStyles.statusPillText, scannerStyles.statusPillTextGreen]}>
            {flashPill.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function FilePreview({ file, totalCount }: { file: PickedUpload; totalCount: number }) {
  const isImage = isImageUpload(file);
  if (isImage) {
    return (
      <View style={scannerStyles.previewWrap}>
        <Image
          source={{ uri: file.uri }}
          style={scannerStyles.previewImage}
          resizeMode="cover"
        />
        {totalCount > 1 ? (
          <View style={scannerStyles.previewBadge}>
            <Text style={scannerStyles.previewBadgeText}>+{totalCount - 1}</Text>
          </View>
        ) : null}
      </View>
    );
  }
  // PDF (or other non-image) — show a generic file card
  return (
    <View style={scannerStyles.previewPdf}>
      <Icon name="doc" size={48} color={scannerDark.blue} />
      <Text style={scannerStyles.previewPdfName} numberOfLines={1}>{file.name}</Text>
      {totalCount > 1 ? (
        <Text style={scannerStyles.previewPdfCount}>+{totalCount - 1}</Text>
      ) : null}
    </View>
  );
}

function isImageUpload(file: PickedUpload) {
  if (file.mimeType?.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(file.name) || /\.(jpe?g|png|gif|webp|heic)$/i.test(file.uri);
}

function ThumbnailStrip({ files, onRemove }: { files: PickedUpload[]; onRemove: (index: number) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={scannerStyles.thumbsContent}
      style={scannerStyles.thumbs}
    >
      {files.map((file, index) => {
        const isImage = isImageUpload(file);
        return (
          <View key={`${file.uri}-${index}`} style={scannerStyles.thumb}>
            {isImage ? (
              <Image source={{ uri: file.uri }} style={scannerStyles.thumbImage} resizeMode="cover" />
            ) : (
              <View style={scannerStyles.thumbPdf}>
                <Icon name="doc" size={20} color={scannerDark.blue} />
              </View>
            )}
            <View style={scannerStyles.thumbIndexBadge}>
              <Text style={scannerStyles.thumbIndexText}>{index + 1}</Text>
            </View>
            <Pressable
              onPress={() => onRemove(index)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
              style={scannerStyles.thumbRemove}
            >
              <Icon name="x" size={10} color={scannerDark.ink} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function BottomBar({
  copy,
  doneActive,
  nearLimitLabel,
  onImport,
  onShutter,
  onDone,
  bottomInset,
}: {
  copy: ScannerCopy;
  doneActive: boolean;
  nearLimitLabel?: string;
  onImport: () => void;
  onShutter: () => void;
  onDone: () => void;
  bottomInset: number;
}) {
  return (
    <View style={[scannerStyles.bottomBar, { paddingBottom: Math.max(bottomInset, 18) + 10 }]}>
      <Pressable accessibilityRole="button" onPress={onImport} style={scannerStyles.sideAction}>
        <Icon name="pages" size={24} color={scannerDark.ink2} />
        <Text style={scannerStyles.sideActionText}>{copy.import}</Text>
      </Pressable>

      <View style={scannerStyles.shutterSlot} />

      <Pressable accessibilityRole="button" disabled={!doneActive} onPress={onDone} style={scannerStyles.doneAction}>
        <Text style={[scannerStyles.doneText, !doneActive && scannerStyles.doneTextDisabled]}>{copy.done}</Text>
      </Pressable>

      <View style={scannerStyles.shutterWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.capture} onPress={onShutter} style={({ pressed }) => [scannerStyles.shutter, pressed && scannerStyles.shutterPressed]}>
          <View style={scannerStyles.shutterInner} />
        </Pressable>
        {nearLimitLabel ? <Text style={scannerStyles.nearLimitLabel}>{nearLimitLabel}</Text> : null}
      </View>
    </View>
  );
}

function ProcessBar({
  copy,
  count,
  isPro,
  onProcess,
  onUpgrade,
  bottomInset,
}: {
  copy: ScannerCopy;
  count: number;
  isPro: boolean;
  onProcess: () => void;
  onUpgrade: () => void;
  bottomInset: number;
}) {
  return (
    <View style={[scannerStyles.processBar, { paddingBottom: Math.max(bottomInset, 18) + 10 }]}>
      <Pressable accessibilityRole="button" onPress={onProcess} style={scannerStyles.processButton}>
        <Text style={scannerStyles.processButtonText}>{copy.processPages(count)}</Text>
      </Pressable>
      {isPro ? (
        <Text style={scannerStyles.processCaption}>{copy.maximumPages}</Text>
      ) : (
        <Pressable onPress={onUpgrade} style={scannerStyles.upgradeRibbon}>
          <Icon name="star" size={12} color={scannerDark.purple} />
          <Text style={scannerStyles.upgradeText}>{copy.upgradeToPro}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ImportSheet({
  visible,
  copy,
  maxPages,
  onClose,
  onPickPdf,
  onPickPhotos,
}: {
  visible: boolean;
  copy: ScannerCopy;
  maxPages: number;
  onClose: () => void;
  onPickPdf: () => void;
  onPickPhotos: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sectionLabel}>{copy.addToScan}</Text>
          <View style={sheetStyles.rows}>
            <SheetRow icon="doc-text" title={copy.pdfFile} detail={copy.importFromFiles} onPress={onPickPdf} />
            <View style={sheetStyles.divider} />
            <SheetRow icon="pages" title={copy.photosFromGallery} detail={copy.selectPhotos(maxPages)} onPress={onPickPhotos} />
          </View>
          <Pressable onPress={onClose} style={sheetStyles.cancelButton}>
            <Text style={sheetStyles.cancelText}>{copy.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PdfSheet({
  visible,
  copy,
  isPro,
  maxPages,
  count,
  onCancel,
  onConfirm,
  onUpgrade,
}: {
  visible: boolean;
  copy: ScannerCopy;
  isPro: boolean;
  maxPages: number;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
  onUpgrade: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={sheetStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.pdfTop}>
            <View style={sheetStyles.pdfIcon}>
              <Icon name="doc" size={22} color={scannerDark.blue} />
            </View>
            <View style={sheetStyles.pdfTextBlock}>
              <Text style={sheetStyles.pdfEyebrow}>{copy.pdfCount(count)}</Text>
              <Text style={sheetStyles.pdfTitle}>{copy.pdfSelected}</Text>
            </View>
          </View>

          {!isPro ? (
            <View style={sheetStyles.warningBlock}>
              <Text style={sheetStyles.warningText}>{copy.freePdfWarning(maxPages)}</Text>
            </View>
          ) : null}

          <View style={sheetStyles.ctaStack}>
            <Pressable onPress={onConfirm} style={sheetStyles.primaryButton}>
              <Text style={sheetStyles.primaryButtonText}>{isPro ? copy.processPdfAll : copy.processPdfFree(maxPages)}</Text>
            </Pressable>
            {!isPro ? (
              <Pressable onPress={onUpgrade} style={sheetStyles.upgradeButton}>
                <Icon name="star" size={14} color={scannerDark.purple} />
                <Text style={sheetStyles.upgradeButtonText}>{copy.upgradePdf}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onCancel} style={sheetStyles.cancelButtonCompact}>
              <Text style={sheetStyles.cancelText}>{copy.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SheetRow({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={sheetStyles.row}>
      <View style={sheetStyles.rowIcon}>
        <Icon name={icon} size={20} color={scannerDark.blue} />
      </View>
      <View style={sheetStyles.rowText}>
        <Text style={sheetStyles.rowTitle}>{title}</Text>
        <Text style={sheetStyles.rowDetail}>{detail}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={scannerDark.ink3} />
    </Pressable>
  );
}

function PermissionDeniedScreen({
  copy,
  error,
  onClose,
  onOpenSettings,
  onPickGallery,
}: {
  copy: ScannerCopy;
  error: string | null;
  onClose: () => void;
  onOpenSettings: () => void;
  onPickGallery: () => void;
}) {
  return (
    <View style={permissionStyles.root}>
      <Pressable onPress={onClose} style={permissionStyles.closeButton}>
        <Icon name="x" size={20} color={scannerDark.ink2} />
      </Pressable>
      <Icon name="camera" size={58} color={scannerDark.ink4} style={{ marginBottom: 20 }} />
      <Text style={permissionStyles.title}>{copy.cameraAccessNeeded}</Text>
      <Text style={permissionStyles.body}>{copy.cameraAccessBody}</Text>
      {error ? <Text style={permissionStyles.error}>{error}</Text> : null}
      <View style={permissionStyles.actions}>
        <Pressable onPress={onOpenSettings} style={permissionStyles.primaryButton}>
          <Text style={permissionStyles.primaryButtonText}>{copy.openSettings}</Text>
        </Pressable>
        <Pressable onPress={onPickGallery} style={permissionStyles.secondaryButton}>
          <Text style={permissionStyles.secondaryButtonText}>{copy.pickGalleryInstead}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Unified subtitle format across all states: "Free · 1 из 3".
 * Empty   → "Free · 0 из 3"  (zero count, neutral)
 * 1 page  → "Free · 1 из 3"
 * 3/3     → "Free · лимит достигнут"  amber/red tinted
 *
 * Consistent prefix (Free / Pro) on every state so users always see
 * their plan label without it shifting around.
 */
function subtitleForState(copy: ScannerCopy, count: number, maxPages: number, isPro: boolean, limitReached: boolean) {
  const planLabel = isPro ? "Pro" : "Free";

  if (limitReached) {
    return {
      label: `${planLabel} · ${copy.limitReachedSuffix}`,
      tone: (isPro ? "amber" : "red") as "amber" | "red",
    };
  }
  return {
    label: `${planLabel} · ${copy.countOfMax(count, maxPages)}`,
    tone: "default" as const,
  };
}

function isPdfUpload(file: PickedUpload) {
  return file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function getScannerCopy(locale: string) {
  const language = locale === "ru" || locale === "uk" || locale === "en" ? locale : "cs";
  const copies = {
    cs: {
      newScan: "Nový sken",
      flash: "Blesk",
      capture: "Skenovat",
      import: "Import",
      done: "Hotovo",
      cancel: "Zrušit",
      pointCamera: "Namiř kameru na dokument",
      documentFound: "Dokument nalezen",
      pageAdded: (count: number) => `Strana ${count} přidána`,
      freeLimit: (max: number) => `Free · max ${max} strany`,
      proLimit: (max: number) => `Pro · max ${max} stran`,
      countOfLimit: (count: number, max: number, label: string) => `${count} z ${max} · ${label}`,
      countOfMax: (count: number, max: number) => `${count} z ${max}`,
      limitReachedSuffix: "limit dosažen",
      freeLimitReached: "Free limit dosažen",
      maximumReached: "Maximum dosaženo · Pro",
      onePageRemaining: "Zbývá 1 strana",
      processPages: (count: number) => `Zpracovat ${count} ${count === 1 ? "stranu" : "strany"} →`,
      maximumPages: "Maximum 10 stran na jeden sken",
      upgradeToPro: "Přejít na Pro · až 10 stran",
      addToScan: "Přidat do skenu",
      pdfFile: "PDF soubor",
      importFromFiles: "Import z aplikace Soubory",
      photosFromGallery: "Fotky z galerie",
      selectPhotos: (max: number) => `Vyber až ${max} fotek`,
      pdfSelected: "PDF je připravené",
      pdfCount: (count: number) => `${Math.max(count, 1)} soubor`,
      freePdfWarning: (max: number) => `Free plán podporuje max ${max} strany na jeden sken`,
      processPdfFree: (max: number) => `Pokračovat s limitem ${max} stran →`,
      processPdfAll: "Zpracovat PDF →",
      upgradePdf: "Pro zpracuje až 10 stran",
      cameraAccessNeeded: "Je potřeba přístup ke kameře",
      cameraAccessBody: "Jasně potřebuje kameru ke skenování dokumentů. Přístup můžeš povolit v Nastavení.",
      openSettings: "Otevřít Nastavení",
      pickGalleryInstead: "Vybrat z galerie",
    },
    ru: {
      newScan: "Новый скан",
      flash: "Вспышка",
      capture: "Сканировать",
      import: "Импорт",
      done: "Готово",
      cancel: "Отмена",
      pointCamera: "Наведите камеру на документ",
      documentFound: "Документ найден",
      pageAdded: (count: number) => `Страница ${count} добавлена`,
      freeLimit: (max: number) => `Free · до ${max} страниц`,
      proLimit: (max: number) => `Pro · до ${max} страниц`,
      countOfLimit: (count: number, max: number, label: string) => `${count} из ${max} · ${label}`,
      countOfMax: (count: number, max: number) => `${count} из ${max}`,
      limitReachedSuffix: "лимит достигнут",
      freeLimitReached: "Лимит Free достигнут",
      maximumReached: "Максимум достигнут · Pro",
      onePageRemaining: "Осталась 1 страница",
      processPages: (count: number) => `Обработать ${count} стр. →`,
      maximumPages: "Максимум 10 страниц за один скан",
      upgradeToPro: "Перейти на Pro · до 10 страниц",
      addToScan: "Добавить в скан",
      pdfFile: "PDF-файл",
      importFromFiles: "Импорт из Files",
      photosFromGallery: "Фото из галереи",
      selectPhotos: (max: number) => `Выберите до ${max} фото`,
      pdfSelected: "PDF готов",
      pdfCount: (count: number) => `${Math.max(count, 1)} файл`,
      freePdfWarning: (max: number) => `Free поддерживает максимум ${max} страницы за один скан`,
      processPdfFree: (max: number) => `Продолжить с лимитом ${max} стр. →`,
      processPdfAll: "Обработать PDF →",
      upgradePdf: "Pro обработает до 10 страниц",
      cameraAccessNeeded: "Нужен доступ к камере",
      cameraAccessBody: "Jasně нужен доступ к камере для сканирования документов. Его можно включить в настройках.",
      openSettings: "Открыть настройки",
      pickGalleryInstead: "Выбрать из галереи",
    },
    uk: {
      newScan: "Новий скан",
      flash: "Спалах",
      capture: "Сканувати",
      import: "Імпорт",
      done: "Готово",
      cancel: "Скасувати",
      pointCamera: "Наведіть камеру на документ",
      documentFound: "Документ знайдено",
      pageAdded: (count: number) => `Сторінку ${count} додано`,
      freeLimit: (max: number) => `Free · до ${max} сторінок`,
      proLimit: (max: number) => `Pro · до ${max} сторінок`,
      countOfLimit: (count: number, max: number, label: string) => `${count} з ${max} · ${label}`,
      countOfMax: (count: number, max: number) => `${count} з ${max}`,
      limitReachedSuffix: "ліміт досягнуто",
      freeLimitReached: "Ліміт Free досягнуто",
      maximumReached: "Максимум досягнуто · Pro",
      onePageRemaining: "Залишилась 1 сторінка",
      processPages: (count: number) => `Обробити ${count} стор. →`,
      maximumPages: "Максимум 10 сторінок за один скан",
      upgradeToPro: "Перейти на Pro · до 10 сторінок",
      addToScan: "Додати до скану",
      pdfFile: "PDF-файл",
      importFromFiles: "Імпорт із Files",
      photosFromGallery: "Фото з галереї",
      selectPhotos: (max: number) => `Виберіть до ${max} фото`,
      pdfSelected: "PDF готовий",
      pdfCount: (count: number) => `${Math.max(count, 1)} файл`,
      freePdfWarning: (max: number) => `Free підтримує максимум ${max} сторінки за один скан`,
      processPdfFree: (max: number) => `Продовжити з лімітом ${max} стор. →`,
      processPdfAll: "Обробити PDF →",
      upgradePdf: "Pro обробить до 10 сторінок",
      cameraAccessNeeded: "Потрібен доступ до камери",
      cameraAccessBody: "Jasně потрібен доступ до камери для сканування документів. Його можна ввімкнути в налаштуваннях.",
      openSettings: "Відкрити налаштування",
      pickGalleryInstead: "Вибрати з галереї",
    },
    en: {
      newScan: "New scan",
      flash: "Flash",
      capture: "Scan",
      import: "Import",
      done: "Done",
      cancel: "Cancel",
      pointCamera: "Point camera at document",
      documentFound: "Document found",
      pageAdded: (count: number) => `Page ${count} added`,
      freeLimit: (max: number) => `Free · up to ${max} pages`,
      proLimit: (max: number) => `Pro · up to ${max} pages`,
      countOfLimit: (count: number, max: number, label: string) => `${count} of ${max} · ${label}`,
      countOfMax: (count: number, max: number) => `${count} of ${max}`,
      limitReachedSuffix: "limit reached",
      freeLimitReached: "Free limit reached",
      maximumReached: "Maximum reached · Pro",
      onePageRemaining: "1 page remaining",
      processPages: (count: number) => `Process ${count} ${count === 1 ? "page" : "pages"} →`,
      maximumPages: "Maximum 10 pages per scan",
      upgradeToPro: "Upgrade to Pro · up to 10 pages",
      addToScan: "Add to scan",
      pdfFile: "PDF file",
      importFromFiles: "Import from Files app",
      photosFromGallery: "Photos from gallery",
      selectPhotos: (max: number) => `Select up to ${max} photos`,
      pdfSelected: "PDF is ready",
      pdfCount: (count: number) => `${Math.max(count, 1)} file`,
      freePdfWarning: (max: number) => `Free plan supports max ${max} pages per scan`,
      processPdfFree: (max: number) => `Continue with ${max}-page limit →`,
      processPdfAll: "Process PDF →",
      upgradePdf: "Pro processes up to 10 pages",
      cameraAccessNeeded: "Camera access needed",
      cameraAccessBody: "Jasně needs camera access to scan documents. You can enable it in Settings.",
      openSettings: "Open Settings",
      pickGalleryInstead: "Pick from gallery instead",
    },
  };

  return copies[language];
}

const scannerStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: scannerDark.bg },
  appBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: scannerDark.bg },
  appBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    flexShrink: 0,
  },
  appBarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: scannerDark.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  appBarTitleBlock: { alignItems: "center", justifyContent: "center" },
  appBarTitle: { color: scannerDark.ink, fontSize: 16, lineHeight: 18, fontWeight: "500" },
  subtitleRow: { marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  appBarSubtitle: { color: scannerDark.ink3, fontSize: 12, lineHeight: 14 },
  redText: { color: scannerDark.red },
  amberText: { color: scannerDark.amber },
  camera: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#000",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // Corner markers: top corners pushed 24pt from camera-top to give breathing
  // room below the AppBar. Bottom corners pushed 24pt to clear the thumbnail
  // strip overlay when present.
  corner: { position: "absolute", width: 14, height: 14, opacity: 0.45, borderColor: scannerDark.blue },
  cornerTL: { top: 24, left: 24, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 4 },
  cornerTR: { top: 24, right: 24, borderTopWidth: 1.5, borderRightWidth: 1.5, borderTopRightRadius: 4 },
  cornerBL: { bottom: 24, left: 24, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 24, right: 24, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 4 },
  emptyState: { alignItems: "center", gap: 14 },
  emptyHint: { color: scannerDark.ink3, fontSize: 14, lineHeight: 19, textAlign: "center" },
  previewWrap: {
    width: "70%",
    maxWidth: 280,
    aspectRatio: 0.72,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: scannerDark.surface3,
    borderWidth: 1,
    borderColor: scannerDark.blueLine,
  },
  previewImage: { width: "100%", height: "100%" },
  previewBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 32,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: scannerDark.blueDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBadgeText: { color: scannerDark.ink, fontSize: 12, fontWeight: "700" },
  previewPdf: {
    width: "70%",
    maxWidth: 280,
    minHeight: 180,
    borderRadius: 10,
    backgroundColor: scannerDark.surface2,
    borderWidth: 1,
    borderColor: scannerDark.blueLine,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 10,
  },
  previewPdfName: { color: scannerDark.ink, fontSize: 14, fontWeight: "500", maxWidth: "100%", textAlign: "center" },
  previewPdfCount: { color: scannerDark.ink3, fontSize: 12 },
  // Floats above the thumbnail strip (which lives at bottom:0). 110pt up
  // clears 80pt thumb + 16pt strip padding + breathing room.
  statusPill: {
    position: "absolute",
    bottom: 116,
    alignSelf: "center",
    minHeight: 28,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusPillGreen: { backgroundColor: scannerDark.surface2 },
  statusPillText: { fontSize: 13, lineHeight: 16, fontWeight: "600" },
  statusPillTextGreen: { color: scannerDark.green },
  // Thumbnail strip floats over the camera viewport at the bottom edge,
  // tight to the bottom action bar with a small breathing gap.
  thumbs: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
    flexGrow: 0,
  },
  thumbsContent: { paddingHorizontal: 16, gap: 10 },
  thumb: {
    width: 60,
    height: 80,
    borderRadius: 8,
    backgroundColor: scannerDark.surface3,
    borderWidth: 1,
    borderColor: scannerDark.blueLine,
    overflow: "hidden",
    position: "relative",
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbPdf: { flex: 1, alignItems: "center", justifyContent: "center" },
  thumbIndexBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbIndexText: { color: scannerDark.ink, fontSize: 11, fontWeight: "700" },
  thumbRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineError: { backgroundColor: scannerDark.redSoft, borderTopWidth: 1, borderTopColor: scannerDark.redLine, paddingHorizontal: 16, paddingVertical: 9 },
  inlineErrorText: { color: scannerDark.red, fontSize: 12, lineHeight: 17, textAlign: "center" },
  bottomBar: {
    flexShrink: 0,
    backgroundColor: scannerDark.bg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingHorizontal: 24,
    position: "relative",
    minHeight: 84,
  },
  sideAction: {
    alignItems: "center",
    gap: 6,
    minWidth: 64,
    minHeight: 56,
    paddingVertical: 4,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  sideActionText: { color: scannerDark.ink2, fontSize: 11, lineHeight: 14, fontWeight: "500" },
  shutterSlot: { width: 60 },
  doneAction: {
    minWidth: 64,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  doneText: { color: scannerDark.blue, fontSize: 15, lineHeight: 19, fontWeight: "500" },
  doneTextDisabled: { color: scannerDark.ink5 },
  shutterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 8,
    alignItems: "center",
    gap: 6,
    pointerEvents: "box-none",
  },
  // Idle: white ring + white inner dot, no gray fill. Camera-app shutter
  // convention. Pressed state slightly shrinks the inner dot.
  shutter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: scannerDark.ink,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  shutterInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: scannerDark.ink,
  },
  shutterPressed: { opacity: 0.7 },
  nearLimitLabel: { color: scannerDark.ink3, fontSize: 10, lineHeight: 12 },
  processBar: { flexShrink: 0, backgroundColor: scannerDark.bg, paddingTop: 14, paddingHorizontal: 16, gap: 10 },
  processButton: { height: 54, borderRadius: 12, backgroundColor: scannerDark.blueDeep, alignItems: "center", justifyContent: "center" },
  processButtonText: { color: scannerDark.ink, fontSize: 15, lineHeight: 18, fontWeight: "500" },
  processCaption: { color: scannerDark.ink4, fontSize: 10, textAlign: "center" },
  upgradeRibbon: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  upgradeText: { color: scannerDark.purple, fontSize: 11, lineHeight: 14 },
});

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,9,7,0.50)" },
  sheet: { backgroundColor: scannerDark.surface2, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 },
  handle: { width: 36, height: 4, borderRadius: 999, backgroundColor: scannerDark.ink3, alignSelf: "center", marginTop: 10 },
  sectionLabel: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8, color: scannerDark.ink4, fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  rows: { paddingHorizontal: 16 },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 6 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: scannerDark.surface3, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: scannerDark.ink, fontSize: 14, lineHeight: 18, fontWeight: "500" },
  rowDetail: { color: scannerDark.ink3, fontSize: 11, lineHeight: 14, marginTop: 1 },
  divider: { height: 1, backgroundColor: scannerDark.hairline, opacity: 0.6 },
  cancelButton: { height: 48, alignItems: "center", justifyContent: "center", marginHorizontal: 22, marginTop: 8, borderRadius: 12 },
  cancelButtonCompact: { height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  cancelText: { color: scannerDark.ink2, fontSize: 15, lineHeight: 20, fontWeight: "400" },
  pdfTop: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 18 },
  pdfIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: scannerDark.surface3, alignItems: "center", justifyContent: "center" },
  pdfTextBlock: { flex: 1, minWidth: 0 },
  pdfEyebrow: { color: scannerDark.ink4, fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  pdfTitle: { color: scannerDark.ink, fontSize: 15, lineHeight: 20, fontWeight: "500", marginTop: 2 },
  warningBlock: { marginHorizontal: 20, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: scannerDark.amberSoft, borderWidth: 1, borderColor: scannerDark.amberLine },
  warningText: { color: scannerDark.amber, fontSize: 12, lineHeight: 18 },
  ctaStack: { paddingHorizontal: 20, paddingTop: 14, gap: 10 },
  primaryButton: { height: 52, borderRadius: 12, backgroundColor: scannerDark.blueDeep, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: scannerDark.ink, fontSize: 15, lineHeight: 18, fontWeight: "500" },
  upgradeButton: { height: 50, borderRadius: 12, borderWidth: 1, borderColor: scannerDark.purpleLine, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  upgradeButtonText: { color: scannerDark.purple, fontSize: 14, lineHeight: 18, fontWeight: "500" },
});

const permissionStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: scannerDark.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  closeButton: { position: "absolute", top: 16, left: 20, width: 32, height: 32, borderRadius: 16, backgroundColor: scannerDark.surface2, alignItems: "center", justifyContent: "center" },
  title: { color: scannerDark.ink, fontSize: 17, lineHeight: 22, fontWeight: "600", textAlign: "center" },
  body: { color: scannerDark.ink3, fontSize: 14, lineHeight: 22, textAlign: "center", marginTop: 10, marginBottom: 22 },
  error: { color: scannerDark.red, fontSize: 12, lineHeight: 17, textAlign: "center", marginBottom: 18 },
  actions: { width: "100%", gap: 10 },
  primaryButton: { height: 52, borderRadius: 12, backgroundColor: scannerDark.blueDeep, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: scannerDark.ink, fontSize: 15, lineHeight: 18, fontWeight: "500" },
  secondaryButton: { height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: scannerDark.ink2, fontSize: 14, lineHeight: 18, fontWeight: "500" },
});
