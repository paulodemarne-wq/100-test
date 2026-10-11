import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

/**
 * Lets the user pick (or take) a square profile photo and copies it into the app's
 * documents folder, since picker results live in a cache the system may clear.
 * Returns the saved file URI, or null if cancelled.
 */
export async function pickProfilePhoto(source: 'library' | 'camera'): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Accès refusé',
      source === 'camera'
        ? "Autorise l'accès à l'appareil photo dans les Réglages pour prendre une photo."
        : "Autorise l'accès aux photos dans les Réglages pour choisir une photo.",
    );
    return null;
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;

  // Unique name so the <Image> doesn't show a cached older photo.
  const saved = new File(Paths.document, `avatar-${Date.now()}.jpg`);
  new File(result.assets[0].uri).copy(saved);
  return saved.uri;
}

export function askProfilePhoto(onPicked: (uri: string) => void, onRemove?: () => void) {
  const pick = async (source: 'library' | 'camera') => {
    const uri = await pickProfilePhoto(source);
    if (uri) onPicked(uri);
  };
  Alert.alert('Photo de profil', undefined, [
    { text: 'Prendre une photo', onPress: () => pick('camera') },
    { text: 'Choisir dans la galerie', onPress: () => pick('library') },
    ...(onRemove ? [{ text: 'Supprimer la photo', style: 'destructive' as const, onPress: onRemove }] : []),
    { text: 'Annuler', style: 'cancel' },
  ]);
}
