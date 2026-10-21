/**
 * Customers: search the directory, see the top 20 by spend, and open a customer
 * file where the wallet can be adjusted (owner only — the server enforces it and
 * the button says so).
 */
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useAuth } from '../../shared/auth';
import { admin } from '../../shared/endpoints';
import { errorMessage, useAsync, useDebounced } from '../../shared/hooks';
import { Avatar, Badge, Banner, Button, Card, Chip, Empty, Field, Loading, Row, SectionTitle, StatTile } from '../../shared/components';
import { colors, font, radius, shadow, space, statusColors, STATUS_LABEL } from '../../shared/theme';
import { formatDate, formatDateTime, formatMoney, formatMoneyShort, maskPhone, statusLabel } from '../../core';

export function CustomersScreen() {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'directory' | 'top'>('directory');
  const debounced = useDebounced(search, 300);

  const directory = useAsync(() => admin.customers({ search: debounced || undefined, limit: 100 }), [debounced]);
  const top = useAsync(() => admin.topCustomers({ limit: 20 }), []);

  const rows = mode === 'top' ? top.data?.customers ?? [] : directory.data?.customers ?? [];
  const loading = mode === 'top' ? top.loading : directory.loading;
  const refresh = mode === 'top' ? top.refresh : directory.refresh;
  const refreshing = mode === 'top' ? top.refreshing : directory.refreshing;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Customers</Text>
        <View style={styles.tabs}>
          <Chip label="Directory" active={mode === 'directory'} onPress={() => setMode('directory')} />
          <Chip label="Top 20 by spend" active={mode === 'top'} onPress={() => setMode('top')} />
        </View>
        {mode === 'directory' ? (
          <Field
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or phone"
            autoCapitalize="none"
            inputMode="search"
          />
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand500} />}
      >
        {directory.error && mode === 'directory' ? <Banner tone="error" message={directory.error} action="Try again" onAction={directory.reload} /> : null}
        {top.error && mode === 'top' ? <Banner tone="error" message={top.error} action="Try again" onAction={top.reload} /> : null}

        {loading && !rows.length ? (
          <Loading label="Loading customers…" />
        ) : rows.length === 0 ? (
          <Card>
            <Empty
              icon="🔍"
              title={mode === 'top' ? 'No visits recorded yet' : 'No customers match'}
              message={mode === 'top' ? 'The top-20 list fills up as visits are completed.' : 'Try a different name or number.'}
            />
          </Card>
        ) : (
          rows.map((customer, index) =>
            mode === 'top' ? (
              <TopCustomerRow key={customer.customerId} customer={customer} rank={index + 1} onPress={() => navigation.navigate('CustomerDetail', { id: customer.customerId })} />
            ) : (
              <DirectoryRow key={customer.customerId} customer={customer} onPress={() => navigation.navigate('CustomerDetail', { id: customer.customerId })} />
            ),
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DirectoryRow({ customer, onPress }: { customer: ReturnType<typeof Object> & any; onPress: () => void }) {
  const spend = customer.totalCompletedSpend ?? 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
      <Avatar name={customer.name ?? '?'} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{customer.name}</Text>
        <Text style={styles.meta}>
          {maskPhone(customer.phone)} · {customer.totalVisits ?? 0} visits ·{' '}
          {customer.lastVisitAt ? `last ${formatDate(customer.lastVisitAt, { day: 'numeric', month: 'short' })}` : 'no visits yet'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.amount}>{formatMoneyShort(spend)}</Text>
        <Text style={styles.meta}>lifetime</Text>
      </View>
    </Pressable>
  );
}

function TopCustomerRow({ customer, rank, onPress }: { customer: any; rank: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
      <Text style={styles.rank}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{customer.name}</Text>
        <Text style={styles.meta}>
          {customer.visits} visits · avg {formatMoneyShort(customer.averageSpend)} · {customer.referrals} referrals
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.amount}>{formatMoneyShort(customer.totalSpend)}</Text>
        <Text style={styles.meta}>wallet {formatMoneyShort(customer.walletBalance)}</Text>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* One customer file                                                   */
/* ------------------------------------------------------------------ */

export function CustomerDetailScreen() {
  const route = useRoute<RouteProp<{ CustomerDetail: { id: string } }, 'CustomerDetail'>>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const detail = useAsync(() => admin.customer(route.params.id), [route.params.id]);
  const [amount, setAmount] = useState('');
  const [balanceType, setBalanceType] = useState<'cash' | 'bonus'>('cash');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isOwner = ['salon_owner', 'super_admin'].includes(user?.role ?? '');
  const profile = detail.data?.profile;
  const wallet = detail.data?.wallet;

  const adjust = async (sign: 1 | -1) => {
    const rupees = Number(amount.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError('Enter an amount in rupees, for example 500.');
      return;
    }
    if (reason.trim().length < 6) {
      setError('Write a short reason (at least 6 characters) — it goes on the customer’s wallet statement.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const paise = Math.round(rupees * 100) * sign;
      const result = await admin.adjustWallet(route.params.id, { amount: paise, balanceType, reason: reason.trim() });
      setMessage(
        `${sign > 0 ? 'Credited' : 'Debited'} ${formatMoney(Math.abs(paise))}. New balance ${formatMoney(
          result.wallet.totalBalance,
        )}.`,
      );
      setAmount('');
      setReason('');
      await detail.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleConsent = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      await admin.setConsent(route.params.id, { marketingConsent: !profile.marketingConsent });
      setMessage(!profile.marketingConsent ? 'Marketing consent given.' : 'Marketing consent withdrawn.');
      await detail.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (detail.loading && !profile) return <Loading label="Opening the customer file…" />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{profile?.name ?? 'Customer'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {detail.error && !profile ? <Banner tone="error" message={detail.error} action="Try again" onAction={detail.reload} /> : null}
        {error ? <Banner tone="error" title="Not saved" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}

        {profile ? (
          <>
            <Card>
              <View style={styles.identity}>
                <Avatar name={profile.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{profile.name}</Text>
                  <Text style={styles.meta}>{profile.phone}</Text>
                  <Text style={styles.meta}>
                    Customer since {formatDate(profile.createdAt, { month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <Badge
                  label={profile.marketingConsent ? 'Consent given' : 'No marketing'}
                  bg={profile.marketingConsent ? colors.mintSoft : colors.ink100}
                  fg={profile.marketingConsent ? colors.mint : colors.ink600}
                />
              </View>

              <View style={[styles.statsRow, { marginTop: space(4) }]}>
                <StatTile label="Visits" value={String(profile.totalVisits)} />
                <StatTile label="Lifetime" value={formatMoneyShort(profile.totalCompletedSpend)} />
                <StatTile label="Average" value={formatMoneyShort(profile.averageSpend)} />
              </View>
              <View style={[styles.statsRow, { marginTop: space(4) }]}>
                <StatTile label="Wallet" value={formatMoneyShort(wallet?.totalBalance ?? 0)} tone={colors.brand700} />
                <StatTile label="Referrals" value={String(profile.successfulReferrals)} tone={colors.mint} />
                <StatTile
                  label="Last visit"
                  value={profile.lastVisitAt ? formatDate(profile.lastVisitAt, { day: 'numeric', month: 'short' }) : '—'}
                />
              </View>
            </Card>

            <SectionTitle title="Wallet" />
            <Card>
              <Row label="Purchased balance" value={formatMoney(wallet?.cashBalance ?? 0)} />
              <Row label="Bonus balance" value={formatMoney(wallet?.bonusBalance ?? 0)} />
              <Row label="Total" value={formatMoney(wallet?.totalBalance ?? 0)} emphasis />

              {isOwner ? (
                <>
                  <Field
                    label="Adjust amount (₹)"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="500"
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.chipRow}>
                    <Chip label="Purchased" active={balanceType === 'cash'} onPress={() => setBalanceType('cash')} />
                    <Chip label="Bonus" active={balanceType === 'bonus'} onPress={() => setBalanceType('bonus')} />
                  </View>
                  <Field
                    label="Reason (appears on the customer's statement)"
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Goodwill for a delayed appointment"
                  />
                  <View style={styles.actionRow}>
                    <Button label="Credit" loading={busy} onPress={() => void adjust(1)} style={{ flex: 1 }} disabled={busy} />
                    <Button label="Debit" variant="danger" loading={busy} onPress={() => void adjust(-1)} style={{ flex: 1 }} disabled={busy} />
                  </View>
                  <Text style={styles.note}>
                    Every adjustment is an append-only ledger entry with your name on it. Nothing is edited or deleted, which is
                    why the reason is required.
                  </Text>
                </>
              ) : (
                <Text style={styles.note}>Only the owner can adjust wallet balances. You can see the balance above.</Text>
              )}
            </Card>

            <SectionTitle title="Consent" />
            <Card>
              <Text style={styles.note}>
                {profile.marketingConsent
                  ? 'This customer has agreed to offers and promotions.'
                  : 'No marketing consent — promotional messages must not be sent.'}
              </Text>
              <Button
                label={profile.marketingConsent ? 'Withdraw consent' : 'Record consent'}
                variant="secondary"
                onPress={() => void toggleConsent()}
                loading={busy}
                style={{ marginTop: space(3) }}
              />
            </Card>

            <SectionTitle title="Visits" />
            {(detail.data?.appointments.length ?? 0) === 0 ? (
              <Card>
                <Empty icon="📅" title="No visits yet" />
              </Card>
            ) : (
              <Card padded={false}>
                {detail.data!.appointments.slice(0, 12).map((appointment, index) => (
                  <Pressable
                    key={appointment.id}
                    style={[styles.row, index > 0 && styles.rowBorder]}
                    onPress={() => navigation.navigate('AppointmentDetail', { id: appointment.id })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>
                        {formatDate(appointment.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {appointment.services.map((service) => service.name).join(', ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.amount}>{formatMoney(appointment.totalAmount)}</Text>
                      <Badge label={STATUS_LABEL[appointment.status] ?? appointment.status} {...statusColors(appointment.status)} />
                    </View>
                  </Pressable>
                ))}
              </Card>
            )}

            <SectionTitle title="Wallet statement" />
            {(detail.data?.transactions.length ?? 0) === 0 ? (
              <Card>
                <Empty icon="🧾" title="No movements" />
              </Card>
            ) : (
              <Card padded={false}>
                {detail.data!.transactions.slice(0, 15).map((transaction, index) => (
                  <View key={transaction.id} style={[styles.row, index > 0 && styles.rowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{transaction.reason ?? statusLabel(transaction.type)}</Text>
                      <Text style={styles.meta}>
                        {formatDateTime(transaction.createdAt)} · {transaction.balanceType}
                        {transaction.status !== 'posted' ? ` · ${transaction.status}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.amount, { color: transaction.amount >= 0 ? colors.mint : colors.ink800 }]}>
                      {transaction.amount >= 0 ? '+' : '−'}
                      {formatMoney(Math.abs(transaction.amount))}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            {detail.data?.notifications?.length ? (
              <>
                <SectionTitle title="Messages sent" />
                <Card padded={false}>
                  {detail.data.notifications.slice(0, 8).map((notification, index) => (
                    <View key={notification.id} style={[styles.row, index > 0 && styles.rowBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{notification.stage ?? notification.template}</Text>
                        <Text style={styles.meta}>{notification.sentAt ? `Sent ${formatDateTime(notification.sentAt)}` : `Scheduled ${formatDateTime(notification.scheduledAt)}`}</Text>
                      </View>
                      <Badge label={STATUS_LABEL[notification.status] ?? notification.status} {...statusColors(notification.status)} />
                    </View>
                  ))}
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
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900, flexShrink: 1 },
  tabs: { flexDirection: 'row', gap: space(2), marginVertical: space(2) },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3.5), backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.card },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100, borderRadius: 0 },
  name: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  amount: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  rank: { width: 26, fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.brand600 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  statsRow: { flexDirection: 'row', gap: space(3) },
  chipRow: { flexDirection: 'row', gap: space(2), marginVertical: space(1) },
  actionRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  note: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(2) },
});
