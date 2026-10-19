/**
 * Walk-in booking at the desk: an existing customer or a brand new one, the
 * services, and the first free slot.
 *
 * The desk flow is deliberately fast — the date defaults to today, the slot list
 * is asked of the server, and confirming drops straight into the appointment.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { admin, catalog } from '../shared/endpoints';
import { errorMessage, useAsync, useDebounced } from '../shared/hooks';
import { Banner, Button, Card, Chip, Empty, Field, Loading, Row, SectionTitle } from '../shared/components';
import { colors, font, radius, shadow, space } from '../shared/theme';
import { addDays, formatDate, formatMoney, formatTime12, isoDate } from '../core';

export function WalkInScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preset = route.params ?? {};

  const services = useAsync(() => catalog.services(), []);
  const branches = useAsync(() => catalog.branches(), []);

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const customers = useAsync(() => (debounced.length >= 3 ? admin.customers({ search: debounced, limit: 10 }) : Promise.resolve({ customers: [] })), [debounced]);

  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string } | null>(
    preset.customerId ? { id: preset.customerId, name: preset.customerName ?? '', phone: preset.customerPhone ?? '' } : null,
  );
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [branchId, setBranchId] = useState<string | null>(preset.branchId ?? null);
  const [selected, setSelected] = useState<string[]>(preset.serviceIds ?? []);
  const [date, setDate] = useState(isoDate());
  const [slot, setSlot] = useState<{ startTime: string; staffId: string; staffName: string } | null>(null);
  const [notes, setNotes] = useState('');
  const [preference, setPreference] = useState<'pay_at_salon' | 'cash' | 'wallet'>('pay_at_salon');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeBranch = branchId ?? branches.data?.branches.find((b) => b.status === 'active')?.id ?? null;
  const serviceList = services.data?.services ?? [];
  const chosen = useMemo(() => serviceList.filter((service) => selected.includes(service.id)), [serviceList, selected]);
  const days = useMemo(() => Array.from({ length: 10 }, (_, index) => addDays(isoDate(), index)), []);
  const total = chosen.reduce((sum, service) => sum + service.price, 0);

  const availability = useAsync(
    async () => {
      if (!activeBranch || !selected.length) return null;
      return admin.availability({ branchId: activeBranch, date, serviceIds: selected });
    },
    [activeBranch, date, selected.join(',')],
  );

  const confirm = async () => {
    setError(null);
    setMessage(null);
    if (!activeBranch) {
      setError('Choose a branch.');
      return;
    }
    if (!selected.length) {
      setError('Choose at least one service.');
      return;
    }
    if (!slot) {
      setError('Pick a time.');
      return;
    }
    if (!customer && (!newName.trim() || newPhone.replace(/\D/g, '').length !== 10)) {
      setError('Pick an existing customer, or enter a name and 10 digit phone number.');
      return;
    }
    setBusy(true);
    try {
      const result = await admin.createAppointment({
        ...(customer ? { customerId: customer.id } : { customerName: newName.trim(), customerPhone: newPhone.replace(/\D/g, '').slice(-10) }),
        branchId: activeBranch,
        serviceIds: selected,
        date,
        startTime: slot.startTime,
        staffId: slot.staffId,
        notes: notes.trim() || null,
        paymentPreference: preference,
        bookingSource: 'walk_in',
      });
      setMessage('Booking created.');
      navigation.replace('AppointmentDetail', { id: result.appointment.id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Walk-in booking</Text>
          <Text style={styles.sub}>{chosen.length ? `${chosen.length} services · ${formatMoney(total)}` : 'Pick the customer and services'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {error ? <Banner tone="error" title="Not booked" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}

        <SectionTitle title="Customer" />
        <Card>
          {customer ? (
            <View style={styles.selectedCustomer}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{customer.name || 'Customer'}</Text>
                <Text style={styles.customerMeta}>{customer.phone}</Text>
              </View>
              <Button label="Change" variant="ghost" size="sm" onPress={() => setCustomer(null)} />
            </View>
          ) : (
            <>
              <Field
                label="Find a customer"
                value={search}
                onChangeText={setSearch}
                placeholder="Name or phone (3+ characters)"
                autoCapitalize="none"
              />
              {customers.data?.customers.map((row: any) => (
                <Pressable
                  key={row.customerId}
                  onPress={() => {
                    setCustomer({ id: row.customerId, name: row.name, phone: row.phone });
                    setSearch('');
                  }}
                  style={styles.customerRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerName}>{row.name}</Text>
                    <Text style={styles.customerMeta}>
                      {row.phone} · {row.totalVisits ?? 0} visits
                    </Text>
                  </View>
                  <MaterialIcons name="add-circle-outline" size={20} color={colors.brand600} />
                </Pressable>
              ))}
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or add a new customer</Text>
                <View style={styles.orLine} />
              </View>
              <Field label="Name" value={newName} onChangeText={setNewName} placeholder="Walk-in customer name" autoCapitalize="words" />
              <Field label="Phone" value={newPhone} onChangeText={setNewPhone} placeholder="98765 43210" keyboardType="phone-pad" maxLength={14} />
            </>
          )}
        </Card>

        {(branches.data?.branches.length ?? 0) > 1 ? (
          <>
            <SectionTitle title="Branch" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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
        <Card>
          {services.loading && !services.data ? <Loading label="Loading the menu…" /> : null}
          {serviceList.map((service) => {
            const active = selected.includes(service.id);
            return (
              <Pressable
                key={service.id}
                onPress={() => {
                  setSlot(null);
                  setSelected((current) => (current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id]));
                }}
                style={styles.serviceRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <Text style={styles.serviceMeta}>
                    {formatMoney(service.price)} · {service.durationMinutes} min · {service.category}
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
        </Card>

        {selected.length ? (
          <>
            <SectionTitle title="Time" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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
                <Empty icon="⏳" title="No free slots" message="Try another day, or squeeze the customer in after closing." />
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
                      <Text style={[styles.slotTime, active && styles.slotTextActive]}>{formatTime12(option.startTime)}</Text>
                      <Text style={[styles.slotStaff, active && styles.slotTextActive]} numberOfLines={1}>
                        {option.staffName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        ) : null}

        <SectionTitle title="Payment & notes" />
        <Card>
          <View style={styles.chips}>
            {(['pay_at_salon', 'cash', 'wallet'] as const).map((option) => (
              <Chip
                key={option}
                label={option.replace(/_/g, ' ')}
                active={preference === option}
                onPress={() => setPreference(option)}
              />
            ))}
          </View>
          <Field
            label="Note for the stylist"
            value={notes}
            onChangeText={setNotes}
            placeholder="Walk-in, prefers the senior stylist"
            multiline
            numberOfLines={2}
          />
          <Row label="Total" value={formatMoney(total)} emphasis />
          <Button
            label={busy ? 'Booking…' : slot ? `Book ${formatTime12(slot.startTime)}${slot.staffName ? ` with ${slot.staffName}` : ''}` : 'Choose a time'}
            size="lg"
            loading={busy}
            disabled={!slot}
            onPress={() => void confirm()}
            style={{ marginTop: space(3) }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  sub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  chips: { gap: space(2), paddingVertical: space(1) },
  selectedCustomer: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ink100 },
  customerName: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink900 },
  customerMeta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginVertical: space(3) },
  orLine: { flex: 1, height: 1, backgroundColor: colors.ink100 },
  orText: { fontSize: font.size.xs, color: colors.ink400 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ink100 },
  serviceName: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink900 },
  serviceMeta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  slot: { width: '31.5%', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink200, paddingVertical: space(2.5), alignItems: 'center', ...shadow.card },
  slotActive: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  slotTime: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.ink800 },
  slotTextActive: { color: colors.white },
  slotStaff: { fontSize: 9, color: colors.ink400 },
});
