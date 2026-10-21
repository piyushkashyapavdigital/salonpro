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
import { TabIcon, tabBarStyle, tabLabelStyle } from './common';
import type { PlatformStackParamList, PlatformTabParamList } from './types';

const Stack = createNativeStackNavigator<PlatformStackParamList>();
const Tabs = createBottomTabNavigator<PlatformTabParamList>();

const TAB_ICONS: Record<keyof PlatformTabParamList, string> = {
  Overview: 'space-dashboard',
  Salons: 'storefront',
  Vendors: 'badge',
  Audit: 'history-edu',
  Account: 'manage-accounts',
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.ink400,
        tabBarLabelStyle: tabLabelStyle,
        tabBarStyle,
        tabBarIcon: ({ focused }) => <TabIcon name={TAB_ICONS[route.name]} focused={focused} />,
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
    >
      <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
      <Stack.Screen name="SalonDetail" component={PlatformSalonDetailScreen} />
      <Stack.Screen name="CreateSalon" component={PlatformCreateSalonScreen} />
      <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} />
    </Stack.Navigator>
  );
}
