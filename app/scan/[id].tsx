import { useLocalSearchParams } from "expo-router";

import { ChatThreadScreen } from "@/features/chat/ChatThreadScreen";

export default function ScanRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Force a fresh mount when the scan id changes — prevents the previous chat
  // from flashing while the new one's data is loading.
  return <ChatThreadScreen key={id ?? "pending"} />;
}
