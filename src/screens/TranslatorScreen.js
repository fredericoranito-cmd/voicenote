import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;

const LANGUAGES = [
  { code: 'en', label: 'Inglês' },
  { code: 'es', label: 'Espanhol' },
  { code: 'fr', label: 'Francês' },
  { code: 'de', label: 'Alemão' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'zh', label: 'Chinês' },
  { code: 'ja', label: 'Japonês' },
  { code: 'ar', label: 'Árabe' },
];

export default function TranslatorScreen({ route, navigation }) {
  const voiceId = route.params?.voiceId;
  const voiceName = route.params?.voiceName ?? 'Voz';

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sourceLang, setSourceLang] = useState(null);
  const [translation, setTranslation] = useState('');
  const [targetLang, setTargetLang] = useState('en');
  const [error, setError] = useState('');
  const [sound, setSound] = useState(null);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync().catch(() => {});
    };
  }, [sound]);

  // If user opens Translator without selecting a voice, send them back.
  useEffect(() => {
    if (!voiceId) {
      setError('Nenhuma voz selecionada. Volta a "Vozes" e escolhe uma.');
    }
  }, [voiceId]);

  // Re-translate when target language changes (and we already have a transcript).
  useEffect(() => {
    if (!transcript) return;
    if (sourceLang && sourceLang === targetLang) {
      setTranslation(transcript);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const t = await translateText(transcript, targetLang);
        if (!cancelled) setTranslation(t);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [targetLang, sourceLang]);

  async function translateText(text, langCode) {
    const langLabel = LANGUAGES.find(l => l.code === langCode)?.label ?? langCode;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a translation engine. Translate the user's text into ${langLabel}. Output ONLY the translated text — no explanations, no quotation marks, no prefixes, no commentary, no metadata about yourself. If the input is already in ${langLabel}, output it unchanged.`,
          },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Tradução falhou (HTTP ${res.status}): ${body.substring(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  async function startRecording() {
    setError('');
    setTranscript('');
    setTranslation('');
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setError('Permissão de microfone negada.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (e) {
      setError('Erro ao iniciar gravação: ' + e.message);
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    setIsProcessing(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      await transcribeAndTranslate(uri);
    } catch (e) {
      setError('Erro ao parar gravação: ' + e.message);
      setIsProcessing(false);
    }
  }

  async function transcribeAndTranslate(uri) {
    try {
      const formData = new FormData();
      formData.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' });
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });
      if (!whisperRes.ok) {
        const body = await whisperRes.text();
        console.log('Whisper error:', body);
        throw new Error(`Whisper falhou (HTTP ${whisperRes.status}): ${body.substring(0, 200)}`);
      }
      const whisperData = await whisperRes.json();
      const text = whisperData.text;
      const detectedLang = whisperData.language; // e.g. "portuguese", "english"
      if (!text) throw new Error('Whisper devolveu resposta sem texto.');
      setTranscript(text);

      // Whisper returns full language names; map to our codes.
      const langCode = mapWhisperLangToCode(detectedLang);
      setSourceLang(langCode);

      if (langCode && langCode === targetLang) {
        setTranslation(text);
      } else {
        const t = await translateText(text, targetLang);
        setTranslation(t);
      }
    } catch (e) {
      console.log('transcribeAndTranslate error:', e);
      setError(e.message || 'Erro desconhecido na transcrição.');
    } finally {
      setIsProcessing(false);
    }
  }

  function mapWhisperLangToCode(name) {
    if (!name) return null;
    const map = {
      portuguese: 'pt',
      english: 'en',
      spanish: 'es',
      french: 'fr',
      german: 'de',
      italian: 'it',
      chinese: 'zh',
      japanese: 'ja',
      arabic: 'ar',
    };
    return map[name.toLowerCase()] ?? null;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function playTranslation() {
    if (!translation || !voiceId) return;
    setError('');
    setIsSpeaking(true);
    try {
      // Route audio to loudspeaker (after recording iOS routes to earpiece by default).
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: translation,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`TTS falhou (HTTP ${response.status}): ${body.substring(0, 200)}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const uri = FileSystem.documentDirectory + 'tts.mp3';
      await FileSystem.writeAsStringAsync(uri, arrayBufferToBase64(arrayBuffer), {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (sound) {
        await sound.unloadAsync().catch(() => {});
      }
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { volume: 1.0, shouldPlay: true }
      );
      setSound(newSound);
    } catch (e) {
      console.log('playTranslation error:', e);
      setError(e.message || 'Erro ao reproduzir tradução.');
    } finally {
      setIsSpeaking(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.voiceBadge}>
        <Text style={styles.voiceBadgeLabel}>Voz seleccionada:</Text>
        <Text style={styles.voiceBadgeName}>{voiceName}</Text>
      </View>

      <TouchableOpacity
        style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isProcessing || !voiceId}
      >
        <Text style={styles.recordBtnText}>
          {isRecording ? 'Parar' : 'Falar'}
        </Text>
      </TouchableOpacity>

      {isProcessing && (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color="#6C63FF" />
          <Text style={styles.processingText}>A transcrever e traduzir...</Text>
        </View>
      )}

      <Text style={styles.label}>Texto falado</Text>
      <View style={styles.textBox}>
        <Text style={styles.resultText}>{transcript || '—'}</Text>
      </View>

      <Text style={styles.label}>Traduzir para</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
        {LANGUAGES.map(lang => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.langBtn, targetLang === lang.code && styles.langBtnActive]}
            onPress={() => setTargetLang(lang.code)}
          >
            <Text style={[styles.langText, targetLang === lang.code && styles.langTextActive]}>
              {lang.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>Texto traduzido</Text>
      <View style={styles.textBox}>
        <Text style={styles.resultText}>{translation || '—'}</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, (!translation || isSpeaking) && styles.buttonDisabled]}
        onPress={playTranslation}
        disabled={!translation || isSpeaking}
      >
        <Text style={styles.buttonText}>
          {isSpeaking ? 'A reproduzir...' : 'Falar tradução'}
        </Text>
      </TouchableOpacity>

      {error !== '' && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8FF',
    padding: 16,
  },
  voiceBadge: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#6C63FF',
  },
  voiceBadgeLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  voiceBadgeName: {
    fontSize: 16,
    color: '#1A1A2E',
    fontWeight: '600',
  },
  recordBtn: {
    alignSelf: 'center',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  recordBtnActive: {
    backgroundColor: '#E53E3E',
    shadowColor: '#E53E3E',
  },
  recordBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 8,
  },
  processingText: {
    color: '#666',
    fontSize: 13,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    marginTop: 8,
  },
  textBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    minHeight: 60,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 12,
  },
  resultText: {
    fontSize: 15,
    color: '#1A1A2E',
    lineHeight: 22,
  },
  langScroll: {
    flexGrow: 0,
    marginBottom: 12,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#E8E8F0',
    marginRight: 8,
  },
  langBtnActive: {
    backgroundColor: '#6C63FF',
  },
  langText: {
    fontSize: 13,
    color: '#444',
  },
  langTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    marginTop: 16,
    color: '#E53E3E',
    fontSize: 13,
  },
});
