import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { AppBar, Button, EmptyState, ErrorText, Field, Screen, useColors, type ColorPalette } from "@/components/ui";
import { completeDeadline, createManualDeadline, listDeadlines } from "@/features/deadlines/deadlinesApi";
import { formatLocalizedDate, t } from "@/lib/i18n";
import type { DeadlineResponse, DeadlineType } from "@/lib/types";

export function DeadlinesScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [deadlines, setDeadlines] = useState<DeadlineResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDeadlines(await listDeadlines(true));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("deadlines.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function markDone(deadlineId: string) {
    try {
      const updated = await completeDeadline(deadlineId);
      setDeadlines((current) => current.filter((item) => item.id !== updated.id));
    } catch (doneError) {
      setError(doneError instanceof Error ? doneError.message : t("deadlines.completeError"));
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar title={t("deadlines.title")} />
      <View style={styles.header}>
        <Text style={styles.heading}>{t("deadlines.upcoming")}</Text>
        <Button title={t("deadlines.addManual")} onPress={() => setModalOpen(true)} variant="secondary" />
      </View>
      <ErrorText message={error} />
      <FlatList
        data={deadlines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={deadlines.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        ListEmptyComponent={<EmptyState title={t("deadlines.emptyTitle")} detail={t("deadlines.emptyDetail")} />}
        renderItem={({ item }) => (
          <View style={styles.deadline}>
            <View style={[styles.spine, { backgroundColor: getUrgencyColor(item.due_date, colors) }]} />
            <View style={styles.deadlineBody}>
              <View style={styles.deadlineTop}>
                <Text style={styles.date}>{formatDate(item.due_date)}</Text>
                <Text style={styles.typePill}>{deadlineTypeLabel(item.deadline_type)}</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
              <Text style={styles.meta}>{item.auto_created ? t("deadlines.auto") : t("deadlines.manual")} · {statusLabel(item.status)}</Text>
              <View style={styles.pillRow}>
                <Pressable style={styles.remindPill}>
                  <Text style={styles.remindPillText}>{t("deadlines.remind")}</Text>
                </Pressable>
                <Pressable onPress={() => void markDone(item.id)} style={styles.donePill}>
                  <Text style={styles.donePillText}>{t("deadlines.markDone")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />
      <ManualDeadlineModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(deadline) => setDeadlines((current) => [...current, deadline].sort((a, b) => a.due_date.localeCompare(b.due_date)))}
      />
    </Screen>
  );
}

function ManualDeadlineModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (deadline: DeadlineResponse) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [type, setType] = useState<DeadlineType>("action");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const deadline = await createManualDeadline({
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate.trim(),
        deadline_type: type
      });
      onCreated(deadline);
      setTitle("");
      setDescription("");
      setDueDate("");
      setType("action");
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("deadlines.createError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen>
        <View style={styles.modal}>
          <Text style={styles.heading}>{t("deadlines.manualTitle")}</Text>
          <Field value={title} onChangeText={setTitle} placeholder={t("deadlines.name")} />
          <Field value={dueDate} onChangeText={setDueDate} placeholder="Datum YYYY-MM-DD" />
          <Field value={description} onChangeText={setDescription} placeholder={t("deadlines.note")} multiline />
          <View style={styles.typeRow}>
            {(["action", "payment", "response", "expiration"] as DeadlineType[]).map((item) => (
              <Pressable key={item} onPress={() => setType(item)} style={[styles.typeChip, type === item && styles.activeType]}>
                <Text style={[styles.typeText, type === item && styles.activeTypeText]}>{deadlineTypeLabel(item)}</Text>
              </Pressable>
            ))}
          </View>
          <ErrorText message={error} />
          <Button title={t("common.create")} onPress={save} loading={saving} disabled={!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())} />
          <Button title={t("common.close")} onPress={onClose} variant="secondary" disabled={saving} />
        </View>
      </Screen>
    </Modal>
  );
}

function formatDate(value: string) {
  return formatLocalizedDate(new Date(`${value}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" });
}

function deadlineTypeLabel(type: DeadlineType) {
  const labels: Record<DeadlineType, string> = {
    action: t("deadlineType.action"),
    payment: t("deadlineType.payment"),
    response: t("deadlineType.response"),
    expiration: t("deadlineType.expiration")
  };
  return labels[type];
}

function statusLabel(status: DeadlineResponse["status"]) {
  const labels: Record<DeadlineResponse["status"], string> = {
    active: t("deadlineStatus.active"),
    completed: t("deadlineStatus.completed"),
    missed: t("deadlineStatus.missed")
  };
  return labels[status];
}

function getUrgencyColor(value: string, colors: ColorPalette) {
  const today = new Date();
  const dueDate = new Date(`${value}T12:00:00Z`);
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 7) return colors.danger;
  if (diffDays <= 30) return colors.amber;
  return colors.green;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12
    },
    heading: { color: colors.text, fontSize: 30, fontWeight: "800" },
    list: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      paddingBottom: 100,
      gap: 12
    },
    emptyList: { flexGrow: 1, justifyContent: "center" },
    deadline: {
      flexDirection: "row",
      borderRadius: 20,
      backgroundColor: colors.surface,
      overflow: "hidden",
      shadowColor: "#1E1B17",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1
    },
    spine: { width: 4 },
    deadlineBody: {
      flex: 1,
      paddingHorizontal: 18,
      paddingVertical: 16,
      gap: 4
    },
    deadlineTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    title: { color: colors.text, fontSize: 15, fontWeight: "600" },
    date: { color: colors.text, fontSize: 22, fontWeight: "800" },
    typePill: {
      color: colors.amberDark,
      backgroundColor: colors.amberLight,
      borderRadius: 999,
      overflow: "hidden",
      paddingHorizontal: 7,
      paddingVertical: 2,
      fontSize: 10,
      fontWeight: "800"
    },
    description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
    meta: { color: colors.muted, fontSize: 12 },
    pillRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    remindPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.blueSoft
    },
    remindPillText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
    donePill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.surface2
    },
    donePillText: { color: colors.muted2, fontSize: 13, fontWeight: "600" },
    modal: { flex: 1, padding: 20, gap: 12, backgroundColor: colors.bg },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    typeChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface
    },
    activeType: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeText: { color: colors.text, fontWeight: "700" },
    activeTypeText: { color: colors.textOnAccent }
  });
}
