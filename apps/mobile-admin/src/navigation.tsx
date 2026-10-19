/**
 * The admin app's shape: five tabs for the jobs done all day (today, schedule,
 * customers, money, more) and pushed screens for the occasional jobs.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, font, radius, shadow, space } from './shared/theme';
import { OverviewScreen } from './screens/OverviewScreen';
import { AppointmentsScreen, AppointmentDetailScreen } from './screens/AppointmentsScreen';
import { CustomersScreen, CustomerDetailScreen } from './screens/CustomersScreen';
import { MoneyScreen } from './screens/MoneyScreen';
import { MoreScreen } from './screens/MoreScreen';
import { SignInScreen } from './screens/SignInScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { StaffScreen } from './screens/StaffScreen';
import { ServicesScreen } from './screens/ServicesScreen';
import { RemindersScreen } from './screens/RemindersScreen';
import { OffersScreen } from './screens/OffersScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ServerSettingsScreen } from './screens/ServerSettingsScreen';
import { WalkInScreen } from './screens/WalkInScreen';

export type RootStackParamList = {
  SignIn: undefined;
  Main: undefined;
  AppointmentDetail: { id: string };
  CustomerDetail: { id: string };
  WalkIn: undefined;
  Analytics: undefined;
  Staff: undefined;
  Services: undefined;
  Reminders: undefined;
  Offers: undefined;
  Settings: undefined;
  ServerSettings: undefined;
};

export type RootScreenProps<Route extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  Route
>;

export type TabParamList = {
  Today: undefined;
  Schedule: undefined;
  Customers: undefined;
  Money: undefined;
  More: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, string> = {
  Today: 'insights',
  Schedule: 'event-note',
  Customers: 'groups',
  Money: 'payments',
  More: 'apps',
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
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.ink400,
        tabBarLabelStyle: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ focused }) => <TabIcon name={TAB_ICONS[route.name as keyof TabParamList]} focused={focused} />,
      })}
    >
      <Tabs.Screen name="Today" component={OverviewScreen} />
      <Tabs.Screen name="Schedule" component={AppointmentsScreen} />
      <Tabs.Screen name="Customers" component={CustomersScreen} />
      <Tabs.Screen name="Money" component={MoneyScreen} />
      <Tabs.Screen name="More" component={MoreScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator({ signedIn }: { signedIn: boolean }) {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'slide_from_right' }}
    >
      {!signedIn ? (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'fade' }} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
          <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
          <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
          <Stack.Screen name="WalkIn" component={WalkInScreen} />
          <Stack.Screen name="Analytics" component={AnalyticsScreen} />
          <Stack.Screen name="Staff" component={StaffScreen} />
          <Stack.Screen name="Services" component={ServicesScreen} />
          <Stack.Screen name="Reminders" component={RemindersScreen} />
          <Stack.Screen name="Offers" component={OffersScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

/** Standard header for pushed screens: back arrow plus title. */
export function PageHead({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.head}>
      <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={onBack} />
      <View style={{ flex: 1 }}>
        <Text style={styles.headTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
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
  tabIcon: { width: 40, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: colors.brand600 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  headTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  headSub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
});
