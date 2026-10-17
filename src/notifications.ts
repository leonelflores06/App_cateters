import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { listReminders, setReminderNotif, type Reminder } from './db';
import { describeSchedule, expoWeekday, nextOccurrence, parseTime, type ReminderInput } from './reminders';

const CHANNEL_ID = 'recordatorios';

// Mostrar el aviso también cuando la app está abierta.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Crea el canal de Android (necesario para que Android 13+ muestre el pedido de permiso). */
export async function setupNotifications() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Recordatorios',
    // eslint-disable-next-line import/namespace -- AndroidImportance se re-exporta con export *; el plugin no lo sigue
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** Pide permiso para mostrar notificaciones. Devuelve true si quedó permitido. */
export async function ensureNotificationPermission(): Promise<boolean> {
  await setupNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/** Sin alarmas exactas, Android puede demorar el aviso unos minutos. */
export async function hasExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return (await Notifications.getExactAlarmPermissionsAsync()).granted;
  } catch {
    return true;
  }
}

/** Abre los ajustes de Android para permitir alarmas exactas. */
export async function requestExactAlarms(): Promise<boolean> {
  try {
    return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

function triggerFor(r: ReminderInput): Notifications.SchedulableNotificationTriggerInput | null {
  const t = parseTime(r.time);
  if (!t) return null;
  const base = { channelId: CHANNEL_ID };
  if (r.repeat === 'daily') {
    return { ...base, type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: t.hour, minute: t.minute };
  }
  if (r.repeat === 'weekly') {
    return {
      ...base,
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: expoWeekday(r.day),
      hour: t.hour,
      minute: t.minute,
    };
  }
  const date = nextOccurrence(r);
  return date ? { ...base, type: Notifications.SchedulableTriggerInputTypes.DATE, date } : null;
}

/** Programa la notificación del recordatorio. Devuelve su id, o null si ya no corresponde (pasó). */
export async function scheduleReminder(r: ReminderInput): Promise<string | null> {
  const trigger = triggerFor(r);
  if (!trigger) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title: r.title, body: `Stock Catéteres · ${describeSchedule(r)}` },
    trigger,
  });
}

export async function cancelReminder(notifId: string | null) {
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {
    // ya no estaba programada
  }
}

/**
 * Al abrir la app: vuelve a programar los recordatorios que Android haya perdido
 * (por ejemplo después de actualizar el APK) y limpia los de una vez que ya pasaron.
 */
export async function resyncReminders(): Promise<Reminder[]> {
  const reminders = await listReminders();
  if (!reminders.length) return reminders;
  const granted = (await Notifications.getPermissionsAsync()).granted;
  if (!granted) return reminders;
  await setupNotifications();
  const scheduled = new Set((await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier));
  for (const r of reminders) {
    if (r.notif_id && scheduled.has(r.notif_id)) continue;
    const id = nextOccurrence(r) ? await scheduleReminder(r) : null;
    if (id !== r.notif_id) {
      await setReminderNotif(r.id, id);
      r.notif_id = id;
    }
  }
  return reminders;
}
