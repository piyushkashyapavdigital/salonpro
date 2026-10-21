import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { colors, font, radius, shadow, space } from '../shared/theme';

export function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <MaterialIcons name={name} size={focused ? 24 : 22} color={focused ? colors.white : colors.ink400} />
    </View>
  );
}

/** Round back button used by the customer screens. */
export function HeaderBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.back}>
      <MaterialIcons name="arrow-back" size={22} color={colors.ink800} />
      <Text style={styles.backLabel}>Back</Text>
    </Pressable>
  );
}

/** Standard header for pushed vendor screens: back arrow plus title. */
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

export const tabBarStyle = {
  height: 68,
  paddingTop: space(2),
  paddingBottom: space(2.5),
  backgroundColor: colors.white,
  borderTopColor: colors.ink100,
  borderTopWidth: StyleSheet.hairlineWidth,
  ...shadow.card,
} as const;

export const tabLabelStyle = {
  fontSize: font.size.xs,
  fontWeight: font.weight.semibold,
} as const;

const styles = StyleSheet.create({
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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  headTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  headSub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
});
