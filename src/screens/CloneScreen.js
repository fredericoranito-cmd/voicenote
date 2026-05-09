import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { addVoice } from '../storage/voices';

const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
const RECORD_SECONDS = 60;

export default function CloneScreen({ navigation }) {
  const [name, setName] = useState('');
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RECORD_SECONDS);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const countdownRef = useRef(null);
  const stopTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  async function handleStartClone() {
    setError('');
    setStatus('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Dá um nome à voz antes de começar.');
      return;
    }

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
      setSecondsLeft(RECORD_SECONDS);
      setStatus('A gravar...');

      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      stopTimerRef.current = setTimeout(() => finishClone(rec, trimmed), RECORD_SECONDS * 1000);
    } catch (e) {
      setError('Erro ao iniciar gravação: ' + e.message);
      setIsRecording(false);
    }
  }

  async function finishClone(rec, voiceName) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    setIsRecording(false);
    setIsUploading(true);
    setStatus('A enviar para ElevenLabs...');

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecording(null);

      const fileContent = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

      const formData = new FormData();
      formData.append('name', voiceName);
      formData.append('files', {
        uri: 'data:audio/m4a;base64,' + fileContent,
        name: 'voice_sample.m4a',
        type: 'audio/m4a',
      });

      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        body: formData,
      });
      const data = await response.json();

      if (data.voice_id) {
        await addVoice({
          id: data.voice_id,
          name: voiceName,
          createdAt: Date.now(),
        });
        setStatus('Voz clonada com sucesso.');
        navigation.navigate('Vozes');
      } else {
        const detail = data.detail
          ? typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
          : data.message || `HTTP ${response.status}`;
        setError('Erro ao clonar voz: ' + detail);
      }
    } catch (e) {
      setError('Erro ao processar voz: ' + e.message);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Clonar Nova Voz</Text>
      <Text style={styles.instruction}>Dá um nome à voz e fala claramente durante {RECORD_SECONDS} segundos.</Text>

      <Text style={styles.label}>Nome da voz</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="ex: Voz de manhã"
        placeholderTextColor="#999"
        editable={!isRecording && !isUploading}
        autoCapitalize="sentences"
        maxLength={40}
      />

      <TouchableOpacity
        style={[styles.button, (isRecording || isUploading) && styles.buttonDisabled]}
        onPress={handleStartClone}
        disabled={isRecording || isUploading}
      >
        <Text style={styles.buttonText}>
          {isRecording ? `A gravar... ${secondsLeft}s` : isUploading ? 'A enviar...' : 'Começar a gravar'}
        </Text>
      </TouchableOpacity>

      {(status !== '' || isUploading) && (
        <View style={styles.statusBox}>
          {isUploading && <ActivityIndicator size="small" color="#6C63FF" style={{ marginRight: 8 }} />}
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      {error !== '' && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8FF',
    padding: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  instruction: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  error: {
    marginTop: 16,
    color: '#E53E3E',
    fontSize: 14,
  },
});
