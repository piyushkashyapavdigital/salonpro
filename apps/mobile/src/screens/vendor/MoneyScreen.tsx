/**
 * Money: what came in, what is waiting, what the wallets owe, and refunds.
 *
 * The refund form is deliberately explicit about where the money goes (the
 * customer's wallet versus the original payment source), because that is the
 * difference the customer will notice.
 */
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../shared/auth';
import { admin } from '../../shared/endpoints';
import { errorMessage, useAsync } from '../../shared/hooks';
import { Badge, Banner, Button, Card, Chip, Empty, Field, Loading, Row, SectionTitle, StatTile } from '../../shared/components';
import { colors, font, radius, shadow, space, statusColors, STATUS_LABEL } from '../../shared/theme';
import { formatDateTime, formatMoney, formatMoneyShort } from '../../core';

export function MoneyScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const payments = useAsync(() => admin.payments({ limit: 200 }), []);
  const wallet = useAsync(() => admin.wallet({ limit: 100 }), []);
  const [tab, setTab] = useState<'payments' | 'wallet'>('payments');
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canRefund = ['salon_owner', 'branch_manager'].includes(user?.role ?? '');
  const summary = payments.data?.summary;

  const issueRefund = async (order: { id: string; customerId: string; amountPaid: number }) => {
    const rupees = Number(amount.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError('Enter the refund amount in rupees.');
      return;
    }
    if (reason.trim().length < 6) {
      setError('Write a reason (at least 6 characters) — it is recorded in the audit log.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await admin.refunds({
        customerId: order.customerId,
        paymentOrderId: order.id,
        amount: Math.round(rupees * 100),
        reason: reason.trim(),
        toWallet: true,
      });
      setMessage(
        result.note
          ? `${result.note}. Status: ${result.status ?? 'recorded'}.`
          : `Refund recorded and credited to the customer's wallet.`,
      );
      setRefundFor(null);
      setAmount('');
      setReason('');
      await Promise.all([payments.reload(), wallet.reload()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Money</Text>
        <Text style={styles.sub}>
          {payments.data?.mode === 'simulated'
            ? 'Payments run in simulated mode on this server — no real money moves.'
            : `Payment mode: ${payments.data?.mode ?? '…'}`}
        </Text>
        <View style={styles.tabs}>
          <Chip label="Payments" active={tab === 'payments'} onPress={() => setTab('payments')} />
          <Chip label="Wallet ledger" active={tab === 'wallet'} onPress={() => setTab('wallet')} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={tab === 'payments' ? payments.refreshing : wallet.refreshing}
            onRefresh={tab === 'payments' ? payments.refresh : wallet.refresh}
            tintColor={colors.brand500}
          />
        }
      >
        {error ? <Banner tone="error" title="Not done" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}

        {tab === 'payments' ? (
          <>
            {payments.error ? <Banner tone="error" message={payments.error} action="Try again" onAction={payments.reload} /> : null}
            <Card>
              <View style={styles.grid}>
                <StatTile label="Collected" value={formatMoneyShort(summary?.collected ?? 0)} tone={colors.mint} />
                <StatTile label="Pending" value={String(summary?.pending ?? 0)} />
                <StatTile label="Failed" value={String(summary?.failed ?? 0)} tone={colors.rose} />
              </View>
            </Card>

            <SectionTitle title={`Payments (${payments.data?.orders.length ?? 0})`} />
            {payments.loading && !payments.data ? (
              <Loading label="Loading payments…" />
            ) : (payments.data?.orders.length ?? 0) === 0 ? (
              <Card>
                <Empty icon="💳" title="No payments yet" message="Wallet recharges and online payments appear here." />
              </Card>
            ) : (
              payments.data!.orders.map((order) => (
                <Card key={order.id}>
                  <View style={styles.rowHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{order.purpose.replace(/_/g, ' ')}</Text>
                      <Text style={styles.rowMeta}>
                        {order.customerName ?? 'Customer'} · {formatDateTime(order.createdAt ?? '')}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {order.mode} · {order.razorpayOrderId.slice(0, 18)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: space(1) }}>
                      <Text style={styles.amount}>{formatMoney(order.amountPaid || order.amount)}</Text>
                      <Badge label={STATUS_LABEL[order.status] ?? order.status} {...statusColors(order.status)} />
                    </View>
                  </View>

                  {canRefund && order.status === 'paid' ? (
                    refundFor === order.id ? (
                      <View style={styles.refundForm}>
                        <Field label="Refund amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="500" />
                        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Service not delivered as booked" />
                        <View style={styles.actionRow}>
                          <Button label="Cancel" variant="ghost" onPress={() => setRefundFor(null)} style={{ flex: 1 }} />
                          <Button
                            label={busy ? 'Refunding…' : 'Refund to wallet'}
                            loading={busy}
                            onPress={() =>
                              Alert.alert('Refund to wallet?', 'The customer is credited in their wallet and a ledger entry is written.', [
                                { text: 'Back', style: 'cancel' },
                                { text: 'Refund', onPress: () => void issueRefund(order) },
                              ])
                            }
                            style={{ flex: 1 }}
                          />
                        </View>
                      </View>
                    ) : (
                      <Button label="Refund…" variant="secondary" size="sm" style={{ marginTop: space(3) }} onPress={() => setRefundFor(order.id)} />
                    )
                  ) : null}
                </Card>
              ))
            )}

            {(payments.data?.refunds.length ?? 0) > 0 ? (
              <>
                <SectionTitle title="Refunds" />
                <Card padded={false}>
                  {payments.data!.refunds.map((refund, index) => (
                    <View key={refund.id} style={[styles.rowItem, index > 0 && styles.rowBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{refund.customerName ?? 'Customer'}</Text>
                        <Text style={styles.rowMeta}>
                          {formatDateTime(refund.createdAt)} · {refund.reason}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: space(1) }}>
                        <Text style={styles.amount}>{formatMoney(refund.amount)}</Text>
                        <Badge
                          label={refund.status}
                          bg={refund.status === 'processed' ? colors.mintSoft : colors.amberSoft}
                          fg={refund.status === 'processed' ? colors.mint : '#B45309'}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
          </>
        ) : (
          <>
            {wallet.error ? <Banner tone="error" message={wallet.error} action="Try again" onAction={wallet.reload} /> : null}

            <Card>
              <Text style={styles.liabilityLabel}>Outstanding wallet liability</Text>
              <Text style={styles.liabilityValue}>{formatMoney(wallet.data?.liabilities.total ?? 0)}</Text>
              <View style={styles.grid}>
                <StatTile label="Purchased" value={formatMoneyShort(wallet.data?.liabilities.cash ?? 0)} />
                <StatTile label="Bonus" value={formatMoneyShort(wallet.data?.liabilities.bonus ?? 0)} tone={colors.mint} />
                <StatTile label="Recent recharges" value={String(wallet.data?.recentRecharges.length ?? 0)} />
              </View>
              <Text style={styles.note}>
                Liability is the money customers can still spend. Bonus is a marketing cost, purchased value is money the salon
                holds.
              </Text>
            </Card>

            <SectionTitle title="Ledger (append-only)" />
            {wallet.loading && !wallet.data ? (
              <Loading label="Loading the ledger…" />
            ) : (wallet.data?.transactions.length ?? 0) === 0 ? (
              <Card>
                <Empty icon="🧾" title="No wallet movements" />
              </Card>
            ) : (
              <Card padded={false}>
                {wallet.data!.transactions.map((transaction, index) => (
                  <Pressable
                    key={transaction.id}
                    style={[styles.rowItem, index > 0 && styles.rowBorder]}
                    onPress={() => navigation.navigate('CustomerDetail', { id: transaction.customerId })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{transaction.customerName ?? 'Customer'}</Text>
                      <Text style={styles.rowMeta}>
                        {transaction.reason ?? transaction.type.replace(/_/g, ' ')} · {formatDateTime(transaction.createdAt)}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {transaction.balanceType}
                        {transaction.status !== 'posted' ? ` · ${transaction.status}` : ''}
                        {(transaction as { actorName?: string }).actorName ? ` · by ${(transaction as { actorName?: string }).actorName}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.amount, { color: transaction.amount >= 0 ? colors.mint : colors.ink800 }]}>
                      {transaction.amount >= 0 ? '+' : '−'}
                      {formatMoney(Math.abs(transaction.amount))}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            )}

            <SectionTitle title="Recent recharges" />
            <Card padded={false}>
              {(wallet.data?.recentRecharges ?? []).map((order, index) => (
                <View key={order.id} style={[styles.rowItem, index > 0 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{order.customerName ?? 'Customer'}</Text>
                    <Text style={styles.rowMeta}>
                      {formatDateTime(order.createdAt ?? '')} · {order.mode}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{formatMoney(order.amountPaid || order.amount)}</Text>
                </View>
              ))}
              {(wallet.data?.recentRecharges.length ?? 0) === 0 ? <Text style={styles.note}>No recharges yet.</Text> : null}
            </Card>
          </>
        )}

        <Row label="Ledger rule" value="Entries are never edited or deleted" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { paddingHorizontal: space(4), paddingTop: space(3), gap: space(2) },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.ink900, letterSpacing: -0.6 },
  sub: { fontSize: font.size.sm, color: colors.ink500 },
  tabs: { flexDirection: 'row', gap: space(2), marginVertical: space(2) },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  grid: { flexDirection: 'row', gap: space(3) },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3.5) },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  rowTitle: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink900, textTransform: 'capitalize' },
  rowMeta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  amount: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  refundForm: { marginTop: space(3), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100, gap: space(2) },
  actionRow: { flexDirection: 'row', gap: space(2) },
  liabilityLabel: { fontSize: font.size.xs, color: colors.ink500, textTransform: 'uppercase', letterSpacing: 0.6 },
  liabilityValue: { fontSize: font.size.hero, fontWeight: font.weight.heavy, color: colors.brand700, letterSpacing: -1, marginBottom: space(4) },
  note: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(3) },
});
