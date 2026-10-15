import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReminderSetting = { enabled: boolean; hour: number; minute: number };

const KEY = 'vainc/daily-reminder';
export const DEFAULT_REMINDER: ReminderSetting = { enabled: true, hour: 18, minute: 0 };

export async function loadReminder(): Promise<ReminderSetting> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_REMINDER, ...JSON.parse(raw) } : DEFAULT_REMINDER;
  } catch {
    return DEFAULT_REMINDER;
  }
}

export async function saveReminder(setting: ReminderSetting): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(setting)).catch(() => {});
}
