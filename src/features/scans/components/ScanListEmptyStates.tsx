import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { LimitsResponse } from "@/lib/types";

import type { ScanListStyles } from "./scanListStyles";

export function ListLoadingFooter({ color, styles }: { color: string; styles: ScanListStyles }) {
  return (
    <View style={styles.listFooter}>
      <ActivityIndicator color={color} />
    </View>
  );
}

export function SearchEmpty({ query, colors, styles }: {
  query: string;
  colors: ColorPalette;
  styles: ScanListStyles;
}) {
  return (
    <View style={styles.searchEmpty}>
      <Icon name="search" size={40} color={colors.muted3} />
      <Text style={styles.searchEmptyTitle}>{t("documents.searchEmptyTitle")}</Text>
      <Text style={styles.searchEmptyDetail}>
        {t("documents.searchEmptyDetail", { query })}
      </Text>
    </View>
  );
}

export function CategoryEmpty({ category, colors, styles }: {
  category: string;
  colors: ColorPalette;
  styles: ScanListStyles;
}) {
  return (
    <View style={styles.searchEmpty}>
      <Icon name="doc-text" size={40} color={colors.muted3} />
      <Text style={styles.searchEmptyTitle}>{t("documents.categoryEmptyTitle")}</Text>
      <Text style={styles.searchEmptyDetail}>
        {t("documents.categoryEmptyDetail", { category })}
      </Text>
    </View>
  );
}

export function OfflineState({
  onRetry,
  colors,
  styles,
}: {
  onRetry: () => void;
  colors: ColorPalette;
  styles: ScanListStyles;
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyHeroIcon, styles.offlineHeroIcon]}>
        <Icon name="alert" size={44} color={colors.muted2} />
      </View>
      <Text style={styles.emptyHeroTitle}>{t("common.offlineTitle")}</Text>
      <Text style={styles.emptyHeroDetail}>{t("common.offlineDetail")}</Text>

      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t("common.tryAgain")}
      >
        <Text style={styles.emptyCtaText}>{t("common.tryAgain")}</Text>
      </Pressable>
    </View>
  );
}

export function DocumentsEmpty({
  limits,
  scanDisabled,
  scanUpgradeAvailable,
  onScan,
  colors,
  styles,
}: {
  limits: LimitsResponse | null;
  scanDisabled: boolean;
  scanUpgradeAvailable: boolean;
  onScan: () => void;
  colors: ColorPalette;
  styles: ScanListStyles;
}) {
  const planFooter = limits?.plan === "pro"
    ? t("documents.emptyFooterPro")
    : t("documents.emptyFooterFree");

  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyHeroIcon}>
        <View style={styles.emptyHeroFile}>
          <Icon name="doc-text" size={44} color={colors.primary} />
        </View>
      </View>
      <Text style={styles.emptyHeroTitle}>{t("documents.emptyTitle")}</Text>
      <Text style={styles.emptyHeroDetail}>{t("documents.emptyDetail")}</Text>

      <Pressable
        disabled={scanDisabled}
        onPress={onScan}
        style={({ pressed }) => [
          styles.emptyCta,
          scanUpgradeAvailable && styles.emptyCtaPro,
          scanDisabled && styles.fabDisabled,
          pressed && !scanDisabled && styles.pressed,
        ]}
      >
        <Icon name={scanUpgradeAvailable ? "star" : "camera"} size={24} color={colors.textOnAccent} />
        <Text style={styles.emptyCtaText}>{scanUpgradeAvailable ? t("documents.goPro") : t("documents.emptyButton")}</Text>
      </Pressable>

      <Text style={styles.emptyPlanFooter}>{planFooter}</Text>
    </View>
  );
}
