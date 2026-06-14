import { Text, View } from "react-native";
import type { DeadlinesStyles } from "@/features/deadlines/components/deadlinesStyles";

export function UrgencyDot({
  count,
  label,
  dotColor,
  styles,
}: {
  count: number;
  label: string;
  dotColor: string;
  styles: DeadlinesStyles;
}) {
  if (count === 0) return null;
  return (
    <View style={styles.urgencyChip}>
      <View style={[styles.urgencyDot, { backgroundColor: dotColor }]} />
      <Text style={styles.urgencyChipText}>
        <Text style={styles.urgencyChipCount}>{count}</Text> {label}
      </Text>
    </View>
  );
}

