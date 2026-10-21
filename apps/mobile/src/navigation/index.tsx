import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../shared/auth';
import { colors } from '../shared/theme';
import { SignInScreen } from '../screens/SignInScreen';
import { ClientNavigator } from './ClientNavigator';
import { VendorNavigator } from './VendorNavigator';
import { PlatformNavigator } from './PlatformNavigator';

const AuthStack = createNativeStackNavigator<{ SignIn: undefined }>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <AuthStack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'fade' }} />
    </AuthStack.Navigator>
  );
}

/**
 * One binary, three workspaces. The server resolves the role; this only picks
 * the shell the role belongs to. A missing workspace (an old server) falls back
 * to the role mapping so the app degrades safely instead of showing the wrong
 * tenant.
 */
export function RootNavigator() {
  const { user } = useAuth();

  if (!user) return <AuthNavigator />;

  const workspace =
    user.workspace ??
    (user.role === 'super_admin' ? 'platform' : user.role === 'customer' ? 'client' : 'vendor');

  if (workspace === 'platform') return <PlatformNavigator />;
  if (workspace === 'vendor') return <VendorNavigator />;
  return <ClientNavigator />;
}

export type { ClientStackParamList, ClientTabParamList, RootStackParamList, TabParamList, VendorStackParamList, VendorTabParamList, PlatformStackParamList, PlatformTabParamList } from './types';
export { HeaderBack, PageHead, TabIcon } from './common';
