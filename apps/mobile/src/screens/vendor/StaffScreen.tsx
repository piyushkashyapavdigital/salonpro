/**
 * The staff: who is on the floor, who is in today, and how to add someone.
 *
 * Attendance is recorded per day by the server (one row per staff member per
 * day). Adding someone is a plain add — name, number, role — there is no
 * invitation to send; the person then signs in to this app with their number
 * and a one-time code.
 */
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { admin, catalog } from '../../shared/endpoints';
import { errorMessage, useAsync } from '../../shared/hooks';
import { useAuth } from '../../shared/auth';
import { Avatar, Badge, Banner, Button, Card, Chip, Empty, Field, Loading, Row, SectionTitle } from '../../shared/components';
import { colors, font, radius, shadow, space } from '../../shared/theme';
import { isoDate } from '../../core';

const ATTENDANCE = ['present', 'absent', 'leave', 'half_day'] as const;

/** The roles the owner can hand out, in plain words. */
const ROLES = [
  { value: 'salon_staff', label: 'Stylist' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'branch_manager', label: 'Manager' },
] as const;

export function StaffScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const staff = useAsync(() => admin.staff(), []);
  const branches = useAsync(() => catalog.branches(), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', role: 'salon_staff' as (typeof ROLES)[number]['value'], branchId: '' });
  const [addBusy, setAddBusy] = useState(false);

  const canManage = ['salon_owner', 'super_admin', 'branch_manager'].includes(user?.role ?? '');

  const mark = async (staffId: string, status: (typeof ATTENDANCE)[number]) => {
    setBusy(staffId);
    setError(null);
    setMessage(null);
    try {
      await admin.markAttendance(staffId, { date: isoDate(), status });
      setMessage(`Attendance recorded: ${status.replace(/_/g, ' ')}.`);
      await staff.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const addStaff = async () => {
    const phone = form.phone.replace(/\D/g, '').slice(-10);
    if (form.name.trim().length < 2 || phone.length !== 10) {
      setError('Enter the staff member’s name and 10 digit mobile number.');
      return;
    }
    setAddBusy(true);
    setError(null);
    setMessage(null);
    try {
      const roleLabel = ROLES.find((r) => r.value === form.role)?.label ?? 'Stylist';
      await admin.createStaff({
        name: form.name.trim(),
        phone,
        role: form.role,
        designation: roleLabel,
        ...(form.branchId ? { branchId: form.branchId } : {}),
      });
      setMessage(`${form.name.trim()} is on the staff list. They sign in here with ${phone} and a one-time code.`);
      setAddOpen(false);
      setForm({ name: '', phone: '', role: 'salon_staff', branchId: '' });
      await staff.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAddBusy(false);
    }
  };

  const rows = staff.data?.staff ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Staff</Text>
          <Text style={styles.sub}>{rows.length} on the books</Text>
        </View>
        {canManage ? <Button label={addOpen ? 'Close' : 'Add'} size="sm" onPress={() => setAddOpen((value) => !value)} /> : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={staff.refreshing} onRefresh={staff.refresh} tintColor={colors.brand500} />}
      >
        {error ? <Banner tone="error" title="Not saved" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}
        {staff.error ? <Banner tone="error" message={staff.error} action="Try again" onAction={staff.reload} /> : null}

        {addOpen ? (
          <Card>
            <SectionTitle title="Add staff member" />
            <Field label="Name" value={form.name} onChangeText={(name) => setForm((c) => ({ ...c, name }))} autoCapitalize="words" placeholder="Meera" />
            <Field
              label="Mobile number"
              value={form.phone}
              onChangeText={(phone) => setForm((c) => ({ ...c, phone }))}
              keyboardType="phone-pad"
              maxLength={14}
              placeholder="98765 43210"
              hint="They sign in to this app with this number."
            />
            <Text style={styles.label}>Role</Text>
            <View style={styles.chips}>
              {ROLES.map((role) => (
                <Chip
                  key={role.value}
                  label={role.label}
                  active={form.role === role.value}
                  onPress={() => setForm((c) => ({ ...c, role: role.value }))}
                />
              ))}
            </View>
            {(branches.data?.branches.length ?? 0) > 1 ? (
              <>
                <Text style={styles.label}>Home branch</Text>
                <View style={styles.chips}>
                  {branches.data!.branches.map((branch) => (
                    <Chip
                      key={branch.id}
                      label={branch.name}
                      active={form.branchId === branch.id}
                      onPress={() => setForm((c) => ({ ...c, branchId: branch.id }))}
                    />
                  ))}
                </View>
              </>
            ) : null}
            <Button label={addBusy ? 'Adding…' : 'Add staff member'} loading={addBusy} onPress={() => void addStaff()} style={{ marginTop: space(3) }} />
            <Text style={styles.note}>
              No invitation is sent. The person can sign in right away with this number and a one-time code — on this demo
              server the code is shown on screen because no SMS provider is configured.
            </Text>
          </Card>
        ) : null}

        {staff.loading && !staff.data ? (
          <Loading label="Loading staff…" />
        ) : rows.length === 0 ? (
          <Card>
            <Empty icon="🧑‍🎨" title="No staff yet" message="Add your stylists and front desk so bookings can be assigned." />
          </Card>
        ) : (
          rows.map((member) => {
            const attendanceToday = (member as unknown as { attendance?: { date: string; status: string }[] }).attendance?.find(
              (entry) => entry.date === isoDate(),
            );
            return (
              <Card key={member.id}>
                <View style={styles.personRow}>
                  <Avatar name={member.name} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{member.name}</Text>
                    <Text style={styles.meta}>
                      {member.designation || 'stylist'} · {member.branchName ?? 'no branch'} · {member.phone}
                    </Text>
                  </View>
                  <Badge
                    label={member.status === 'active' ? 'active' : member.status}
                    bg={member.status === 'active' ? colors.mintSoft : colors.ink100}
                    fg={member.status === 'active' ? colors.mint : colors.ink600}
                  />
                </View>

                <Row label="Today" value={attendanceToday ? attendanceToday.status.replace(/_/g, ' ') : 'not marked'} />
                {member.commissionRules ? (
                  <Row
                    label="Commission"
                    value={`${(((member.commissionRules as { serviceBps?: number }).serviceBps ?? 0) / 100).toFixed(1)}% of services`}
                  />
                ) : null}

                <View style={styles.attendanceRow}>
                  {ATTENDANCE.map((status) => (
                    <Pressable
                      key={status}
                      disabled={busy === member.id}
                      onPress={() =>
                        Alert.alert('Mark attendance', `${member.name} — ${status.replace(/_/g, ' ')} for today?`, [
                          { text: 'Back', style: 'cancel' },
                          { text: 'Record', onPress: () => void mark(member.id, status) },
                        ])
                      }
                      style={[styles.attendance, attendanceToday?.status === status && styles.attendanceActive]}
                    >
                      <Text style={[styles.attendanceText, attendanceToday?.status === status && styles.attendanceTextActive]}>
                        {status.replace(/_/g, ' ')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            );
          })
        )}
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
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  name: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  label: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(3), marginBottom: space(1.5) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  attendanceRow: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  attendance: { flex: 1, alignItems: 'center', paddingVertical: space(2.5), borderRadius: radius.sm, borderWidth: 1, borderColor: colors.ink200, backgroundColor: colors.white },
  attendanceActive: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  attendanceText: { fontSize: 10, color: colors.ink600, fontWeight: font.weight.semibold, textTransform: 'capitalize' },
  attendanceTextActive: { color: colors.white },
  note: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(3) },
});
