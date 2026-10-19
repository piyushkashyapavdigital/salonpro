/**
 * The day's schedule, plus the screen where staff actually move a visit through
 * its lifecycle (confirm → checked in → in progress → completed / no-show).
 *
 * Status changes go through the server one at a time and the screen re-reads the
 * appointment afterwards, so a role that is not allowed to do something gets the
 * server's own refusal instead of a button that lies.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { admin } from '../shared/endpoints';
import { errorMessage, useAsync } from '../shared/hooks';
import { useAuth } from '../shared/auth';
import { Badge, Banner, Button, Card, Chip, Empty, Field, Loading, Row, SectionTitle } from '../shared/components';
import { colors, font, radius, shadow, space, statusColors, STATUS_LABEL } from '../shared/theme';
import { addDays, formatDate, formatDateLong, formatMoney, formatTime12, isoDate } from '../core';
import type { Appointment } from '../core';

const FILTERS = ['today', 'tomorrow', 'week', 'all'] as const;
type Filter = (typeof FILTERS)[number];

function rangeFor(filter: Filter): { date?: string; from?: string; to?: string } {
  if (filter === 'today') return { date: isoDate() };
  if (filter === 'tomorrow') return { date: addDays(isoDate(), 1) };
  if (filter === 'week') return { from: isoDate(), to: addDays(isoDate(), 6) };
  return { from: addDays(isoDate(), -14), to: addDays(isoDate(), 14) };
}

export function AppointmentsScreen() {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<Filter>('today');
  const [status, setStatus] = useState<string | null>(null);

  const list = useAsync(
    () => admin.appointments({ ...rangeFor(filter), ...(status ? { status } : {}) }),
    [filter, status],
  );

  const rows = list.data?.appointments ?? [];
  const byTime = useMemo(
    () => [...rows].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [rows],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Schedule</Text>
        <Text style={styles.sub}>
          {rows.length} appointment{rows.length === 1 ? '' : 's'}
          {filter === 'today' ? ' today' : ''}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((option) => (
            <Chip
              key={option}
              label={option === 'week' ? 'Next 7 days' : option === 'all' ? '±2 weeks' : option[0]!.toUpperCase() + option.slice(1)}
              active={filter === option}
              onPress={() => setFilter(option)}
            />
          ))}
          <View style={styles.chipDivider} />
          {['booked', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'].map((option) => (
            <Chip key={option} label={STATUS_LABEL[option] ?? option} active={status === option} onPress={() => setStatus(status === option ? null : option)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.brand500} />}
      >
        {list.error ? <Banner tone="error" message={list.error} action="Try again" onAction={list.reload} /> : null}

        {list.loading && !list.data ? (
          <Loading label="Loading the calendar…" />
        ) : byTime.length === 0 ? (
          <Card>
            <Empty
              icon="🗓"
              title="Nothing in this range"
              message="Try another day, or add a walk-in booking."
              action="Add a walk-in"
              onAction={() => navigation.navigate('WalkIn')}
            />
          </Card>
        ) : (
          byTime.map((appointment) => (
            <Pressable
              key={appointment.id}
              onPress={() => navigation.navigate('AppointmentDetail', { id: appointment.id })}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.cardHead}>
                <View style={styles.when}>
                  <Text style={styles.whenDay}>{formatDate(appointment.date, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                  <Text style={styles.whenTime}>
                    {formatTime12(appointment.startTime)} – {formatTime12(appointment.endTime)}
                  </Text>
                </View>
                <Badge label={STATUS_LABEL[appointment.status] ?? appointment.status} {...statusColors(appointment.status)} />
              </View>

              <Text style={styles.customer}>{appointment.customerName}</Text>
              <Text style={styles.services} numberOfLines={2}>
                {appointment.services.map((service) => service.name).join(', ')}
              </Text>

              <View style={styles.cardFoot}>
                <Text style={styles.meta}>
                  {appointment.staffName ?? 'unassigned'} · {appointment.bookingSource.replace(/_/g, ' ')}
                  {appointment.couponCode ? ` · ${appointment.couponCode}` : ''}
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.amount}>{formatMoney(appointment.totalAmount)}</Text>
                  <Text style={styles.paid}>
                    {appointment.paymentStatus === 'paid' ? 'Paid' : `${formatMoney(appointment.paidAmount)} paid`}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* One appointment                                                     */
/* ------------------------------------------------------------------ */

