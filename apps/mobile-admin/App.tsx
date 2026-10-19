/**
 * SalonPro Admin — the salon's own app.
 *
 * Same session model as the customer app (bearer token in AsyncStorage), but the
 * gate is stricter: only salon roles may get past sign-in, and if a customer
 * signs in they are told plainly which app to use.
 */
import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, isAdminRole, useAuth } from './src/shared/auth';
import { Banner, Button, Loading } from './src/shared/components';
import { colors, space } from './src/shared/theme';
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
  const { ready, user, signOut } = useAuth();

  if (!ready) return <Loading label="Checking your session…" />;

  if (user && !isAdminRole(user.role)) {
    return (
      <View style={styles.wrongApp}>
        <Banner
          tone="warning"
          title="This is a customer account"
          message={`${user.phone} is signed in as a customer. Customer accounts use the SalonPro app; this app is for the salon's team.`}
        />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </View>
    );
  }

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

const styles = StyleSheet.create({
  wrongApp: { flex: 1, justifyContent: 'center', padding: space(5), gap: space(4), backgroundColor: colors.canvas },
});
