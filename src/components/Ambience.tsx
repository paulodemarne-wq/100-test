import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors } from '../lib/theme';

const SOUNDS = {
  none: { label: 'Silence', emoji: '🔇', source: null },
  rain: { label: 'Pluie', emoji: '🌧️', source: require('../../assets/sounds/rain.wav') },
  white: { label: 'Bruit blanc', emoji: '🌫️', source: require('../../assets/sounds/white.wav') },
  brown: { label: 'Bruit brun', emoji: '🌊', source: require('../../assets/sounds/brown.wav') },
} as const;

type SoundId = keyof typeof SOUNDS;
const STORAGE_KEY = 'lockin/ambience';

/** Ambient sound picker. The sound loops while `playing` is true. */
export function Ambience({ playing }: { playing: boolean }) {
  const [sound, setSound] = useState<SoundId>('none');
  const player = useAudioPlayer(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => v && v in SOUNDS && setSound(v as SoundId))
      .catch(() => {});
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    const source = SOUNDS[sound].source;
    if (!source) {
      player.pause();
      return;
    }
    player.replace(source);
    player.loop = true;
    player.volume = 0.7;
  }, [sound, player]);

  useEffect(() => {
    if (playing && SOUNDS[sound].source) player.play();
    else player.pause();
  }, [playing, sound, player]);

  const choose = (id: SoundId) => {
    Haptics.selectionAsync();
    setSound(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
      {(Object.keys(SOUNDS) as SoundId[]).map((id) => (
        <Pressable key={id} onPress={() => choose(id)} style={[styles.chip, sound === id && styles.chipOn]}>
          <Text style={[styles.text, sound === id && styles.textOn]}>
            {SOUNDS[id].emoji} {SOUNDS[id].label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, alignSelf: 'stretch', marginHorizontal: -20 },
  row: { gap: 8, paddingHorizontal: 20 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accentSoft },
  text: { fontSize: 14, color: colors.secondary, fontWeight: '500' },
  textOn: { color: colors.accent, fontWeight: '600' },
});
