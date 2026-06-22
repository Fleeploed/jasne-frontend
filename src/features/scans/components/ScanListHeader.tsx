import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { BrandWordmark } from "@/components/BrandMark";
import { Icon } from "@/components/Icon";
import { type ColorPalette } from "@/components/ui";
import { t } from "@/lib/i18n";

import type { ScanListStyles } from "./scanListStyles";
import type { DocumentCategoryFilter, DocumentCategoryFilterKey } from "./scanListData";

export function HomeHeader({
  styles,
  colors,
  searchOpen,
  search,
  onSearch,
  onToggleSearch,
  searchInputRef,
}: {
  styles: ScanListStyles;
  colors: ColorPalette;
  searchOpen: boolean;
  search: string;
  onSearch: (text: string) => void;
  onToggleSearch: () => void;
  searchInputRef: React.RefObject<TextInput>;
}) {
  if (searchOpen) {
    return (
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Icon name="search" size={18} color={colors.muted2} style={{ marginRight: 8 }} />
          <TextInput
            ref={searchInputRef}
            value={search}
            onChangeText={onSearch}
            placeholder={t("documents.searchPlaceholder")}
            placeholderTextColor={colors.muted3}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => onSearch("")}
              hitSlop={10}
              style={styles.searchClear}
              accessibilityLabel={t("documents.searchClearAria")}
            >
              <Icon name="x" size={18} color={colors.muted3} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={onToggleSearch}
          hitSlop={8}
          style={({ pressed }) => [styles.searchCancel, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.searchCancelText}>{t("common.cancel")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <BrandWordmark height={36} style={styles.logo} />
      <View style={styles.headerActions}>
        <Pressable
          onPress={onToggleSearch}
          hitSlop={6}
          style={({ pressed }) => [styles.searchIcon, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={t("documents.searchAria")}
        >
          <Icon name="search" size={22} color={colors.muted2} />
        </Pressable>
      </View>
    </View>
  );
}

export function DocumentCategoryFilterBar({
  filters,
  selected,
  styles,
  onSelect,
}: {
  filters: DocumentCategoryFilter[];
  selected: DocumentCategoryFilterKey;
  styles: ScanListStyles;
  onSelect: (filter: DocumentCategoryFilterKey) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = useMemo(
    () => Math.max(0, filters.findIndex((filter) => filter.key === selected)),
    [filters, selected],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      x: Math.max(0, selectedIndex * 104 - 16),
      animated: false,
    });
  }, [selectedIndex]);

  return (
    <View style={styles.categoryFilterShell}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryFilterContent}
      >
        {filters.map((filter) => {
          const active = filter.key === selected;
          const showCount = filter.key !== "all";
          return (
            <Pressable
              key={filter.key}
              onPress={() => onSelect(filter.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={showCount ? `${filter.label} ${filter.count}` : filter.label}
              style={({ pressed }) => [
                styles.categoryChip,
                active && styles.categoryChipActive,
                pressed && { opacity: 0.82 },
              ]}
            >
              <Text style={[styles.categoryChipLabel, active && styles.categoryChipLabelActive]} numberOfLines={1}>
                {filter.label}
              </Text>
              {showCount ? (
                <Text style={[styles.categoryChipCount, active && styles.categoryChipCountActive]}>
                  {filter.count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
