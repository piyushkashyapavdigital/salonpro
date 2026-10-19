/**
 * Booking, as one screen: branch → services → day → time → how to pay.
 *
 * Availability is asked of the server for the chosen day and services (never
 * computed on the phone), so a slot shown here is a slot the server will accept.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { catalog, customer } from '../shared/endpoints';
import { errorMessage, useAsync } from '../shared/hooks';
import { useAuth } from '../shared/auth';
import { Banner, Button, Card, Chip, Empty, Field, Loading, SectionTitle } from '../shared/components';
import { colors, font, radius, shadow, space } from '../shared/theme';
import { addDays, formatDate, formatMoney, formatTime12, isoDate } from '../core';
import type { TabParamList } from '../navigation';

const DAYS_AHEAD = 14;

export function BookScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<TabParamList, 'Book'>>();
  const { wallet } = useAuth();

  const branches = useAsync(() => catalog.branches(), []);
  const services = useAsync(() => catalog.services(), []);

  const [branchId, setBranchId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(route.params?.serviceId ? [route.params.serviceId] : []);
  const [date, setDate] = useState(() => isoDate());
  const [slot, setSlot] = useState<{ startTime: string; staffId: string; staffName: string } | null>(null);
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; description: string } | null>(null);
  const [preference, setPreference] = useState<'wallet' | 'pay_at_salon'>('pay_at_salon');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponState, setCouponState] = useState<string | null>(null);

  const activeBranch = branchId ?? branches.data?.branches.find((b) => b.status === 'active')?.id ?? null;
  const serviceList = services.data?.services ?? [];
  const chosen = useMemo(() => serviceList.filter((s) => selected.includes(s.id)), [serviceList, selected]);
  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(isoDate(), i)), []);

  const availability = useAsync(
    async () => {
      if (!activeBranch || !selected.length) return null;
      return catalog.availability({ branchId: activeBranch, date, serviceIds: selected });
    },
    [activeBranch, date, selected.join(',')],
  );

  const subtotal = chosen.reduce((sum, service) => sum + service.price, 0);
  const discount = appliedCoupon?.discount ?? 0;
  const total = Math.max(0, subtotal - discount);
  const walletBalance = wallet?.totalBalance ?? 0;
  const walletCovers = walletBalance >= total;

  const toggleService = (id: string) => {
    setSlot(null);
    setSelected((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  };

  const applyCoupon = async () => {
    setCouponState(null);
    if (!coupon.trim()) return;
    try {
      const result = await catalog.validateCoupon({ code: coupon.trim().toUpperCase(), amount: subtotal });
      setAppliedCoupon(result);
      setCouponState(`Saved ${formatMoney(result.discount)} — ${result.description}`);
    } catch (err) {
      setAppliedCoupon(null);
      setCouponState(errorMessage(err));
    }
  };

  const confirm = useCallback(async () => {
    setError(null);
    if (!activeBranch || !selected.length || !slot) {
      setError('Choose a branch, at least one service, and a time.');
      return;
    }
    setBusy(true);
    try {
      const result = await customer.book({
        branchId: activeBranch,
        serviceIds: selected,
        date,
        startTime: slot.startTime,
        staffId: slot.staffId,
        couponCode: appliedCoupon?.code ?? null,
        notes: notes.trim() || null,
        paymentPreference: preference,
        idempotencyKey: `app-${Date.now()}-${selected.length}`,
      });
      navigation.navigate('VisitDetail', { id: result.appointment.id });
      setSlot(null);
      setSelected([]);
      setAppliedCoupon(null);
      setCoupon('');
      setNotes('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [activeBranch, selected, slot, date, appliedCoupon, notes, preference, navigation]);

  if (branches.loading && !branches.data) return <Loading label="Loading the salon…" />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Book an appointment</Text>
        <Text style={styles.sub}>
          {chosen.length ? `${chosen.length} service${chosen.length > 1 ? 's' : ''} · ${formatMoney(total)}` : 'Pick a service to see times'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {error ? <Banner tone="error" title="Booking not created" message={error} /> : null}

        {(branches.data?.branches.length ?? 0) > 1 ? (
          <>
            <SectionTitle title="Branch" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {branches.data!.branches.map((branch) => (
                <Chip
                  key={branch.id}
                  label={branch.name}
                  active={branch.id === activeBranch}
                  onPress={() => {
                    setBranchId(branch.id);
                    setSlot(null);
                  }}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        <SectionTitle title="Services" />
        {services.error ? <Banner tone="error" message={services.error} /> : null}
        {(services.data?.categories ?? []).map((category) => (
          <View key={category} style={{ gap: space(2) }}>
            <Text style={styles.category}>{category}</Text>
            {serviceList
              .filter((service) => service.category === category && service.active !== false)
              .map((service) => {
                const active = selected.includes(service.id);
                return (
                  <Pressable
                    key={service.id}
                    onPress={() => toggleService(service.id)}
                    style={[styles.serviceRow, active && styles.serviceRowActive]}
                  >
                    <Text style={styles.serviceEmoji}>{service.imageEmoji || '✨'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceName}>{service.name}</Text>
                      <Text style={styles.serviceMeta}>
                        {formatMoney(service.price)} · {service.durationMinutes} min
                      </Text>
                    </View>
                    <MaterialIcons
                      name={active ? 'check-circle' : 'radio-button-unchecked'}
                      size={22}
                      color={active ? colors.brand600 : colors.ink200}
                    />
                  </Pressable>
                );
              })}
          </View>
        ))}

        {selected.length > 0 ? (
          <>
            <SectionTitle title="Day" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {days.map((day) => (
                <Chip
                  key={day}
                  label={formatDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}
                  active={day === date}
                  onPress={() => {
                    setDate(day);
                    setSlot(null);
                  }}
                />
              ))}
            </ScrollView>

            <SectionTitle title="Time" />
            {availability.loading ? (
              <Card>
                <Loading label="Checking the calendar…" />
              </Card>
            ) : availability.data?.closed ? (
              <Card>
                <Empty icon="🏖" title="Closed that day" message={availability.data.reason ?? 'The salon is closed — try another day.'} />
              </Card>
            ) : (availability.data?.slots.length ?? 0) === 0 ? (
              <Card>
                <Empty icon="⏳" title="No free slots" message="Everything is booked for that day. Try the next day or another branch." />
              </Card>
            ) : (
              <View style={styles.slotGrid}>
                {availability.data!.slots.map((option) => {
                  const active = slot?.startTime === option.startTime && slot?.staffId === option.staffId;
                  return (
                    <Pressable
                      key={`${option.startTime}-${option.staffId}`}
                      onPress={() => setSlot({ startTime: option.startTime, staffId: option.staffId, staffName: option.staffName })}
                      style={[styles.slot, active && styles.slotActive]}
                    >
                      <Text style={[styles.slotTime, active && styles.slotTimeActive]}>{formatTime12(option.startTime)}</Text>
                      <Text style={[styles.slotStaff, active && styles.slotStaffActive]} numberOfLines={1}>
                        {option.staffName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <SectionTitle title="Payment" />
            <Card>
              <Pressable onPress={() => setPreference('pay_at_salon')} style={styles.payRow}>
                <MaterialIcons
                  name={preference === 'pay_at_salon' ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={22}
                  color={preference === 'pay_at_salon' ? colors.brand600 : colors.ink300}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.payTitle}>Pay at the salon</Text>
                  <Text style={styles.paySub}>Settle the bill when you arrive — cash, UPI or card.</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setPreference('wallet')} style={[styles.payRow, styles.payRowBorder]}>
                <MaterialIcons
                  name={preference === 'wallet' ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={22}
                  color={preference === 'wallet' ? colors.brand600 : colors.ink300}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.payTitle}>Use wallet balance</Text>
                  <Text style={styles.paySub}>
                    {formatMoney(walletBalance)} available
                    {walletBalance === 0 ? ' — recharge first' : walletCovers ? ' · covers this booking' : ' · part payment, rest at the salon'}
                  </Text>
                </View>
              </Pressable>
              <Text style={styles.payNote}>
                Card and UPI online payment is charged through the salon's payment provider and only marked paid after the
                server verifies it. If the payment sheet is unavailable, use the wallet or pay at the salon.
              </Text>
            </Card>

            <SectionTitle title="Coupon & notes" />
            <Card>
              <View style={styles.couponRow}>
                <Field label="Coupon code" value={coupon} onChangeText={setCoupon} placeholder="WELCOME20" autoCapitalize="characters" style={{ flex: 1 }} />
                <Button label="Apply" variant="secondary" onPress={() => void applyCoupon()} size="sm" />
              </View>
              {couponState ? <Text style={styles.couponState}>{couponState}</Text> : null}
              <Field
                label="Anything the salon should know?"
                value={notes}
                onChangeText={setNotes}
                placeholder="Allergies, preferred stylist, occasion…"
                multiline
                numberOfLines={3}
                style={{ minHeight: 76, textAlignVertical: 'top' }}
              />
            </Card>

            <Card>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Services</Text>
                <Text style={styles.totalValue}>{formatMoney(subtotal)}</Text>
              </View>
              {discount > 0 ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Coupon {appliedCoupon?.code}</Text>
                  <Text style={[styles.totalValue, { color: colors.mint }]}>−{formatMoney(discount)}</Text>
                </View>
              ) : null}
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <Text style={styles.grandLabel}>Total</Text>
                <Text style={styles.grandValue}>{formatMoney(total)}</Text>
              </View>
              <Button
                label={busy ? 'Booking…' : slot ? `Confirm ${formatTime12(slot.startTime)}` : 'Choose a time first'}
                onPress={() => void confirm()}
                loading={busy}
                disabled={!slot}
                size="lg"
                style={{ marginTop: space(3) }}
              />
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(2) },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.ink900, letterSpacing: -0.6 },
  sub: { fontSize: font.size.sm, color: colors.ink500, marginTop: 2 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  chipRow: { gap: space(2), paddingVertical: space(1) },
  category: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.ink400, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: space(2) },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.white, borderRadius: radius.lg, padding: space(3.5), ...shadow.card },
  serviceRowActive: { borderWidth: 1.5, borderColor: colors.brand400 },
  serviceEmoji: { fontSize: 22 },
  serviceName: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink900 },
  serviceMeta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  slot: { width: '31.5%', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink200, paddingVertical: space(2.5), alignItems: 'center', gap: 2 },
  slotActive: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  slotTime: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.ink800 },
  slotTimeActive: { color: colors.white },
  slotStaff: { fontSize: 9, color: colors.ink400, paddingHorizontal: 2 },
  slotStaffActive: { color: '#EADCF6' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2) },
  payRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100, marginTop: space(1), paddingTop: space(3) },
  payTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink900 },
  paySub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  payNote: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 17, marginTop: space(3) },
  couponRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2) },
  couponState: { fontSize: font.size.xs, color: colors.ink600, marginTop: space(2) },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space(1.5) },
  totalLabel: { fontSize: font.size.sm, color: colors.ink500 },
  totalValue: { fontSize: font.size.sm, color: colors.ink800, fontWeight: font.weight.semibold },
  grandTotalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100, marginTop: space(2), paddingTop: space(3) },
  grandLabel: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  grandValue: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.brand700 },
});
