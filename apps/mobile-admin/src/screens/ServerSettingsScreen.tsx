/**
 * Where this phone points. Same screen as the customer app's, with the note that
 * matters in a salon: every staff phone must point at the same server, or the
 * desks end up looking at different calendars.
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
        <Text style={styles.heading}>One salon, one server</Text>
        <Text style={styles.body}>
          If the salon is hosted, this is its web address (https://…). If the server runs on a computer at the desk, it is
          the local address printed by `bash scripts/serve.sh` — for example http://192.168.1.34:4000 — and every phone
          must be on the same Wi-Fi.
        </Text>
        <Text style={styles.body}>
          Point every staff phone at the same address: two phones on two different servers is the usual reason one desk
          cannot see another desk's bookings.
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
