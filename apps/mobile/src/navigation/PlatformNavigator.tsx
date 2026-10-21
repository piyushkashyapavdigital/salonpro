import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../shared/theme';
import { PlatformOverviewScreen } from '../screens/platform/PlatformOverviewScreen';
import { PlatformSalonsScreen } from '../screens/platform/PlatformSalonsScreen';
import { PlatformVendorsScreen } from '../screens/platform/PlatformVendorsScreen';
import { PlatformAuditScreen } from '../screens/platform/PlatformAuditScreen';
import { PlatformAccountScreen } from '../screens/platform/PlatformAccountScreen';
import { PlatformSalonDetailScreen } from '../screens/platform/PlatformSalonDetailScreen';
import { PlatformCreateSalonScreen } from '../screens/platform/PlatformCreateSalonScreen';
import { ServerSettingsScreen } from '../screens/ServerSettingsScreen';
import { GlobalTabItem, WorkspaceShell, useWorkspaceTab } from './GlobalTabBar';
import type { PlatformStackParamList, PlatformTabParamList } from './types';

const Stack = createNativeStackNavigator<PlatformStackParamList>();
const Tabs = createBottomTabNavigator<PlatformTabParamList>();

const ITEMS: GlobalTabItem[] = [
  { name: 'Overview', label: 'Overview', icon: 'space-dashboard' },
  { name: 'Salons', label: 'Salons', icon: 'storefront' },
  { name: 'Vendors', label: 'Vendors', icon: 'badge' },
  { name: 'Audit', label: 'Audit', icon: 'history-edu' },
  { name: 'Account', label: 'Account', icon: 'manage-accounts' },
];

const DETAIL_TABS: Record<string, keyof PlatformTabParamList> = {
  SalonDetail: 'Salons',
  CreateSalon: 'Salons',
  ServerSettings: 'Account',
};

function MainTabs() {
  const { setActive } = useWorkspaceTab();

  return (
    <Tabs.Navigator
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
      screenListeners={({ route }) => ({
        focus: () => setActive(route.name),
        tabPress: () => setActive(route.name),
      })}
    >
      <Tabs.Screen name="Overview" component={PlatformOverviewScreen} />
      <Tabs.Screen name="Salons" component={PlatformSalonsScreen} />
      <Tabs.Screen name="Vendors" component={PlatformVendorsScreen} />
      <Tabs.Screen name="Audit" component={PlatformAuditScreen} />
      <Tabs.Screen name="Account" component={PlatformAccountScreen} />
    </Tabs.Navigator>
  );
}

export function PlatformNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
      layout={({ children, state, navigation }) => (
        <WorkspaceShell
          state={state}
          navigation={navigation}
          items={ITEMS}
          detailTabs={DETAIL_TABS}
          initialTab="Overview"
        >
          {children}
        </WorkspaceShell>
      )}
    >
      <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
      <Stack.Screen name="SalonDetail" component={PlatformSalonDetailScreen} />
      <Stack.Screen name="CreateSalon" component={PlatformCreateSalonScreen} />
      <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} />
    </Stack.Navigator>
  );
}
