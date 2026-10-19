/**
 * Navigation, in one file so the shape of the app is readable at a glance:
 * a stack that holds the sign-in screen and the tabbed shell, plus the screens
 * that are pushed on top (a visit's detail, offers, referrals, settings).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from './shared/auth';
import { colors, font, radius, shadow, space } from './shared/theme';
import { HomeScreen } from './screens/HomeScreen';
import { BookScreen } from './screens/BookScreen';
import { VisitsScreen } from './screens/VisitsScreen';
import { WalletScreen } from './screens/WalletScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SignInScreen } from './screens/SignInScreen';
import { VisitDetailScreen } from './screens/VisitDetailScreen';
import { OffersScreen } from './screens/OffersScreen';
import { ReferralScreen } from './screens/ReferralScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { ProfileEditScreen } from './screens/ProfileEditScreen';
import { ServerSettingsScreen } from './screens/ServerSettingsScreen';

export type RootStackParamList = {
  SignIn: undefined;
  Main: undefined;
  VisitDetail: { id: string };
  Offers: undefined;
  Referral: undefined;
  Notifications: undefined;
  ProfileEdit: undefined;
  ServerSettings: undefined;
};

export type RootScreenProps<Route extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  Route
>;

export type TabParamList = {
  Home: undefined;
  Book: { serviceId?: string } | undefined;
  Visits: undefined;
  Wallet: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, string> = {
  Home: 'spa',
  Book: 'event-available',
  Visits: 'history',
  Wallet: 'account-balance-wallet',
  Profile: 'person',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <MaterialIcons name={name} size={focused ? 24 : 22} color={focused ? colors.white : colors.ink400} />
    </View>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.ink400,
        tabBarLabelStyle: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ focused }) => <TabIcon name={TAB_ICONS[route.name as keyof TabParamList]} focused={focused} />,
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

/** Round back button used by the pushed screens. */
export function HeaderBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.back}>
      <MaterialIcons name="arrow-back" size={22} color={colors.ink800} />
      <Text style={styles.backLabel}>Back</Text>
    </Pressable>
  );
}

export function RootNavigator({ signedIn }: { signedIn: boolean }) {
  const { user } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      {!signedIn || !user ? (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'fade' }} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
          <Stack.Screen name="VisitDetail" component={VisitDetailScreen} />
          <Stack.Screen name="Offers" component={OffersScreen} />
          <Stack.Screen name="Referral" component={ReferralScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
          <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 68,
    paddingTop: space(2),
    paddingBottom: space(2.5),
    backgroundColor: colors.white,
    borderTopColor: colors.ink100,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...shadow.card,
  },
  tabIcon: {
    width: 40,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: { backgroundColor: colors.brand600 },
  back: { flexDirection: 'row', alignItems: 'center', gap: space(1), paddingVertical: space(2) },
  backLabel: { color: colors.ink800, fontWeight: font.weight.semibold, fontSize: font.size.sm },
});
