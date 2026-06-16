import type { PickedUpload } from "@/features/scans/scansApi";
import { t } from "@/lib/i18n";
import type { CameraDevice } from "react-native-vision-camera";

export type ScannerCopy = ReturnType<typeof getScannerCopy>;
export type CameraFocusPoint = { x: number; y: number; key: number };
export type CameraTapPoint = { x: number; y: number };
export type CameraZoomLevel = { label: string; value: number; displayValue: number };

export const CAMERA_MAX_ZOOM_FACTOR = 6;
export const CAMERA_DISPLAY_ZOOM_LEVELS = [0.5, 1, 2, 3];
export const CAMERA_ZOOM_SWIPE_DISTANCE = 520;
export const CAMERA_ZOOM_SWIPE_ACTIVATE_DX = 9;
export const CAMERA_ZOOM_HIDE_DELAY_MS = 650;
export const SHUTTER_BLACKOUT_MS = 180;

type ZoomCapableDevice = Pick<CameraDevice, "minZoom" | "maxZoom" | "neutralZoom">;

export function cameraDefaultZoom(device?: Pick<CameraDevice, "neutralZoom">) {
  return device?.neutralZoom ?? 1;
}

// VisionCamera exposes native zoom factors. The UI shows iPhone-style zoom
// relative to the wide/neutral lens: displayZoom = nativeZoom / neutralZoom.
export function cameraDisplayZoomForNative(value: number, device?: Pick<CameraDevice, "neutralZoom">) {
  return value / Math.max(cameraDefaultZoom(device), 0.1);
}

export function cameraNativeZoomForDisplay(value: number, device?: Pick<CameraDevice, "neutralZoom">) {
  return value * cameraDefaultZoom(device);
}

export function cameraZoomBounds(device?: ZoomCapableDevice) {
  const defaultZoom = cameraDefaultZoom(device);
  const minZoom = Math.max(device?.minZoom ?? defaultZoom, 0.1);
  const maxZoom = Math.max(minZoom, Math.min(device?.maxZoom ?? CAMERA_MAX_ZOOM_FACTOR, CAMERA_MAX_ZOOM_FACTOR));
  return { minZoom, maxZoom };
}

export function clampCameraZoom(value: number, device?: ZoomCapableDevice) {
  const { minZoom, maxZoom } = cameraZoomBounds(device);
  return Math.max(minZoom, Math.min(maxZoom, value));
}

export function cameraZoomLevelsForDevice(device?: ZoomCapableDevice) {
  const { minZoom, maxZoom } = cameraZoomBounds(device);
  const levels = CAMERA_DISPLAY_ZOOM_LEVELS.flatMap((displayValue) => {
    const nativeValue = cameraNativeZoomForDisplay(displayValue, device);
    if (nativeValue < minZoom - 0.05 || nativeValue > maxZoom + 0.05) return [];
    return [{ label: formatCameraZoomLabel(displayValue), value: clampCameraZoom(nativeValue, device), displayValue }];
  });
  if (levels.length > 0) return levels;
  const displayValue = cameraDisplayZoomForNative(minZoom, device);
  return [{ label: formatCameraZoomLabel(displayValue), value: minZoom, displayValue }];
}

export function nearestCameraZoomLevel(value: number, levels: CameraZoomLevel[]) {
  return levels.reduce((best, level) =>
    Math.abs(level.value - value) < Math.abs(best.value - value) ? level : best
  );
}

export function formatCameraZoomLabel(value: number) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.08) return `${rounded}x`;
  return `${value.toFixed(1)}x`;
}

export const stepLabels: Record<string, ReturnType<typeof t>> = {
  preparing_inputs: t("scan.step.preparing_inputs"),
  ocr: t("scan.step.ocr"),
  classified: t("scan.step.classified"),
  rag: t("scan.step.rag"),
  analysis: t("scan.step.analysis"),
  saving: t("scan.step.saving")
};