const NEXT_STEPS: Record<string, { label: string; status: string }[]> = {
  booked: [
    { label: 'Confirm', status: 'confirmed' },
    { label: 'Checked in', status: 'checked_in' },
    { label: 'Cancel', status: 'cancelled' },
  ],
  confirmed: [
    { label: 'Checked in', status: 'checked_in' },
    { label: 'Cancel', status: 'cancelled' },
  ],
  checked_in: [{ label: 'Start service', status: 'in_progress' }],
  in_progress: [{ label: 'Complete', status: 'completed' }],
};

export function AppointmentDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ AppointmentDetail: { id: string } }, 'AppointmentDetail'>>();
  const { user } = useAuth();

  const detail = useAsync(() => admin.appointment(route.params.id), [route.params.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_card' | 'wallet' | 'pay_at_salon'>('cash');

  const appointment = detail.data?.appointment as Appointment | undefined;
  const canAct = user && ['salon_owner', 'branch_manager', 'receptionist', 'super_admin'].includes(user.role);
  const isStylist = user?.role === 'salon_staff';

  const changeStatus = async (status: string) => {
    if (!appointment) return;
    setBusy(status);
    setError(null);
    setMessage(null);
    try {
      await admin.setAppointmentStatus(appointment.id, {
        status,
        ...(status === 'completed' ? { paymentMethod } : {}),
      });
      setMessage(`Marked ${STATUS_LABEL[status] ?? status}.`);
      await detail.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const markNoShow = () => {
    if (!appointment) return;
    Alert.alert('Mark as no-show?', 'This records that the customer did not turn up.', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Mark no-show',
        style: 'destructive',
        onPress: async () => {
          setBusy('no_show');
          setError(null);
          try {
            await admin.markNoShow(appointment.id);
            setMessage('Marked no-show.');
            await detail.reload();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  if (detail.loading && !appointment) return <Loading label="Loading the appointment…" />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Appointment</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {error ? <Banner tone="error" title="Not changed" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}

        {appointment ? (
          <>
            <Card>
              <View style={styles.cardHead}>
                <View style={styles.when}>
                  <Text style={styles.whenDay}>{formatDateLong(appointment.date)}</Text>
                  <Text style={styles.whenTime}>
                    {formatTime12(appointment.startTime)} – {formatTime12(appointment.endTime)} · {appointment.durationMinutes} min
                  </Text>
                </View>
                <Badge label={STATUS_LABEL[appointment.status] ?? appointment.status} {...statusColors(appointment.status)} />
              </View>

              <View style={styles.servicesBlock}>
                {appointment.services.map((service) => (
                  <View key={service.serviceId} style={styles.serviceRow}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.servicePrice}>{formatMoney(service.price)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.totals}>
                <Row label="Subtotal" value={formatMoney(appointment.subtotal)} />
                {appointment.discount > 0 ? <Row label="Discount" value={`− ${formatMoney(appointment.discount)}`} /> : null}
                <Row label="Total" value={formatMoney(appointment.totalAmount)} emphasis />
                <Row label="Paid" value={formatMoney(appointment.paidAmount)} />
                {appointment.paymentMethod ? <Row label="Method" value={appointment.paymentMethod.replace(/_/g, ' ')} /> : null}
              </View>
            </Card>

            <Card>
              <Row label="Customer" value={appointment.customerName} />
              <Row label="Phone" value={appointment.customerPhone} />
              <Row label="Stylist" value={appointment.staffName ?? 'unassigned'} />
              <Row label="Source" value={appointment.bookingSource.replace(/_/g, ' ')} />
              {appointment.couponCode ? <Row label="Coupon" value={appointment.couponCode} /> : null}
              {appointment.notes ? <Row label="Note" value={appointment.notes} /> : null}
              <Button
                label="Open customer file"
                variant="secondary"
                size="sm"
                style={{ marginTop: space(3) }}
                onPress={() => navigation.navigate('CustomerDetail', { id: appointment.customerId })}
              />
            </Card>

            {(NEXT_STEPS[appointment.status]?.length ?? 0) > 0 ? (
              <>
                <SectionTitle title="Move it along" />
                <Card>
                  {canAct ? (
                    <>
                      {appointment.status === 'in_progress' || appointment.status === 'checked_in' ? (
                        <>
                          <Text style={styles.payLabel}>How was the bill settled?</Text>
                          <View style={styles.payRow}>
                            {(['cash', 'upi_card', 'wallet', 'pay_at_salon'] as const).map((method) => (
                              <Chip
                                key={method}
                                label={method.replace(/_/g, ' ')}
                                active={paymentMethod === method}
                                onPress={() => setPaymentMethod(method)}
                              />
                            ))}
                          </View>
                        </>
                      ) : null}
                      <View style={styles.actionRow}>
                        {NEXT_STEPS[appointment.status]!.map((step) => (
                          <Button
                            key={step.status}
                            label={busy === step.status ? 'Working…' : step.label}
                            variant={step.status === 'cancelled' ? 'danger' : step.status === 'completed' ? 'success' : 'primary'}
                            onPress={() => void changeStatus(step.status)}
                            loading={busy === step.status}
                            disabled={!!busy && busy !== step.status}
                            style={{ flex: 1 }}
                          />
                        ))}
                      </View>
                      <Button
                        label="No-show"
                        variant="ghost"
                        onPress={markNoShow}
                        loading={busy === 'no_show'}
                        style={{ marginTop: space(2) }}
                      />
                    </>
                  ) : isStylist ? (
                    <View style={styles.actionRow}>
                      {appointment.status === 'checked_in' ? (
                        <Button label="Start service" onPress={() => void changeStatus('in_progress')} loading={busy === 'in_progress'} style={{ flex: 1 }} />
                      ) : (
                        <Button label="Complete" variant="success" onPress={() => void changeStatus('completed')} loading={busy === 'completed'} style={{ flex: 1 }} />
                      )}
                    </View>
                  ) : (
                    <Text style={styles.note}>Your role can view this appointment but not change it.</Text>
                  )}
                </Card>
              </>
            ) : null}

            {canAct && ['booked', 'confirmed'].includes(appointment.status) ? (
              <>
                <SectionTitle title="Move this visit" />
                <Card>
                  <Text style={styles.note}>
                    The server has no separate admin reschedule, so moving a visit releases this slot and books the new one —
                    the same result for the customer, and nothing silently edited.
                  </Text>
                  <Button
                    label={busy === 'move' ? 'Releasing the slot…' : 'Cancel & rebook'}
                    variant="secondary"
                    loading={busy === 'move'}
                    style={{ marginTop: space(3) }}
                    onPress={() =>
                      Alert.alert('Cancel this slot and book again?', 'The customer is told the visit was cancelled, then you book the new time.', [
                        { text: 'Keep it', style: 'cancel' },
                        {
                          text: 'Continue',
                          onPress: async () => {
                            setBusy('move');
                            setError(null);
                            try {
                              await admin.setAppointmentStatus(appointment.id, {
                                status: 'cancelled',
                                reason: 'Rescheduled at the salon',
                              });
                              await detail.reload();
                              navigation.navigate('WalkIn', {
                                customerId: appointment.customerId,
                                customerName: appointment.customerName,
                                customerPhone: appointment.customerPhone,
                                branchId: appointment.branchId,
                                serviceIds: appointment.services.map((service) => service.serviceId),
                              });
                            } catch (err) {
                              setError(errorMessage(err));
                            } finally {
                              setBusy(null);
                            }
                          },
                        },
                      ])
                    }
                  />
                </Card>
              </>
            ) : null}

            <Button label="Refresh" variant="ghost" onPress={() => void detail.reload()} />
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
  sub: { fontSize: font.size.sm, color: colors.ink500, marginTop: 2 },
  chips: { gap: space(2), paddingVertical: space(2) },
  chipDivider: { width: 1, backgroundColor: colors.ink100, marginHorizontal: space(1) },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: space(4), ...shadow.card },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space(3) },
  when: { flex: 1 },
  whenDay: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  whenTime: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  customer: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800, marginTop: space(3) },
  services: { fontSize: font.size.sm, color: colors.ink500, marginTop: 2 },
  cardFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space(3), marginTop: space(3), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  meta: { fontSize: font.size.xs, color: colors.ink400, flexShrink: 1 },
  amount: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  paid: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  servicesBlock: { marginTop: space(3), gap: space(1.5) },
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3) },
  serviceName: { flex: 1, fontSize: font.size.sm, color: colors.ink700 },
  servicePrice: { fontSize: font.size.sm, color: colors.ink500 },
  totals: { marginTop: space(3), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  payLabel: { fontSize: font.size.xs, color: colors.ink500, marginBottom: space(2) },
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginBottom: space(3) },
  actionRow: { flexDirection: 'row', gap: space(2) },
  note: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18 },
});
