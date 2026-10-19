/**
 * Settings: the salon's own details, how wallets spend, branches and holidays,
 * who works here and with what role, and the audit log.
 *
 * Only the owner sees the editing affordances; the server enforces the same rule,
 * so a manager opening this screen gets read-only views rather than a form that
 * fails on save.
 */
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../shared/auth';
import { admin } from '../shared/endpoints';
import { errorMessage, useAsync } from '../shared/hooks';
import { Badge, Banner, Button, Card, Chip, Empty, Field, Loading, Row, SectionTitle } from '../shared/components';
import { colors, font, radius, shadow, space } from '../shared/theme';
import { formatDateTime, formatMoney, isoDate } from '../core';

const ROLES = ['salon_owner', 'branch_manager', 'receptionist', 'salon_staff'] as const;

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const settings = useAsync(() => admin.settings(), []);
  const branches = useAsync(() => admin.branches(), []);
  const users = useAsync(() => admin.users(), []);
  const audit = useAsync(() => admin.audit({ limit: 60 }), []);

  const [tab, setTab] = useState<'salon' | 'branches' | 'people' | 'audit'>('salon');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isOwner = ['salon_owner', 'super_admin'].includes(user?.role ?? '');
  const salon = settings.data?.salon;
  const rules = salon?.settings;

  const [form, setForm] = useState<{ name: string; address: string; contact: string } | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [newBranch, setNewBranch] = useState<{ name: string; address: string; contact: string } | null>(null);

  const run = async (action: () => Promise<unknown>, note: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(note);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveSalon = async () => {
    if (!form) return;
    if (form.name.trim().length < 2 || form.address.trim().length < 4) {
      setError('The salon needs a name and an address.');
      return;
    }
    await run(async () => {
      await admin.updateSettings({
        name: form.name.trim(),
        address: form.address.trim(),
        contact: form.contact.trim() || null,
      });
      setForm(null);
      await settings.reload();
    }, 'Salon details saved.');
  };

  const saveRules = async (body: Record<string, unknown>, note: string) => {
    await run(async () => {
      await admin.updateSettings(body);
      await settings.reload();
    }, note);
  };

  const createBranch = async () => {
    if (!newBranch) return;
    if (newBranch.name.trim().length < 2 || newBranch.address.trim().length < 4) {
      setError('A branch needs a name and an address.');
      return;
    }
    // The server wants whole-week opening hours; a new branch starts on the
    // salon's usual nine-to-nine, with Sunday closed, and can be edited later.
    const openingHours = Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [
        day,
        day === 'sun' ? { closed: true, open: '10:00', close: '20:00' } : { closed: false, open: '10:00', close: '21:00' },
      ]),
    );
    await run(async () => {
      await admin.createBranch({
        name: newBranch.name.trim(),
        address: newBranch.address.trim(),
        contact: newBranch.contact.trim() || null,
        openingHours,
        status: 'active',
      });
      setNewBranch(null);
      await branches.reload();
    }, 'Branch added.');
  };

  const [holidayDraft, setHolidayDraft] = useState<{ branchId: string; date: string; reason: string } | null>(null);

  const saveHoliday = async () => {
    if (!holidayDraft) return;
    const date = holidayDraft.date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Write the date as 2026-08-26.');
      return;
    }
    await run(async () => {
      await admin.addHoliday(holidayDraft.branchId, { date, reason: holidayDraft.reason.trim() || 'Salon holiday' });
      setHolidayDraft(null);
      await Promise.all([branches.reload(), audit.reload()]);
    }, `Closed on ${date}.`);
  };

  const changeRole = (id: string, name: string, role: string) =>
    Alert.alert(`Change ${name}'s role`, `Set their access to ${role.replace(/_/g, ' ')}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Change',
        onPress: () =>
          void run(async () => {
            await admin.updateUser(id, { role });
            await Promise.all([users.reload(), audit.reload()]);
          }, `${name} is now ${role.replace(/_/g, ' ')}.`),
      },
    ]);

  const setStatus = (id: string, name: string, status: 'active' | 'deactivated') =>
    void run(async () => {
      await admin.updateUser(id, { status });
      await Promise.all([users.reload(), audit.reload()]);
    }, status === 'active' ? `${name} can sign in again.` : `${name} cannot sign in any more.`);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.sub}>{salon?.name ?? 'Salon'}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={settings.refreshing || branches.refreshing || users.refreshing}
            onRefresh={() => {
              settings.refresh();
              branches.refresh();
              users.refresh();
              audit.refresh();
            }}
            tintColor={colors.brand500}
          />
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          <Chip label="Salon" active={tab === 'salon'} onPress={() => setTab('salon')} />
          <Chip label="Branches" active={tab === 'branches'} onPress={() => setTab('branches')} />
          <Chip label="People & roles" active={tab === 'people'} onPress={() => setTab('people')} />
          <Chip label="Audit log" active={tab === 'audit'} onPress={() => setTab('audit')} />
        </ScrollView>

        {error ? <Banner tone="error" title="Not saved" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}

        {tab === 'salon' ? (
          settings.loading && !salon ? (
            <Loading label="Loading settings…" />
          ) : (
            <>
              <SectionTitle title="The salon" />
              <Card>
                {form || brandOpen ? (
                  <>
                    <Field label="Name" value={form?.name ?? salon?.name ?? ''} onChangeText={(name) => setForm((current) => ({ name, address: current?.address ?? salon?.address ?? '', contact: current?.contact ?? salon?.contact ?? '' }))} editable={isOwner} />
                    <Field
                      label="Address"
                      value={form?.address ?? salon?.address ?? ''}
                      onChangeText={(address) => setForm((current) => ({ name: current?.name ?? salon?.name ?? '', address, contact: current?.contact ?? salon?.contact ?? '' }))}
                      multiline
                      numberOfLines={2}
                      editable={isOwner}
                    />
                    <Field
                      label="Contact"
                      value={form?.contact ?? salon?.contact ?? ''}
                      onChangeText={(contact) => setForm((current) => ({ name: current?.name ?? salon?.name ?? '', address: current?.address ?? salon?.address ?? '', contact }))}
                      placeholder="Phone or email shown to customers"
                      editable={isOwner}
                    />
                    <View style={styles.actionRow}>
                      <Button
                        label="Cancel"
                        variant="ghost"
                        style={{ flex: 1 }}
                        onPress={() => {
                          setForm(null);
                          setBrandOpen(false);
                        }}
                      />
                      <Button label={busy ? 'Saving…' : 'Save'} loading={busy} style={{ flex: 1 }} onPress={() => void saveSalon()} />
                    </View>
                  </>
                ) : (
                  <>
                    <Row label="Name" value={salon?.name ?? '—'} />
                    <Row label="Address" value={salon?.address ?? '—'} />
                    <Row label="Contact" value={salon?.contact ?? '—'} />
                    <Row label="Timezone" value={salon?.timezone ?? '—'} />
                    {isOwner ? (
                      <Button label="Edit salon details" variant="secondary" style={{ marginTop: space(3) }} onPress={() => setBrandOpen(true)} />
                    ) : null}
                  </>
                )}
              </Card>

              <SectionTitle title="Wallets & loyalty" />
              <Card>
                <Text style={styles.label}>When a visit is paid from the wallet, spend</Text>
                <View style={styles.chips}>
                  {(['bonus', 'cash'] as const).map((order, index) => (
                    <Chip
                      key={order}
                      label={`${order} first`}
                      active={rules?.spendingOrder?.[0] === order}
                      onPress={() => isOwner && void saveRules({ spendingOrder: index === 0 ? ['bonus', 'cash'] : ['cash', 'bonus'] }, `${order} is spent first.`)}
                    />
                  ))}
                </View>
                <Row label="Bonus expires after" value={rules?.bonusExpiryDays ? `${rules.bonusExpiryDays} days` : 'never'} />
                <Row label="Slot size" value={`${rules?.slotGranularityMinutes ?? 15} minutes`} />
                <Row label="Loyalty points" value={rules?.loyaltyEnabled ? `${rules.loyaltyPointsPerHundred ?? 0} per ₹100` : 'off'} />
                {isOwner ? (
                  <View style={styles.actionRow}>
                    <Button
                      label={rules?.loyaltyEnabled ? 'Switch loyalty off' : 'Switch loyalty on'}
                      variant="secondary"
                      style={{ flex: 1 }}
                      onPress={() => void saveRules({ loyaltyEnabled: !rules?.loyaltyEnabled }, rules?.loyaltyEnabled ? 'Loyalty switched off.' : 'Loyalty switched on.')}
                    />
                    <Button
                      label={rules?.bonusExpiryDays ? 'Bonus never expires' : 'Expire bonus in 365 days'}
                      variant="secondary"
                      style={{ flex: 1 }}
                      onPress={() => void saveRules({ bonusExpiryDays: rules?.bonusExpiryDays ? null : 365 }, 'Bonus expiry updated.')}
                    />
                  </View>
                ) : null}
              </Card>

              <SectionTitle title="Refund policy" />
              <Card>
                <Text style={styles.note}>{settings.data?.refundPolicy}</Text>
              </Card>
            </>
          )
        ) : null}

        {tab === 'branches' ? (
          <>
            {branches.error ? <Banner tone="error" message={branches.error} action="Try again" onAction={branches.reload} /> : null}
            {(branches.data?.branches ?? []).map((branch) => (
              <Card key={branch.id}>
                <View style={styles.branchHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.branchName}>{branch.name}</Text>
                    <Text style={styles.note}>{branch.address}</Text>
                  </View>
                  <Badge
                    label={branch.status === 'active' ? 'open' : 'closed'}
                    bg={branch.status === 'active' ? colors.mintSoft : colors.ink100}
                    fg={branch.status === 'active' ? colors.mint : colors.ink600}
                  />
                </View>
                <Row label="Team" value={`${branch.staffCount} people`} />
                <Row label="Customers served" value={String(branch.customers)} />
                <Row label="Appointments" value={String(branch.appointments)} />
                <Row label="Revenue all time" value={formatMoney(branch.revenue)} />
                {branch.holidays.length ? (
                  <Row
                    label="Holidays"
                    value={branch.holidays
                      .slice(-4)
                      .map((holiday) => holiday.date)
                      .join(', ')}
                  />
                ) : null}
                {isOwner && holidayDraft?.branchId === branch.id ? (
                  <View style={styles.holidayForm}>
                    <Field
                      label="Closed on (YYYY-MM-DD)"
                      value={holidayDraft.date}
                      onChangeText={(date) => setHolidayDraft((current) => (current ? { ...current, date } : current))}
                      placeholder={isoDate()}
                    />
                    <Field
                      label="Reason"
                      value={holidayDraft.reason}
                      onChangeText={(reason) => setHolidayDraft((current) => (current ? { ...current, reason } : current))}
                      placeholder="Diwali"
                    />
                    <View style={styles.actionRow}>
                      <Button label="Cancel" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => setHolidayDraft(null)} />
                      <Button label={busy ? 'Saving…' : 'Mark closed'} size="sm" loading={busy} style={{ flex: 1 }} onPress={() => void saveHoliday()} />
                    </View>
                  </View>
                ) : null}
                {isOwner ? (
                  <View style={styles.actionRow}>
                    <Button
                      label="Add holiday"
                      variant="secondary"
                      size="sm"
                      style={{ flex: 1 }}
                      onPress={() => setHolidayDraft({ branchId: branch.id, date: isoDate(), reason: '' })}
                    />
                    <Button
                      label={branch.status === 'active' ? 'Close branch' : 'Reopen branch'}
                      variant="ghost"
                      size="sm"
                      style={{ flex: 1 }}
                      onPress={() =>
                        void run(async () => {
                          await admin.updateBranch(branch.id, { status: branch.status === 'active' ? 'inactive' : 'active' });
                          await Promise.all([branches.reload(), audit.reload()]);
                        }, branch.status === 'active' ? `${branch.name} is closed for new bookings.` : `${branch.name} is open again.`)
                      }
                    />
                  </View>
                ) : null}
              </Card>
            ))}

            {isOwner ? (
              <>
                <SectionTitle title="Add a branch" />
                <Card>
                  {newBranch ? (
                    <>
                      <Field
                        label="Name"
                        value={newBranch.name}
                        onChangeText={(name) => setNewBranch((current) => ({ name, address: current?.address ?? '', contact: current?.contact ?? '' }))}
                      />
                      <Field
                        label="Address"
                        value={newBranch.address}
                        onChangeText={(address) => setNewBranch((current) => ({ name: current?.name ?? '', address, contact: current?.contact ?? '' }))}
                        multiline
                        numberOfLines={2}
                      />
                      <Field
                        label="Contact"
                        value={newBranch.contact}
                        onChangeText={(contact) => setNewBranch((current) => ({ name: current?.name ?? '', address: current?.address ?? '', contact }))}
                        placeholder="optional"
                      />
                      <View style={styles.actionRow}>
                        <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => setNewBranch(null)} />
                        <Button label={busy ? 'Saving…' : 'Add branch'} loading={busy} style={{ flex: 1 }} onPress={() => void createBranch()} />
                      </View>
                    </>
                  ) : (
                    <Button label="New branch" variant="secondary" onPress={() => setNewBranch({ name: '', address: '', contact: '' })} />
                  )}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'people' ? (
          <>
            {users.error ? <Banner tone="error" message={users.error} action="Try again" onAction={users.reload} /> : null}
            <Text style={styles.note}>
              Customers who were referred show up here too, read-only, so the front desk can see who brought whom.
            </Text>
            {(users.data?.users ?? []).map((person) => (
              <Card key={person.id}>
                <View style={styles.branchHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.branchName}>{person.name}</Text>
                    <Text style={styles.note}>
                      {person.phone} · {person.branchNames || 'all branches'} · {person.activeSessions} active sessions
                    </Text>
                  </View>
                  <Badge
                    label={person.status}
                    bg={person.status === 'active' ? colors.mintSoft : colors.ink100}
                    fg={person.status === 'active' ? colors.mint : colors.ink600}
                  />
                </View>
                <Row label="Role" value={person.role.replace(/_/g, ' ')} />
                {isOwner && person.role !== 'customer' && person.id !== user?.id ? (
                  <>
                    <View style={styles.chips}>
                      {ROLES.map((role) => (
                        <Chip key={role} label={role.replace(/_/g, ' ')} active={person.role === role} onPress={() => changeRole(person.id, person.name, role)} />
                      ))}
                    </View>
                    <Button
                      label={person.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      variant={person.status === 'active' ? 'danger' : 'secondary'}
                      size="sm"
                      style={{ marginTop: space(2) }}
                      onPress={() => setStatus(person.id, person.name, person.status === 'active' ? 'deactivated' : 'active')}
                    />
                  </>
                ) : null}
              </Card>
            ))}
          </>
        ) : null}

        {tab === 'audit' ? (
          <>
            {audit.error ? <Banner tone="error" message={audit.error} action="Try again" onAction={audit.reload} /> : null}
            <Card>
              <Text style={styles.note}>
                Every change to money, roles, settings and appointments is written here with the person who did it. Entries are
                never edited or deleted.
              </Text>
            </Card>
            {(audit.data?.logs ?? []).length === 0 ? (
              <Card>
                <Empty icon="🗂" title="Nothing logged yet" />
              </Card>
            ) : (
              audit.data!.logs.map((entry) => (
                <Card key={entry.id}>
                  <View style={styles.logHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logAction}>{entry.action.replace(/\./g, ' › ').replace(/_/g, ' ')}</Text>
                      <Text style={styles.note}>
                        {entry.actorName ?? 'system'} · {entry.entityType}
                        {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ''} · {formatDateTime(entry.timestamp)}
                      </Text>
                    </View>
                  </View>
                  {entry.meta && Object.keys(entry.meta).length ? (
                    <Text style={styles.logMeta} numberOfLines={3}>
                      {JSON.stringify(entry.meta)}
                    </Text>
                  ) : null}
                </Card>
              ))
            )}
          </>
        ) : null}

        <Button label="Refresh" variant="ghost" onPress={() => {
          settings.reload();
          branches.reload();
          users.reload();
          audit.reload();
        }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  sub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  tabs: { gap: space(2), paddingVertical: space(1) },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  label: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(2), marginBottom: space(1.5) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginVertical: space(1) },
  branchHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  branchName: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  note: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  logAction: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink900, textTransform: 'capitalize' },
  logMeta: { fontSize: 10, color: colors.ink400, marginTop: space(2), fontFamily: 'monospace' },
  holidayForm: { marginTop: space(3), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100, gap: space(2) },
});
