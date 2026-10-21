/**
 * SalonPro — the unified app.
 *
 * One binary opens the platform console, the salon workspace, or the customer
 * workspace from the role the server put in the session. The shell is a UX
 * choice; every API route re-checks the role and permission on its own.
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/shared/auth';
import { Loading } from './src/shared/components';
import { UpdateProvider } from './src/shared/updates';
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
  const { ready } = useAuth();
  if (!ready) return <Loading label="Checking your session…" />;
  return <RootNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <UpdateProvider>
          <NavigationContainer theme={navTheme}>
            <Gate />
          </NavigationContainer>
        </UpdateProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
