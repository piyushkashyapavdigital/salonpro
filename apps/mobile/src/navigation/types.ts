import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Permission } from '../core';

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export type ClientTabParamList = {
  Home: undefined;
  Book: { serviceId?: string } | undefined;
  Visits: undefined;
  Wallet: undefined;
  Profile: undefined;
};

export type ClientStackParamList = {
  Main: { screen?: keyof ClientTabParamList } | undefined;
  VisitDetail: { id: string };
  Offers: undefined;
  Referral: undefined;
  Notifications: undefined;
  ProfileEdit: undefined;
  ServerSettings: undefined;
};

/** The customer screens were written against these shorter names. */
export type TabParamList = ClientTabParamList;
export type RootStackParamList = ClientStackParamList;
export type RootScreenProps<Route extends keyof ClientStackParamList> = NativeStackScreenProps<
  ClientStackParamList,
  Route
>;

/* ------------------------------------------------------------------ */
/* Vendor                                                              */
/* ------------------------------------------------------------------ */

export type VendorTabParamList = {
  Today: undefined;
  Schedule: undefined;
  Customers: undefined;
  Money: undefined;
  More: undefined;
};

export type VendorStackParamList = {
  Main: { screen?: keyof VendorTabParamList } | undefined;
  AppointmentDetail: { id: string };
  CustomerDetail: { id: string };
  WalkIn: { customerId?: string; customerName?: string; customerPhone?: string } | undefined;
  Analytics: undefined;
  Staff: undefined;
  Services: undefined;
  Reminders: undefined;
  Offers: undefined;
  Reviews: undefined;
  Settings: undefined;
  ServerSettings: undefined;
};

/* ------------------------------------------------------------------ */
/* Platform                                                            */
/* ------------------------------------------------------------------ */

export type PlatformTabParamList = {
  Overview: undefined;
  Salons: undefined;
  Vendors: undefined;
  Audit: undefined;
  Account: undefined;
};

export type PlatformStackParamList = {
  Main: { screen?: keyof PlatformTabParamList } | undefined;
  SalonDetail: { id: string };
  CreateSalon: undefined;
  ServerSettings: undefined;
};

export function allows(permissions: Permission[] | undefined, permission: Permission): boolean {
  return !!permissions?.includes(permission);
}
