import Constants from "expo-constants";
import { logger } from "@/lib/logger";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";
import { registerSignOutTask } from "@/lib/session";
import { TRACKINGS_QUERY_KEY } from "@/features/trackings/queryKeys";
import { queryClient } from "@/lib/queryClient";

const DEADLINE_CHANNEL_ID = "deadline-reminders";
const PUSH_TOKEN_STORAGE_KEY = "jasne_registered_push_token";

type NotificationData = Record<string, unknown>;
type NotificationsModule = typeof import("expo-notifications");
type NotificationSubscription = {
  remove: () => void;
};
type ConstantsWithEas = typeof Constants & {
  easConfig?: {
    projectId?: string | null;
  } | null;
};

let registrationPromise: Promise<string | null> | null = null;
let notificationsPromise: Promise<NotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;
// Identifiers of notification responses already routed, so the cold-start
// check (getLastNotificationResponseAsync) never re-fires a tap the live
// listener — or a previous mount — has handled.
const handledResponseIds = new Set<string>();

// While the session is still valid, tell the backend to stop sending pushes
// for this device — otherwise the previous account's notifications keep
// arriving after sign-out.
registerSignOutTask(unregisterPushToken);

export function syncPushTokenAfterSignIn() {
  if (registrationPromise) return registrationPromise;
  registrationPromise = registerForPushNotifications().finally(() => {
    registrationPromise = null;
  });
  return registrationPromise;
}

export function addNotificationTapListener(onTap: (data: NotificationData) => void): NotificationSubscription {
  if (Platform.OS === "web" || !Constants.isDevice) {
    return { remove: () => undefined };
  }

  let active = true;
  let nativeSubscription: NotificationSubscription | null = null;

  void getNotificationsModule().then(async (Notifications) => {
    if (!active || !Notifications) return;
    nativeSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handledResponseIds.add(response.notification.request.identifier);
      const data = response.notification.request.content.data ?? {};
      handleNotificationData(data);
      onTap(data);
    });

    // The tap that LAUNCHED the app (cold start) is never delivered to the
    // listener above — it happened before JS was running. Replay it once.
    const initialResponse = await Notifications.getLastNotificationResponseAsync().catch(() => null);
    if (!active || !initialResponse) return;
    const identifier = initialResponse.notification.request.identifier;
    if (handledResponseIds.has(identifier)) return;
    handledResponseIds.add(identifier);
    const data = initialResponse.notification.request.content.data ?? {};
    handleNotificationData(data);
    onTap(data);
  });

  return {
    remove: () => {
      active = false;
      nativeSubscription?.remove();
    },
  };
}

export function addNotificationReceivedListener(
  onReceive: (data: NotificationData) => void = () => undefined
): NotificationSubscription {
  if (Platform.OS === "web" || !Constants.isDevice) {
    return { remove: () => undefined };
  }

  let active = true;
  let nativeSubscription: NotificationSubscription | null = null;

  void getNotificationsModule().then((Notifications) => {
    if (!active || !Notifications) return;
    nativeSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data ?? {};
      handleNotificationData(data);
      onReceive(data);
    });
  });

  return {
    remove: () => {
      active = false;
      nativeSubscription?.remove();
    },
  };
}

async function registerForPushNotifications() {
  if (Platform.OS === "web" || !Constants.isDevice) return null;

  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(DEADLINE_CHANNEL_ID, {
      name: t("notifications.deadlineChannelName"),
      description: t("notifications.deadlineChannelDescription"),
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1B5FAC",
    });
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let permissionStatus = existingPermission.status;
  if (permissionStatus !== "granted") {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    permissionStatus = requestedPermission.status;
  }
  if (permissionStatus !== "granted") return null;

  const projectId = getProjectId();
  if (!projectId) {
    logger.warn("Push notifications skipped: missing EAS projectId.");
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await apiFetch("/push-tokens", {
    method: "POST",
    json: {
      expo_push_token: token,
      platform: Platform.OS,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: Constants.expoConfig?.extra?.locale ?? process.env.EXPO_PUBLIC_APP_LOCALE ?? null,
      app_version: Constants.expoConfig?.version ?? null,
    },
  });
  // Remember the registered token across restarts so sign-out can unregister
  // it without needing notification permissions/projectId again.
  void AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token).catch(() => {});

  return token;
}

async function unregisterPushToken() {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY).catch(() => null);
  if (!token) return;
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY).catch(() => {});
  try {
    await apiFetch("/push-tokens", {
      method: "DELETE",
      json: { expo_push_token: token },
    });
  } catch {
    // Best-effort: the backend may not support unregistration yet, and
    // sign-out must never be blocked by it.
  }
}

async function getNotificationsModule() {
  if (Platform.OS === "web") return null;

  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications")
      .then((Notifications) => {
        configureNotificationHandler(Notifications);
        return Notifications;
      })
      .catch((error) => {
        logger.warn("Push notifications unavailable in this native build", error);
        return null;
      });
  }

  return notificationsPromise;
}

function configureNotificationHandler(Notifications: NotificationsModule) {
  if (notificationHandlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowAlert: true,
    }),
  });
  notificationHandlerConfigured = true;
}

function handleNotificationData(data: NotificationData) {
  if (data.type === "tracking_status_change") {
    void queryClient.invalidateQueries({ queryKey: TRACKINGS_QUERY_KEY });
  }
}

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as ConstantsWithEas).easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    null
  );
}
