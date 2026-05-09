import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import VoicesScreen from './src/screens/VoicesScreen';
import CloneScreen from './src/screens/CloneScreen';
import TranslatorScreen from './src/screens/TranslatorScreen';
import { loadVoices } from './src/storage/voices';

const Drawer = createDrawerNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    (async () => {
      const voices = await loadVoices();
      setInitialRoute(voices.length > 0 ? 'Vozes' : 'Clonar nova voz');
    })();
  }, []);

  if (!initialRoute) {
    return (
      <View style={styles.splash}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Drawer.Navigator
            initialRouteName={initialRoute}
            screenOptions={{
              headerStyle: { backgroundColor: '#fff' },
              headerTintColor: '#1A1A2E',
              headerTitleStyle: { fontWeight: '700' },
              drawerActiveTintColor: '#6C63FF',
              drawerLabelStyle: { fontSize: 15 },
            }}
          >
            <Drawer.Screen name="Vozes" component={VoicesScreen} />
            <Drawer.Screen name="Clonar nova voz" component={CloneScreen} />
            <Drawer.Screen name="Tradutor" component={TranslatorScreen} />
          </Drawer.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#F8F8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
