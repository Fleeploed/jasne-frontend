import Constants from "expo-constants";
import { Platform } from "react-native";

import { apiFetch } from "@/lib/api";
import { TRACKINGS_QUERY_KEY } from "@/features/trackings/queryKeys";
import { queryClient } from "@/lib/queryClient";

const DEADLINE_CHANNEL_ID = "deadline-reminders";

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

  void getNotificationsModule().then((Notifications) => {
    if (!active || !Notifications) return;
    nativeSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      handleNotificationData(data);
      onTap(data);
    });
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
      name: "Deadline reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6FA0E6",
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
    console.warn("Push notifications skipped: missing EAS projectId.");
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

  return token;
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
        console.warn("Push notifications unavailable in this native build", error);
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
