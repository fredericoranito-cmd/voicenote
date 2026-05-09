import { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;

// Log para debug (remove quando funcionar)
console.log('OpenAI Key loaded:', OPENAI_API_KEY ? '✓' : '✗');
console.log('ElevenLabs Key loaded:', ELEVENLABS_API_KEY ? '✓' : '✗');
console.log('ElevenLabs Key preview:', ELEVENLABS_API_KEY ? ELEVENLABS_API_KEY.substring(0, 10) + '...' : 'undefined');

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

export default function App() {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [targetLang, setTargetLang] = useState('en');
  const [error, setError] = useState('');
  const [sound, setSound] = useState(null);
  const [voiceId, setVoiceId] = useState('21m00Tcm4TlvDq8ikWAM'); // default Rachel
  const [currentScreen, setCurrentScreen] = useState('clone');
  const [voiceCloned, setVoiceCloned] = useState(false);
  const [cloneStatus, setCloneStatus] = useState('');

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
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (e) {
      setError('Erro ao iniciar gravação.');
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
      setError('Erro ao parar gravação.');
      setIsProcessing(false);
    }
  }

  async function playTranslation(text, voiceId) {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      });
      if (!response.ok) throw new Error('Erro na TTS.');
      const arrayBuffer = await response.arrayBuffer();
      const uri = FileSystem.documentDirectory + 'tts.mp3';
      await FileSystem.writeAsStringAsync(uri, arrayBufferToBase64(arrayBuffer), { encoding: FileSystem.EncodingType.Base64 });
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (e) {
      setError('Erro ao reproduzir tradução.');
    }
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async function cloneVoice() {
    setError('');
    setCloneStatus('Iniciando gravação...');
    
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setCloneStatus('Permissão de microfone negada.');
        setError('Permissão de microfone negada.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      setCloneStatus('Gravando... (60 segundos)');
      
      // Record for 1 minute
      setTimeout(async () => {
        try {
          await recording.stopAndUnloadAsync();
          const uri = recording.getURI();
          setRecording(null);
          setIsRecording(false);
          setCloneStatus('Enviando para ElevenLabs...');
          
          // Read file as base64
          const fileContent = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
          
          // Create form data with base64
          const formData = new FormData();
          formData.append('name', 'Minha Voz');
          formData.append('files', {
            uri: 'data:audio/m4a;base64,' + fileContent,
            name: 'voice_sample.m4a',
            type: 'audio/m4a',
          });
          
          const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: formData,
          });
          
          const data = await response.json();
          console.log('ElevenLabs Response:', data);
          
          if (data.voice_id) {
            setVoiceId(data.voice_id);
            setCloneStatus('✓ Voz clonada com sucesso!');
            setVoiceCloned(true);
            setError('');
          } else if (data.detail) {
            const errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
            setCloneStatus('✗ Erro: ' + errorMsg);
            setError('Erro ao clonar voz: ' + errorMsg);
          } else if (data.message) {
            setCloneStatus('✗ Erro: ' + data.message);
            setError('Erro ao clonar voz: ' + data.message);
          } else if (!response.ok) {
            setCloneStatus('✗ Erro HTTP ' + response.status);
            setError('Erro ao clonar voz (HTTP ' + response.status + ')');
          } else {
            setCloneStatus('✗ Erro desconhecido ao clonar voz');
            setError('Erro desconhecido ao clonar voz.');
          }
        } catch (e) {
          console.log('Error:', e);
          setCloneStatus('✗ Erro: ' + e.message);
          setError('Erro ao processar voz: ' + e.message);
        }
      }, 60000);
    } catch (e) {
      console.log('Error:', e);
      setCloneStatus('✗ Erro: ' + e.message);
      setError('Erro ao iniciar gravação: ' + e.message);
      setIsRecording(false);
    }
  }

  async function transcribeAndTranslate(uri) {
    try {
      // Transcribe with Whisper
      const formData = new FormData();
      formData.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' });
      formData.append('model', 'whisper-1');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });
      const whisperData = await whisperRes.json();
      const text = whisperData.text;
      if (!text) throw new Error('Sem transcrição.');
      setTranscript(text);

      // Translate with GPT
      const langLabel = LANGUAGES.find(l => l.code === targetLang)?.label ?? targetLang;
      const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Traduz o texto seguinte para ${langLabel}. Responde apenas com a tradução, sem explicações.`,
            },
            { role: 'user', content: text },
          ],
        }),
      });
      const gptData = await gptRes.json();
      const translationText = gptData.choices?.[0]?.message?.content ?? '';
      setTranslation(translationText);
    } catch (e) {
      setError('Erro ao transcrever ou traduzir.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Just Voice It</Text>

      {currentScreen === 'clone' ? (
        <View style={styles.screen}>
          <Text style={styles.subtitle}>Criar a Tua Própria Voz</Text>
          <Text style={styles.instruction}>Fala claramente durante 1 minuto para clonar a tua voz.</Text>
          
          <TouchableOpacity 
            style={[styles.button, isRecording && styles.buttonDisabled]} 
            onPress={cloneVoice} 
            disabled={isRecording}
          >
            <Text style={styles.buttonText}>{isRecording ? 'Gravando amostra...' : 'Clonar Voz'}</Text>
          </TouchableOpacity>

          {cloneStatus !== '' && (
            <View style={[styles.statusBox, voiceCloned ? styles.statusSuccess : styles.statusPending]}>
              <Text style={styles.statusText}>{cloneStatus}</Text>
            </View>
          )}

          {voiceCloned && (
            <TouchableOpacity 
              style={[styles.button, styles.buttonSuccess]} 
              onPress={() => setCurrentScreen('translate')}
            >
              <Text style={styles.buttonText}>Ir para Tradutor</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.screen}>
          {/* Record button */}
          <TouchableOpacity
            style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
          >
            <Text style={styles.recordBtnText}>
              {isRecording ? '⏹ Parar' : '🎙 Falar'}
            </Text>
          </TouchableOpacity>

          {/* Transcript */}
          <Text style={styles.label}>Texto falado:</Text>
          <ScrollView style={styles.textBox}>
            <Text style={styles.resultText}>{transcript}</Text>
          </ScrollView>

          {/* Target Language selector */}
          <Text style={styles.label}>Traduzir para:</Text>
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

          {/* Translation */}
          <Text style={styles.label}>Texto traduzido:</Text>
          <ScrollView style={styles.textBox}>
            <Text style={styles.resultText}>{translation}</Text>
          </ScrollView>

          {/* Speak Translation button */}
          <TouchableOpacity
            style={styles.button}
            onPress={() => playTranslation(translation, voiceId)}
            disabled={!translation}
          >
            <Text style={styles.buttonText}>Falar Tradução</Text>
          </TouchableOpacity>

          {isProcessing && <ActivityIndicator size="large" color="#6C63FF" style={{ marginTop: 24 }} />}

          <TouchableOpacity 
            style={[styles.button, styles.buttonSecondary]} 
            onPress={() => {
              setCurrentScreen('clone');
              setTranscript('');
              setTranslation('');
            }}
          >
            <Text style={styles.buttonText}>Voltar à Clonagem</Text>
          </TouchableOpacity>
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
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 32,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 16,
  },
  instruction: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  screen: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  textBox: {
    width: '100%',
    maxHeight: 100,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  label: {
    fontSize: 14,
    color: '#666',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  langScroll: {
    flexGrow: 0,
    marginBottom: 40,
  },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E8E8F0',
    marginRight: 8,
  },
  langBtnActive: {
    backgroundColor: '#6C63FF',
  },
  langText: {
    fontSize: 14,
    color: '#444',
  },
  langTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonSuccess: {
    backgroundColor: '#4CAF50',
  },
  buttonSecondary: {
    backgroundColor: '#888',
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
    width: '100%',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
  },
  statusPending: {
    backgroundColor: '#FFF3CD',
    borderLeftColor: '#FFC107',
  },
  statusSuccess: {
    backgroundColor: '#D4EDDA',
    borderLeftColor: '#28A745',
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  recordBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
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
  resultBox: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  translationBox: {
    borderLeftWidth: 4,
    borderLeftColor: '#6C63FF',
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  resultText: {
    fontSize: 16,
    color: '#1A1A2E',
    lineHeight: 24,
  },
  error: {
    marginTop: 16,
    color: '#E53E3E',
    fontSize: 14,
  },
});
