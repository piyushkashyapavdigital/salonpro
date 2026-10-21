import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../shared/theme';
import { HomeScreen } from '../screens/client/HomeScreen';
import { BookScreen } from '../screens/client/BookScreen';
import { VisitsScreen } from '../screens/client/VisitsScreen';
import { WalletScreen } from '../screens/client/WalletScreen';
import { ProfileScreen } from '../screens/client/ProfileScreen';
import { VisitDetailScreen } from '../screens/client/VisitDetailScreen';
import { OffersScreen } from '../screens/client/OffersScreen';
import { ReferralScreen } from '../screens/client/ReferralScreen';
import { NotificationsScreen } from '../screens/client/NotificationsScreen';
import { ProfileEditScreen } from '../screens/client/ProfileEditScreen';
import { ServerSettingsScreen } from '../screens/ServerSettingsScreen';
import { TabIcon, tabBarStyle, tabLabelStyle } from './common';
import type { ClientStackParamList, ClientTabParamList } from './types';

const Stack = createNativeStackNavigator<ClientStackParamList>();
const Tabs = createBottomTabNavigator<ClientTabParamList>();

const TAB_ICONS: Record<keyof ClientTabParamList, string> = {
  Home: 'spa',
  Book: 'event-available',
  Visits: 'history',
  Wallet: 'account-balance-wallet',
  Profile: 'person',
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.ink400,
        tabBarLabelStyle: tabLabelStyle,
        tabBarStyle,
        tabBarIcon: ({ focused }) => <TabIcon name={TAB_ICONS[route.name]} focused={focused} />,
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Book" component={BookScreen} />
      <Tabs.Screen name="Visits" component={VisitsScreen} />
      <Tabs.Screen name="Wallet" component={WalletScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function ClientNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
      <Stack.Screen name="VisitDetail" component={VisitDetailScreen} />
      <Stack.Screen name="Offers" component={OffersScreen} />
      <Stack.Screen name="Referral" component={ReferralScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
      <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} />
    </Stack.Navigator>
  );
}
