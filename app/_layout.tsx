import { useFonts } from 'expo-font';
import * as NavigationBar from 'expo-navigation-bar';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import '../global.css';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    import('@/src/core/app-bootstrap')
      .then(({ bootstrapApp }) => bootstrapApp())
      .catch(console.error);
  }, []);

  useEffect(() => {
    const clearScheduledPause = () => {
      if (!pauseTimerRef.current) return;
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearScheduledPause();
        import('@/src/core/app-bootstrap')
          .then(({ resumeAppRuntime }) => resumeAppRuntime())
          .catch(console.error);
        return;
      }

      if (state === 'background' && !pauseTimerRef.current) {
        pauseTimerRef.current = setTimeout(() => {
          pauseTimerRef.current = null;
          import('@/src/core/app-bootstrap')
            .then(({ pauseAppRuntime }) => pauseAppRuntime())
            .catch(console.error);
        }, 750);
      }
    });

    return () => {
      clearScheduledPause();
      subscription.remove();
    };
  }, []);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    NavigationBar.setVisibilityAsync('hidden').catch(console.error);
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar hidden />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
