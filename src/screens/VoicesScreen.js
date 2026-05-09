import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadVoices, removeVoice } from '../storage/voices';
import { deleteVoiceRemote } from '../api/elevenlabs';

export default function VoicesScreen({ navigation }) {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const v = await loadVoices();
        if (active) {
          setVoices(v);
          setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [])
  );

  function confirmDelete(voice) {
    Alert.alert(
      'Apagar voz',
      `Apagar "${voice.name}"? Vai ser removida do telemóvel e do ElevenLabs.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Apagar', style: 'destructive', onPress: () => doDelete(voice) },
      ]
    );
  }

  async function doDelete(voice) {
    setDeletingId(voice.id);
    setError('');
    try {
      await deleteVoiceRemote(voice.id);
    } catch (e) {
      // Even if remote fails (404, etc.), we still remove locally so user isn't stuck.
      console.log('deleteVoiceRemote failed:', e.message);
      setError('Aviso: ' + e.message);
    }
    const next = await removeVoice(voice.id);
    setVoices(next);
    setDeletingId(null);
  }

  function useVoice(voice) {
    navigation.navigate('Tradutor', { voiceId: voice.id, voiceName: voice.name });
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  if (voices.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyTitle}>Ainda não tens vozes clonadas</Text>
        <Text style={styles.emptySubtitle}>Clona a tua primeira voz para começar a usar o tradutor.</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Clonar nova voz')}
        >
          <Text style={styles.primaryButtonText}>Clonar primeira voz</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate('Clonar nova voz')}
      >
        <Text style={styles.primaryButtonText}>+ Clonar nova voz</Text>
      </TouchableOpacity>

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={voices}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardDate}>
                {new Date(item.createdAt).toLocaleDateString('pt-PT')}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.useButton}
                onPress={() => useVoice(item)}
                disabled={deletingId === item.id}
              >
                <Text style={styles.useButtonText}>Usar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDelete(item)}
                disabled={deletingId === item.id}
              >
                {deletingId === item.id
                  ? <ActivityIndicator size="small" color="#E53E3E" />
                  : <Text style={styles.deleteButtonText}>Apagar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8FF',
    padding: 16,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 2,
  },
  cardDate: {
    fontSize: 12,
    color: '#999',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  useButton: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  useButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E53E3E',
    minWidth: 60,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#E53E3E',
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: '#E53E3E',
    fontSize: 13,
    marginBottom: 12,
  },
});
