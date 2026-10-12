// Lockin+ timer look (theme, pet next to the timer). Only cosmetic, so kept on the phone.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type ChronoTheme = { id: string; name: string; ring: [string, string]; blobs: [string, string, string] };

export const CHRONO_THEMES: ChronoTheme[] = [
  { id: 'classic', name: 'Classique', ring: ['#5856D6', '#5856D6'], blobs: ['#5856D6', '#AF52DE', '#30B0C7'] },
  { id: 'fire', name: 'Feu', ring: ['#FFB020', '#FF3D00'], blobs: ['#FF6B3D', '#FFB020', '#FF2D55'] },
  { id: 'ocean', name: 'Océan', ring: ['#22D3EE', '#1C5FA8'], blobs: ['#3BA7F5', '#22D3EE', '#5856D6'] },
  { id: 'neon', name: 'Néon', ring: ['#A3E635', '#F0ABFC'], blobs: ['#22D3EE', '#A3E635', '#F0ABFC'] },
  { id: 'gold', name: 'Or', ring: ['#FFE58A', '#C98A00'], blobs: ['#F5B400', '#FFD86B', '#FF9500'] },
  { id: 'sakura', name: 'Sakura', ring: ['#FFB3D1', '#C24D86'], blobs: ['#FF9CC8', '#FFD6E4', '#C77DFF'] },
];

export type ChronoPrefs = { theme: string; pet: boolean };
const KEY = 'lockin/chrono';
let current: ChronoPrefs = { theme: 'classic', pet: true };
const listeners = new Set<(p: ChronoPrefs) => void>();
let loaded = false;

export function setChronoPrefs(patch: Partial<ChronoPrefs>) {
  current = { ...current, ...patch };
  listeners.forEach((l) => l(current));
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
}

export function useChronoPrefs(): ChronoPrefs {
  const [prefs, setPrefs] = useState(current);
  useEffect(() => {
    listeners.add(setPrefs);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY)
        .then((raw) => raw && setChronoPrefs(JSON.parse(raw)))
        .catch(() => {});
    }
    return () => {
      listeners.delete(setPrefs);
    };
  }, []);
  return prefs;
}

export const themeOf = (id: string) => CHRONO_THEMES.find((t) => t.id === id) ?? CHRONO_THEMES[0];
