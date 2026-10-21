import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../shared/auth';
import { colors } from '../shared/theme';
import { OverviewScreen } from '../screens/vendor/OverviewScreen';
import { AppointmentsScreen, AppointmentDetailScreen } from '../screens/vendor/AppointmentsScreen';
import { CustomersScreen, CustomerDetailScreen } from '../screens/vendor/CustomersScreen';
import { MoneyScreen } from '../screens/vendor/MoneyScreen';
import { MoreScreen } from '../screens/vendor/MoreScreen';
import { AnalyticsScreen } from '../screens/vendor/AnalyticsScreen';
import { StaffScreen } from '../screens/vendor/StaffScreen';
import { ServicesScreen } from '../screens/vendor/ServicesScreen';
import { RemindersScreen } from '../screens/vendor/RemindersScreen';
import { OffersScreen } from '../screens/vendor/OffersScreen';
import { SettingsScreen } from '../screens/vendor/SettingsScreen';
import { WalkInScreen } from '../screens/vendor/WalkInScreen';
import { ServerSettingsScreen } from '../screens/ServerSettingsScreen';
import { TabIcon, tabBarStyle, tabLabelStyle } from './common';
import { allows, type VendorStackParamList, type VendorTabParamList } from './types';

const Stack = createNativeStackNavigator<VendorStackParamList>();
const Tabs = createBottomTabNavigator<VendorTabParamList>();

const TAB_ICONS: Record<keyof VendorTabParamList, string> = {
  Today: 'insights',
  Schedule: 'event-note',
  Customers: 'groups',
  Money: 'payments',
  More: 'apps',
};

function MainTabs() {
  const { user } = useAuth();
  const permissions = user?.permissions;

  const showToday = allows(permissions, 'salon.report.read');
  const showSchedule = allows(permissions, 'salon.appointment.read');
  const showCustomers = allows(permissions, 'salon.customer.read');
  const showMoney = allows(permissions, 'salon.payment.read') || allows(permissions, 'salon.payment.refund');
  const initialRouteName: keyof VendorTabParamList = showToday
    ? 'Today'
    : showSchedule
      ? 'Schedule'
      : showCustomers
        ? 'Customers'
        : 'More';

  return (
    <Tabs.Navigator
      initialRouteName={initialRouteName}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.ink400,
        tabBarLabelStyle: tabLabelStyle,
        tabBarStyle,
        tabBarIcon: ({ focused }) => <TabIcon name={TAB_ICONS[route.name]} focused={focused} />,
      })}
    >
      {showToday ? <Tabs.Screen name="Today" component={OverviewScreen} /> : null}
      {showSchedule ? <Tabs.Screen name="Schedule" component={AppointmentsScreen} /> : null}
      {showCustomers ? <Tabs.Screen name="Customers" component={CustomersScreen} /> : null}
      {showMoney ? <Tabs.Screen name="Money" component={MoneyScreen} /> : null}
      <Tabs.Screen name="More" component={MoreScreen} />
    </Tabs.Navigator>
  );
}

export function VendorNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
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
    </Stack.Navigator>
  );
}
