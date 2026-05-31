import { router, useLocalSearchParams } from "expo-router";

import { PaywallSheet } from "@/components/PaywallSheet";
import { Screen } from "@/components/ui";

export default function PaywallRoute() {
  useLocalSearchParams<{ source?: string }>();
  return (
    <Screen>
      <PaywallSheet visible onClose={() => router.back()} />
    </Screen>
  );
}
