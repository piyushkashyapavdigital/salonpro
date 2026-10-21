/**
 * Where the phone points. Reachable before sign-in (the card is on the sign-in
 * screen) and afterwards from Profile, because "the app cannot reach the salon"
 * is the one problem a customer can actually fix themselves.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Card, Screen } from '../shared/components';
import { ServerCard, CurrentServerLine } from '../shared/ServerCard';
import { colors, font, space } from '../shared/theme';

export function ServerSettingsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  return (
    <Screen
      header={
        <View style={styles.head}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <MaterialIcons name="arrow-back" size={22} color={colors.ink800} />
          </Pressable>
          <Text style={styles.title}>Server address</Text>
        </View>
      }
    >
      <Card>
        <CurrentServerLine />
      </Card>
      <ServerCard />
      <Card>
        <Text style={styles.heading}>How the apps find the API</Text>
        <Text style={styles.body}>
          A hosted SalonPro answers on a normal web address (https://…). A salon running the server on its own computer
          answers on the local address printed by `bash scripts/serve.sh` — for example http://192.168.1.34:4000 — and
          the phone must be on the same Wi-Fi.
        </Text>
        <Text style={styles.body}>
          Changing the address signs nobody in or out, and it only affects this phone.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  heading: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  body: { fontSize: font.size.sm, color: colors.ink500, lineHeight: 20, marginTop: space(2) },
});
