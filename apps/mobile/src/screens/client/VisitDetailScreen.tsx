/**
 * One visit: where, when, with whom, what it costs — plus the two things a
 * customer actually does here (move it, or cancel it).
 *
 * Moving a visit asks the server for real availability first; cancelling warns
 * about the wallet refund policy in the salon's own words when the visit was
 * wallet-funded.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { catalog, customer } from '../../shared/endpoints';
import { errorMessage, useAsync } from '../../shared/hooks';
import { Badge, Banner, Button, Card, Chip, Empty, Loading, Row, SectionTitle } from '../../shared/components';
import { colors, font, radius, shadow, space, statusColors, STATUS_LABEL } from '../../shared/theme';
import { addDays, formatDate, formatDateLong, formatMoney, formatTime12, isoDate } from '../../core';
import type { RootStackParamList } from '../../navigation';

export function VisitDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'VisitDetail'>>();
  const { id } = route.params;

  const visit = useAsync(() => customer.booking(id), [id]);
  const appointment = visit.data?.appointment;

  const [mode, setMode] = useState<'view' | 'move'>('view');
  const [date, setDate] = useState(isoDate());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(isoDate(), i)), []);

  const availability = useAsync(
    async () => {
      if (mode !== 'move' || !appointment) return null;
      return catalog.availability({
        branchId: appointment.branchId,
        date,
        serviceIds: appointment.services.map((service) => service.serviceId),
      });
    },
    [mode, date, appointment?.id],
  );

  const canChange = appointment && ['booked', 'confirmed'].includes(appointment.status);

  const cancel = () => {
    if (!appointment) return;
    Alert.alert(
      'Cancel this visit?',
      appointment.paymentStatus === 'paid'
        ? 'The salon will handle any refund according to its published policy, and the wallet is credited only after the salon approves the refund.'
        : 'The slot is released for other customers.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel visit',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await customer.cancel(appointment.id, 'Cancelled from the mobile app');
              setMessage('Cancelled. You can book again any time.');
              await visit.reload();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const move = async (startTime: string, staffId: string) => {
    if (!appointment) return;
    setBusy(true);
    setError(null);
    try {
      await customer.reschedule(appointment.id, { date, startTime, staffId });
      setMessage(`Moved to ${formatDateLong(date)} at ${formatTime12(startTime)}.`);
      setMode('view');
      await visit.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (visit.loading && !appointment) return <Loading label="Loading the visit…" />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={22} color={colors.ink800} />
        </Pressable>
        <Text style={styles.title}>Visit</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {visit.error && !appointment ? <Banner tone="error" message={visit.error} action="Try again" onAction={visit.reload} /> : null}
        {error ? <Banner tone="error" title="That did not work" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}

        {appointment ? (
          <>
            <Card>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.when}>{formatDateLong(appointment.date)}</Text>
                  <Text style={styles.time}>
                    {formatTime12(appointment.startTime)} – {formatTime12(appointment.endTime)} · {appointment.durationMinutes} min
                  </Text>
                </View>
                <Badge label={STATUS_LABEL[appointment.status] ?? appointment.status} {...statusColors(appointment.status)} />
              </View>

              <View style={styles.services}>
                {appointment.services.map((service) => (
                  <View key={service.serviceId} style={styles.serviceRow}>
                    <Text style={styles.serviceName} numberOfLines={1}>
                      {service.name}
                    </Text>
                    <Text style={styles.servicePrice}>{formatMoney(service.price)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.totals}>
                <Row label="Services" value={formatMoney(appointment.subtotal)} />
                {appointment.discount > 0 ? <Row label="Discount" value={`− ${formatMoney(appointment.discount)}`} /> : null}
                <Row label="Total" value={formatMoney(appointment.totalAmount)} emphasis />
                <Row
                  label="Payment"
                  value={
                    appointment.paymentStatus === 'paid'
                      ? `Paid ${appointment.paymentMethod ? `(${appointment.paymentMethod.replace(/_/g, ' ')})` : ''}`
                      : `${formatMoney(appointment.paidAmount)} paid · ${formatMoney(appointment.totalAmount - appointment.paidAmount)} due`
                  }
                />
              </View>
            </Card>

            <Card>
              <Row label="Stylist" value={appointment.staffName ?? 'To be assigned'} />
              {appointment.couponCode ? <Row label="Coupon" value={appointment.couponCode} /> : null}
              <Row label="Booking reference" value={appointment.id.slice(0, 8).toUpperCase()} />
              {appointment.notes ? <Row label="Your note" value={appointment.notes} /> : null}
            </Card>

            {mode === 'move' ? (
              <>
                <SectionTitle title="Choose a new day" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {days.map((day) => (
                    <Chip key={day} label={formatDate(day, { weekday: 'short', day: 'numeric', month: 'short' })} active={day === date} onPress={() => setDate(day)} />
                  ))}
                </ScrollView>

                {availability.loading ? (
                  <Card>
                    <Loading label="Checking the calendar…" />
                  </Card>
                ) : availability.data?.closed ? (
                  <Card>
                    <Empty icon="🏖" title="Closed that day" message={availability.data.reason ?? 'Pick another day.'} />
                  </Card>
                ) : (availability.data?.slots.length ?? 0) === 0 ? (
                  <Card>
                    <Empty icon="⏳" title="No free slots" message="Nothing is free that day — try another." />
                  </Card>
                ) : (
                  <View style={styles.slotGrid}>
                    {availability.data!.slots.map((option) => (
                      <Pressable
                        key={`${option.startTime}-${option.staffId}`}
                        disabled={busy}
                        onPress={() => void move(option.startTime, option.staffId)}
                        style={styles.slot}
                      >
                        <Text style={styles.slotTime}>{formatTime12(option.startTime)}</Text>
                        <Text style={styles.slotStaff} numberOfLines={1}>
                          {option.staffName}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Button label="Never mind" variant="secondary" onPress={() => setMode('view')} />
              </>
            ) : (
              <View style={styles.actions}>
                <Button label="Move this visit" variant="secondary" onPress={() => setMode('move')} disabled={!canChange} style={{ flex: 1 }} />
                <Button label="Cancel visit" variant="danger" onPress={cancel} loading={busy} disabled={!canChange} style={{ flex: 1 }} />
              </View>
            )}

            {!canChange ? (
              <Text style={styles.footnote}>
                A visit can only be moved or cancelled while it is still booked or confirmed. Contact the salon for anything else.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  when: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  time: { fontSize: font.size.sm, color: colors.ink500, marginTop: 2 },
  services: { marginTop: space(3), gap: space(1.5) },
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3) },
  serviceName: { flex: 1, fontSize: font.size.sm, color: colors.ink700 },
  servicePrice: { fontSize: font.size.sm, color: colors.ink500 },
  totals: { marginTop: space(3), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  chipRow: { gap: space(2), paddingVertical: space(1) },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  slot: { width: '31.5%', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink200, paddingVertical: space(2.5), alignItems: 'center', ...shadow.card },
  slotTime: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.ink800 },
  slotStaff: { fontSize: 9, color: colors.ink400 },
  actions: { flexDirection: 'row', gap: space(2) },
  footnote: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18 },
});
