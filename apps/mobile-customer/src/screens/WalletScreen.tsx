/**
 * The wallet: what is in it, how to top up, and every movement of money.
 *
 * Recharge goes through the server's order endpoint and is only reported as paid
 * after the server verifies the payment (or, on a simulated server, after the
 * simulated signature passes the very same verification).
 */
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from '../shared/components';
import { customer, payments } from '../shared/endpoints';
import { startCheckout } from '../shared/checkout';
import { errorMessage, useAsync } from '../shared/hooks';
import { useAuth } from '../shared/auth';
import { Badge, Banner, Button, Card, Empty, Loading, SectionTitle, StatTile } from '../shared/components';
import { colors, font, gradients, radius, shadow, space } from '../shared/theme';
import { formatDateTime, formatMoney, formatMoneyShort } from '../core';

export function WalletScreen() {
  const { refresh } = useAuth();
  const wallet = useAsync(() => customer.wallet(), []);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  const recharge = async (offerId: string, payAmount: number, bonusAmount: number, label: string) => {
    setBusyOffer(offerId);
    setMessage(null);
    try {
      const order = await payments.createOrder({ purpose: 'wallet_recharge', amount: payAmount });
      const outcome = await startCheckout(order);
      if (outcome.status === 'paid') {
        setMessage({
          tone: 'success',
          text: `Added ${formatMoney(payAmount + bonusAmount)} (${formatMoney(payAmount)} paid + ${formatMoney(bonusAmount)} bonus) — ${label}. ${outcome.message}`,
        });
        await wallet.reload();
        await refresh();
      } else {
        setMessage({ tone: outcome.status === 'cancelled' ? 'info' : 'error', text: outcome.message });
      }
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusyOffer(null);
    }
  };

  const explain = () => {
    const data = wallet.data;
    Alert.alert(
      'How your wallet works',
      data?.terms?.join('\n\n') ??
        'Bonus value is spent before purchased value unless the salon has configured otherwise. Purchased value never expires.',
    );
  };

  if (wallet.loading && !wallet.data) return <Loading label="Opening your wallet…" />;

  const data = wallet.data;
  const balance = data?.wallet;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={wallet.refreshing} onRefresh={wallet.refresh} tintColor={colors.brand500} />}
      >
        <LinearGradient colors={gradients.header as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroLabel}>Salon wallet</Text>
          <Text style={styles.heroValue}>{formatMoney(balance?.totalBalance ?? 0)}</Text>
          <View style={styles.heroSplit}>
            <View>
              <Text style={styles.splitLabel}>Purchased</Text>
              <Text style={styles.splitValue}>{formatMoney(balance?.cashBalance ?? 0)}</Text>
            </View>
            <View>
              <Text style={styles.splitLabel}>Bonus</Text>
              <Text style={styles.splitValue}>{formatMoney(balance?.bonusBalance ?? 0)}</Text>
            </View>
            <Pressable onPress={explain} style={styles.infoButton} hitSlop={8}>
              <MaterialIcons name="info-outline" size={18} color={colors.white} />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.stack}>
          {wallet.error ? <Banner tone="error" message={wallet.error} action="Try again" onAction={wallet.reload} /> : null}
          {message ? <Banner tone={message.tone === 'info' ? 'info' : message.tone} message={message.text} /> : null}

          {data?.spendingOrder?.length ? (
            <Banner
              tone="info"
              message={`Spending order at this salon: ${data.spendingOrder.map((type) => (type === 'bonus' ? 'bonus first' : 'purchased value')).join(', then ')}.`}
            />
          ) : null}

          <SectionTitle title="Top up & get more" />
          {(data?.offers.length ?? 0) === 0 ? (
            <Card>
              <Empty icon="🎁" title="No recharge offers" message="This salon has not published any top-up offers right now." />
            </Card>
          ) : (
            <View style={styles.offerRow}>
              {data!.offers.map((offer) => (
                <View key={offer.id} style={styles.offerCard}>
                  <Text style={styles.offerLabel}>{offer.label}</Text>
                  <Text style={styles.offerPay}>Pay {formatMoney(offer.payAmount)}</Text>
                  <Text style={styles.offerBonus}>+ {formatMoney(offer.bonusAmount)} bonus</Text>
                  <Text style={styles.offerTotal}>{formatMoney(offer.totalValue)} value</Text>
                  <Button
                    label={busyOffer === offer.id ? 'Opening…' : 'Recharge'}
                    size="sm"
                    onPress={() => void recharge(offer.id, offer.payAmount, offer.bonusAmount, offer.label)}
                    loading={busyOffer === offer.id}
                    disabled={!!busyOffer && busyOffer !== offer.id}
                    style={{ marginTop: space(3) }}
                  />
                </View>
              ))}
            </View>
          )}

          {balance ? (
            <Card>
              <View style={styles.statsRow}>
                <StatTile label="Visits paid" value={String(data?.transactions.filter((t) => t.type === 'spend').length ?? 0)} />
                <StatTile label="Bonus earned" value={formatMoneyShort(data?.wallet.bonusBalance ?? 0)} tone={colors.mint} />
                <StatTile
                  label="Expiry"
                  value={data?.bonusExpiryDays ? `${data.bonusExpiryDays} days` : 'None'}
                  sub="Purchased value never expires"
                />
              </View>
            </Card>
          ) : null}

          <SectionTitle title="Recent activity" />
          {(data?.transactions.length ?? 0) === 0 ? (
            <Card>
              <Empty icon="🧾" title="No wallet activity yet" message="Recharges, salon payments and referral rewards appear here." />
            </Card>
          ) : (
            <Card>
              {data!.transactions.map((transaction, index) => (
                <View key={transaction.id} style={[styles.txRow, index > 0 && styles.txRowBorder]}>
                  <View style={[styles.txIcon, { backgroundColor: transaction.amount >= 0 ? colors.mintSoft : colors.brand50 }]}>
                    <MaterialIcons
                      name={transaction.amount >= 0 ? 'south-west' : 'north-east'}
                      size={16}
                      color={transaction.amount >= 0 ? colors.mint : colors.brand700}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txTitle}>{transaction.reason ?? transaction.type.replace(/_/g, ' ')}</Text>
                    <Text style={styles.txMeta}>
                      {formatDateTime(transaction.createdAt)} · {transaction.balanceType === 'bonus' ? 'bonus' : 'purchased'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: space(1) }}>
                    <Text style={[styles.txAmount, { color: transaction.amount >= 0 ? colors.mint : colors.ink800 }]}>
                      {transaction.amount >= 0 ? '+' : '−'}
                      {formatMoney(Math.abs(transaction.amount))}
                    </Text>
                    {transaction.status !== 'posted' ? (
                      <Badge
                        label={transaction.status}
                        bg={transaction.status === 'pending' ? colors.amberSoft : colors.ink100}
                        fg={transaction.status === 'pending' ? '#B45309' : colors.ink600}
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Text style={styles.footnote}>
            Balances are derived from an append-only ledger on the server: every line above is a recorded movement, never
            an edited number.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  body: { paddingBottom: space(12) },
  hero: { paddingHorizontal: space(5), paddingTop: space(5), paddingBottom: space(7), borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroLabel: { color: '#FBDFEB', fontSize: font.size.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroValue: { color: colors.white, fontSize: font.size.hero, fontWeight: font.weight.heavy, letterSpacing: -1, marginTop: space(1) },
  heroSplit: { flexDirection: 'row', gap: space(8), marginTop: space(4), alignItems: 'flex-end' },
  splitLabel: { color: '#F6C9DD', fontSize: font.size.xs },
  splitValue: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold, marginTop: 2 },
  infoButton: { marginLeft: 'auto', width: 32, height: 32, borderRadius: radius.pill, backgroundColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  stack: { padding: space(4), gap: space(3) },
  offerRow: { flexDirection: 'row', gap: space(2) },
  offerCard: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: space(3.5), ...shadow.card },
  offerLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand600, textTransform: 'uppercase', letterSpacing: 0.6 },
  offerPay: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900, marginTop: space(1.5) },
  offerBonus: { fontSize: font.size.sm, color: colors.mint, fontWeight: font.weight.semibold, marginTop: 2 },
  offerTotal: { fontSize: font.size.xs, color: colors.ink400, marginTop: space(1) },
  statsRow: { flexDirection: 'row', gap: space(3) },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  txRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  txIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  txMeta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  txAmount: { fontSize: font.size.md, fontWeight: font.weight.bold },
  footnote: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18 },
});
