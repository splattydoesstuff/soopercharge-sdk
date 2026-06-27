import * as Notifications from "expo-notifications";

/**
 * Configure notification handler
 */
export function setupNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Check notification permissions without showing a system prompt.
 */
export async function hasNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/**
 * Schedule a local notification
 */
export async function scheduleNotification(
  title: string,
  body: string,
  triggerSeconds?: number
): Promise<string> {
  const canNotify = await hasNotificationPermissions();
  if (!canNotify) {
    console.warn("[Notifications] Skipping notification because permission is not granted");
    return "skipped:no-notification-permission";
  }

  const trigger = triggerSeconds
    ? {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: triggerSeconds,
      } as const
    : null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
    },
    trigger,
  });

  return id;
}

/**
 * Send an immediate notification
 */
export async function sendImmediateNotification(title: string, body: string): Promise<string> {
  return scheduleNotification(title, body);
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}
