import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Returns true only when the device is *confirmed* offline.
 *
 * NetInfo's `isInternetReachable` is null until the first reachability probe
 * resolves; treating that unknown state as offline would flash the banner on
 * every cold start. So we report offline only on an explicit disconnect.
 */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return () => unsubscribe();
  }, []);

  return offline;
}
