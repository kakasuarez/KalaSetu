import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  NotoSans_400Regular,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
} from '@expo-google-fonts/noto-sans';

import { RootNavigator } from './src/navigation';
import { AuthProvider } from './src/store/auth';
import { VoiceProvider } from './src/store/voice';
import { colors } from './src/theme';

export default function App() {
  // Every scale entry in theme/typography names one of these faces. Rendering
  // before they resolve would show a frame of system-font text at the wrong
  // metrics, so the whole tree waits -- it is a few hundred ms from cache.
  const [fontsLoaded, fontError] = useFonts({
    NotoSans_400Regular,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
  });

  // A font that fails to load must not brick the app: React Native falls back
  // to the system face for an unknown family, which is ugly but usable.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
                     backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <VoiceProvider>
          <RootNavigator />
          <StatusBar style="dark" />
        </VoiceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