export function isImageUpload(file: PickedUpload) {
  if (file.mimeType?.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(file.name) || /\.(jpe?g|png|gif|webp|heic)$/i.test(file.uri);
}

export function subtitleForState(copy: ScannerCopy, count: number, maxPages: number, isPro: boolean, limitReached: boolean) {
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

export function isPdfUpload(file: PickedUpload) {
  return file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * Decide whether to delete the just-uploaded storage objects after a scan
 * stream ends. Only true when the backend explicitly reported an error (no
 * scan was persisted) — the single case where the uploaded files are truly
 * orphaned. A transport/SSE drop (stream throws with neither a `done` nor an
 * `error` event) is ambiguous: the backend may have already created the scan
 * record that references these objects, so we keep the files and let backend
 * orphan-cleanup handle the rare leak. Deleting them here would strand a scan
 * with missing files — the worse failure.
 */
export function shouldCleanupUploadedStorage(args: {
  uploadedPaths: string[] | null;
  scanCreated: boolean;
  backendErrored: boolean;
}): boolean {
  return Boolean(args.uploadedPaths?.length) && !args.scanCreated && args.backendErrored;
}

export function getScannerCopy(locale: string) {
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
      pdfPickerTitle: "Vybrat stránky PDF",
      pdfPickerTotal: (total: number) => `${total} stran celkem`,
      pdfPickerAdd: (count: number) => `Přidat ${count} ${count === 1 ? "stranu" : "strany"} →`,
      pdfRendering: "Načítám stránky…",
      pdfConverting: "Zpracovávám…",
      pdfRenderError: "Nepodařilo se načíst stránky PDF",
      freePdfWarning: (max: number) => `Free plán podporuje max ${max} strany na jeden sken`,
      upgradePdf: "Pro zpracuje až 10 stran",
      cameraAccessNeeded: "Je potřeba přístup ke kameře",
      cameraAccessBody: "Jasně potřebuje kameru ke skenování dokumentů. Přístup můžeš povolit v Nastavení.",
      openSettings: "Otevřít Nastavení",
      pickGalleryInstead: "Vybrat z galerie",
      preview: "Náhled",
      previewPageOf: (page: number, total: number) => `Strana ${page} z ${total}`,
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
      pdfPickerTitle: "Выберите страницы PDF",
      pdfPickerTotal: (total: number) => `${total} стр. всего`,
      pdfPickerAdd: (count: number) => `Добавить ${count} стр. →`,
      pdfRendering: "Открываю PDF…",
      pdfConverting: "Конвертирую…",
      pdfRenderError: "Не удалось загрузить страницы PDF",
      freePdfWarning: (max: number) => `Free поддерживает максимум ${max} страницы за один скан`,
      upgradePdf: "Pro обработает до 10 страниц",
      cameraAccessNeeded: "Нужен доступ к камере",
      cameraAccessBody: "Jasně нужен доступ к камере для сканирования документов. Его можно включить в настройках.",
      openSettings: "Открыть настройки",
      pickGalleryInstead: "Выбрать из галереи",
      preview: "Предпросмотр",
      previewPageOf: (page: number, total: number) => `Стр. ${page} из ${total}`,
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
      pdfPickerTitle: "Виберіть сторінки PDF",
      pdfPickerTotal: (total: number) => `${total} стор. всього`,
      pdfPickerAdd: (count: number) => `Додати ${count} стор. →`,
      pdfRendering: "Відкриваю PDF…",
      pdfConverting: "Конвертую…",
      pdfRenderError: "Не вдалося завантажити сторінки PDF",
      freePdfWarning: (max: number) => `Free підтримує максимум ${max} сторінки за один скан`,
      upgradePdf: "Pro обробить до 10 сторінок",
      cameraAccessNeeded: "Потрібен доступ до камери",
      cameraAccessBody: "Jasně потрібен доступ до камери для сканування документів. Його можна ввімкнути в налаштуваннях.",
      openSettings: "Відкрити налаштування",
      pickGalleryInstead: "Вибрати з галереї",
      preview: "Перегляд",
      previewPageOf: (page: number, total: number) => `Стор. ${page} з ${total}`,
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
      pdfPickerTitle: "Select PDF pages",
      pdfPickerTotal: (total: number) => `${total} pages total`,
      pdfPickerAdd: (count: number) => `Add ${count} ${count === 1 ? "page" : "pages"} →`,
      pdfRendering: "Opening PDF…",
      pdfConverting: "Converting…",
      pdfRenderError: "Could not load PDF pages",
      freePdfWarning: (max: number) => `Free plan supports max ${max} pages per scan`,
      upgradePdf: "Pro processes up to 10 pages",
      cameraAccessNeeded: "Camera access needed",
      cameraAccessBody: "Jasně needs camera access to scan documents. You can enable it in Settings.",
      openSettings: "Open Settings",
      pickGalleryInstead: "Pick from gallery instead",
      preview: "Preview",
      previewPageOf: (page: number, total: number) => `Page ${page} of ${total}`,
    },
  };

  return copies[language];
}
