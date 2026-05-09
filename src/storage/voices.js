import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cloned_voices_v1';

export async function loadVoices() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveVoices(voices) {
  await AsyncStorage.setItem(KEY, JSON.stringify(voices));
}

export async function addVoice(voice) {
  const voices = await loadVoices();
  const next = [voice, ...voices];
  await saveVoices(next);
  return next;
}

export async function removeVoice(voiceId) {
  const voices = await loadVoices();
  const next = voices.filter(v => v.id !== voiceId);
  await saveVoices(next);
  return next;
}
