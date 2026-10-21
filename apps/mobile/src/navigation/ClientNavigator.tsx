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
import { GlobalTabItem, WorkspaceShell, useWorkspaceTab } from './GlobalTabBar';
import type { ClientStackParamList, ClientTabParamList } from './types';

const Stack = createNativeStackNavigator<ClientStackParamList>();
const Tabs = createBottomTabNavigator<ClientTabParamList>();

const ITEMS: GlobalTabItem[] = [
  { name: 'Home', label: 'Home', icon: 'spa' },
  { name: 'Book', label: 'Book', icon: 'event-available' },
  { name: 'Visits', label: 'Visits', icon: 'history' },
  { name: 'Wallet', label: 'Wallet', icon: 'account-balance-wallet' },
  { name: 'Profile', label: 'Profile', icon: 'person' },
];

const DETAIL_TABS: Record<string, keyof ClientTabParamList> = {
  VisitDetail: 'Visits',
  Offers: 'Home',
  Referral: 'Home',
  Notifications: 'Home',
  ProfileEdit: 'Profile',
  ServerSettings: 'Profile',
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
      layout={({ children, state, navigation }) => (
        <WorkspaceShell
          state={state}
          navigation={navigation}
          items={ITEMS}
          detailTabs={DETAIL_TABS}
          initialTab="Home"
        >
          {children}
        </WorkspaceShell>
      )}
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
