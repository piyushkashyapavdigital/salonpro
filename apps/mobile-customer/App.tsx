/**
 * SalonPro — customer app.
 *
 * Restores the session, then either the sign-in screen or the tabbed app. The
 * only global concerns are the theme handed to React Navigation and the status
 * bar (dark text on the light canvas, white on the gradient headers).
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/shared/auth';
import { Loading } from './src/shared/components';
import { colors } from './src/shared/theme';
import { RootNavigator } from './src/navigation';

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand600,
    background: colors.canvas,
    card: colors.white,
    text: colors.ink900,
    border: colors.ink100,
    notification: colors.brand500,
  },
};

function Gate() {
  const { ready, user } = useAuth();
  if (!ready) return <Loading label="Checking your session…" />;
  return <RootNavigator signedIn={!!user} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <NavigationContainer theme={navTheme}>
          <Gate />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
