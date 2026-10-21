/**
 * Offers: the wallet top-up menu, the coupon book, and the referral programme.
 *
 * The recharge offers are the ones customers see in the app, so the maths is
 * shown as the customer experiences it (pay ₹500 → ₹550 to spend). Coupons are
 * validated by the server at checkout, never by the phone.
 */
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../shared/auth';
import { admin } from '../../shared/endpoints';
import { errorMessage, useAsync } from '../../shared/hooks';
import { Badge, Banner, Button, Card, Chip, Empty, Field, Loading, Row, SectionTitle } from '../../shared/components';
import { colors, font, radius, shadow, space } from '../../shared/theme';
import { formatDate, formatMoney, isoDate } from '../../core';

export function OffersScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const offers = useAsync(() => admin.offers(), []);
  const referrals = useAsync(() => admin.referrals(), []);

  const [tab, setTab] = useState<'recharge' | 'coupons' | 'referrals'>('recharge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newOffer, setNewOffer] = useState({ pay: '', bonus: '', label: '' });
  const [newCoupon, setNewCoupon] = useState({ code: '', type: 'percent' as 'percent' | 'flat', value: '', min: '', max: '', days: '30', usageLimit: '' });
  const [referralEdit, setReferralEdit] = useState<{ referrerReward: string; refereeReward: string; maxRewardsPerMonth: string } | null>(null);

  const isOwner = ['salon_owner', 'super_admin'].includes(user?.role ?? '');

  const createOffer = async () => {
    const pay = Number(newOffer.pay.replace(/[^\d.]/g, ''));
    const bonus = Number(newOffer.bonus.replace(/[^\d.]/g, '')) || 0;
    if (!Number.isFinite(pay) || pay < 1) return setError('Enter what the customer pays, in rupees (at least ₹1).');
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await admin.createRechargeOffer({
        payAmount: Math.round(pay * 100),
        bonusAmount: Math.round(bonus * 100),
        label: newOffer.label.trim() || `Pay ₹${pay} get ₹${pay + bonus}`,
        active: true,
      });
      setMessage('Offer added. Customers see it in their wallet immediately.');
      setNewOffer({ pay: '', bonus: '', label: '' });
      await offers.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createCoupon = async () => {
    const value = Number(newCoupon.value.replace(/[^\d.]/g, ''));
    if (newCoupon.code.trim().length < 3) return setError('Coupon codes need at least 3 characters.');
    if (!Number.isFinite(value) || value <= 0) return setError(newCoupon.type === 'percent' ? 'Enter the percentage.' : 'Enter the amount in rupees.');
    const days = Number(newCoupon.days.replace(/\D/g, '')) || 30;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const end = new Date();
      end.setDate(end.getDate() + days);
      await admin.createCoupon({
        code: newCoupon.code.trim().toUpperCase(),
        type: newCoupon.type,
        value: newCoupon.type === 'percent' ? Math.round(value) : Math.round(value * 100),
        minAmount: Math.round((Number(newCoupon.min.replace(/[^\d.]/g, '')) || 0) * 100),
        maxDiscount: newCoupon.max.trim() ? Math.round(Number(newCoupon.max.replace(/[^\d.]/g, '')) * 100) : null,
        startAt: isoDate(),
        endAt: end.toISOString().slice(0, 10),
        usageLimit: newCoupon.usageLimit.trim() ? Number(newCoupon.usageLimit.replace(/\D/g, '')) : null,
        active: true,
        description:
          newCoupon.type === 'percent'
            ? `${value}% off${newCoupon.min ? ` above ₹${newCoupon.min}` : ''}`
            : `₹${value} off${newCoupon.min ? ` above ₹${newCoupon.min}` : ''}`,
      });
      setMessage(`Coupon ${newCoupon.code.trim().toUpperCase()} is live.`);
      setNewCoupon({ code: '', type: 'percent', value: '', min: '', max: '', days: '30', usageLimit: '' });
      await offers.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveReferralConfig = async () => {
    if (!referralEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await admin.updateReferralConfig({
        referrerReward: Math.round((Number(referralEdit.referrerReward.replace(/[^\d.]/g, '')) || 0) * 100),
        refereeReward: Math.round((Number(referralEdit.refereeReward.replace(/[^\d.]/g, '')) || 0) * 100),
        maxRewardsPerMonth: Number(referralEdit.maxRewardsPerMonth.replace(/\D/g, '')) || 0,
      });
      setMessage('Referral rewards updated.');
      setReferralEdit(null);
      await referrals.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleOffer = async (id: string, active: boolean) => {
    setBusy(true);
    try {
      await admin.updateRechargeOffer(id, { active: !active });
      setMessage(!active ? 'Offer switched on.' : 'Offer switched off.');
      await offers.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const config = referrals.data?.config;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Offers</Text>
          <Text style={styles.sub}>Wallet top-ups, coupons and referrals</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={offers.refreshing} onRefresh={offers.refresh} tintColor={colors.brand500} />}
      >
        <View style={styles.tabs}>
          <Chip label="Top-ups" active={tab === 'recharge'} onPress={() => setTab('recharge')} />
          <Chip label="Coupons" active={tab === 'coupons'} onPress={() => setTab('coupons')} />
          <Chip label="Referrals" active={tab === 'referrals'} onPress={() => setTab('referrals')} />
        </View>

        {error ? <Banner tone="error" title="Not saved" message={error} /> : null}
        {message ? <Banner tone="success" message={message} /> : null}

        {tab === 'recharge' ? (
          <>
            <SectionTitle title="Live offers" />
            {offers.loading && !offers.data ? (
              <Loading label="Loading offers…" />
            ) : (offers.data?.rechargeOffers.length ?? 0) === 0 ? (
              <Card>
                <Empty icon="🎁" title="No top-up offers" message="Add one below — for example pay ₹500, get ₹550 to spend." />
              </Card>
            ) : (
              offers.data!.rechargeOffers.map((offer) => (
                <Card key={offer.id}>
                  <View style={styles.offerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offerLabel}>{offer.label}</Text>
                      <Text style={styles.meta}>
                        Pay {formatMoney(offer.payAmount)} · bonus {formatMoney(offer.bonusAmount)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: space(1) }}>
                      <Text style={styles.offerValue}>{formatMoney(offer.totalValue)}</Text>
                      <Badge
                        label={offer.active ? 'live' : 'off'}
                        bg={offer.active ? colors.mintSoft : colors.ink100}
                        fg={offer.active ? colors.mint : colors.ink600}
                      />
                    </View>
                  </View>
                  {isOwner ? (
                    <Button
                      label={offer.active ? 'Switch off' : 'Switch on'}
                      variant="secondary"
                      size="sm"
                      style={{ marginTop: space(3) }}
                      onPress={() => void toggleOffer(offer.id, offer.active)}
                    />
                  ) : null}
                </Card>
              ))
            )}

            {isOwner ? (
              <>
                <SectionTitle title="New top-up offer" />
                <Card>
                  <View style={styles.twoUp}>
                    <Field
                      label="Customer pays (₹)"
                      value={newOffer.pay}
                      onChangeText={(pay) => setNewOffer((current) => ({ ...current, pay }))}
                      keyboardType="decimal-pad"
                      placeholder="500"
                      style={{ flex: 1 }}
                    />
                    <Field
                      label="Bonus (₹)"
                      value={newOffer.bonus}
                      onChangeText={(bonus) => setNewOffer((current) => ({ ...current, bonus }))}
                      keyboardType="decimal-pad"
                      placeholder="50"
                      style={{ flex: 1 }}
                    />
                  </View>
                  <Field
                    label="Label (optional)"
                    value={newOffer.label}
                    onChangeText={(label) => setNewOffer((current) => ({ ...current, label }))}
                    placeholder="Monsoon top-up"
                  />
                  <Button label={busy ? 'Saving…' : 'Add offer'} loading={busy} onPress={() => void createOffer()} style={{ marginTop: space(3) }} />
                  <Text style={styles.note}>
                    Bonus is spendable but never refundable as cash — the wallet statement shows bonus and purchased value
                    separately, and refunds follow the salon’s policy.
                  </Text>
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'coupons' ? (
          <>
            <SectionTitle title="Coupons" />
            {(offers.data?.coupons.length ?? 0) === 0 ? (
              <Card>
                <Empty icon="🏷" title="No coupons" message="Create one below — the server validates every code at checkout." />
              </Card>
            ) : (
              offers.data!.coupons.map((coupon) => (
                <Card key={coupon.id}>
                  <View style={styles.offerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.couponCode}>{coupon.code}</Text>
                      <Text style={styles.meta}>{coupon.description}</Text>
                      <Text style={styles.meta}>
                        {coupon.type === 'percent' ? `${coupon.value}%` : formatMoney(coupon.value)} off
                        {coupon.minAmount ? ` above ${formatMoney(coupon.minAmount)}` : ''}
                        {coupon.maxDiscount ? ` (max ${formatMoney(coupon.maxDiscount)})` : ''}
                      </Text>
                      <Text style={styles.meta}>
                        Used {coupon.usedCount}
                        {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''} · until{' '}
                        {formatDate(coupon.endAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <Badge
                      label={coupon.active ? 'live' : 'off'}
                      bg={coupon.active ? colors.mintSoft : colors.ink100}
                      fg={coupon.active ? colors.mint : colors.ink600}
                    />
                  </View>
                  {isOwner ? (
                    <Button
                      label={coupon.active ? 'Switch off' : 'Switch on'}
                      variant="secondary"
                      size="sm"
                      style={{ marginTop: space(3) }}
                      onPress={async () => {
                        try {
                          await admin.updateCoupon(coupon.id, { active: !coupon.active });
                          await offers.reload();
                        } catch (err) {
                          setError(errorMessage(err));
                        }
                      }}
                    />
                  ) : null}
                </Card>
              ))
            )}

            {isOwner ? (
              <>
                <SectionTitle title="New coupon" />
                <Card>
                  <Field
                    label="Code"
                    value={newCoupon.code}
                    onChangeText={(code) => setNewCoupon((current) => ({ ...current, code }))}
                    autoCapitalize="characters"
                    placeholder="MONSOON20"
                  />
                  <View style={styles.tabs}>
                    <Chip label="Percent off" active={newCoupon.type === 'percent'} onPress={() => setNewCoupon((current) => ({ ...current, type: 'percent' }))} />
                    <Chip label="Flat ₹ off" active={newCoupon.type === 'flat'} onPress={() => setNewCoupon((current) => ({ ...current, type: 'flat' }))} />
                  </View>
                  <View style={styles.twoUp}>
                    <Field
                      label={newCoupon.type === 'percent' ? 'Percent (%)' : 'Amount (₹)'}
                      value={newCoupon.value}
                      onChangeText={(value) => setNewCoupon((current) => ({ ...current, value }))}
                      keyboardType="decimal-pad"
                      style={{ flex: 1 }}
                    />
                    <Field
                      label="Minimum spend (₹)"
                      value={newCoupon.min}
                      onChangeText={(min) => setNewCoupon((current) => ({ ...current, min }))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      style={{ flex: 1 }}
                    />
                  </View>
                  <View style={styles.twoUp}>
                    <Field
                      label="Max discount (₹)"
                      value={newCoupon.max}
                      onChangeText={(max) => setNewCoupon((current) => ({ ...current, max }))}
                      keyboardType="decimal-pad"
                      placeholder="optional"
                      style={{ flex: 1 }}
                    />
                    <Field
                      label="Usage limit"
                      value={newCoupon.usageLimit}
                      onChangeText={(usageLimit) => setNewCoupon((current) => ({ ...current, usageLimit }))}
                      keyboardType="number-pad"
                      placeholder="unlimited"
                      style={{ flex: 1 }}
                    />
                  </View>
                  <Field
                    label="Runs for (days)"
                    value={newCoupon.days}
                    onChangeText={(days) => setNewCoupon((current) => ({ ...current, days }))}
                    keyboardType="number-pad"
                  />
                  <Button label={busy ? 'Saving…' : 'Create coupon'} loading={busy} onPress={() => void createCoupon()} style={{ marginTop: space(3) }} />
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'referrals' ? (
          <>
            {referrals.error ? <Banner tone="error" message={referrals.error} action="Try again" onAction={referrals.reload} /> : null}
            <SectionTitle title="Programme" />
            <Card>
              <Row label="Referrals registered" value={String(referrals.data?.registered ?? 0)} />
              <Row label="Qualified (first paid visit)" value={String(referrals.data?.qualified ?? 0)} />
              <Row label="Rewards paid" value={String(referrals.data?.rewarded ?? 0)} />
              <Row label="Reward expense" value={formatMoney(referrals.data?.rewardExpense ?? 0)} emphasis />
              {config ? (
                <>
                  <Row label="Referrer gets" value={formatMoney(config.referrerReward)} />
                  <Row label="Friend gets" value={formatMoney(config.refereeReward)} />
                  <Row label="Rewards per month" value={String(config.maxRewardsPerMonth)} />
                  <Row label="Trigger" value={config.requireFirstPaidVisit ? 'after the friend’s first paid visit' : 'on sign-up'} />
                </>
              ) : null}
              {isOwner ? (
                referralEdit ? (
                  <>
                    <View style={styles.twoUp}>
                      <Field
                        label="Referrer gets (₹)"
                        value={referralEdit.referrerReward}
                        onChangeText={(referrerReward) => setReferralEdit((current) => (current ? { ...current, referrerReward } : current))}
                        keyboardType="decimal-pad"
                        style={{ flex: 1 }}
                      />
                      <Field
                        label="Friend gets (₹)"
                        value={referralEdit.refereeReward}
                        onChangeText={(refereeReward) => setReferralEdit((current) => (current ? { ...current, refereeReward } : current))}
                        keyboardType="decimal-pad"
                        style={{ flex: 1 }}
                      />
                    </View>
                    <Field
                      label="Rewards per customer per month"
                      value={referralEdit.maxRewardsPerMonth}
                      onChangeText={(maxRewardsPerMonth) => setReferralEdit((current) => (current ? { ...current, maxRewardsPerMonth } : current))}
                      keyboardType="number-pad"
                    />
                    <View style={styles.tabs}>
                      <Button label="Cancel" variant="ghost" onPress={() => setReferralEdit(null)} style={{ flex: 1 }} />
                      <Button label={busy ? 'Saving…' : 'Save'} loading={busy} onPress={() => void saveReferralConfig()} style={{ flex: 1 }} />
                    </View>
                  </>
                ) : (
                  <Button
                    label="Change reward amounts"
                    variant="secondary"
                    style={{ marginTop: space(3) }}
                    onPress={() =>
                      setReferralEdit({
                        referrerReward: String((config?.referrerReward ?? 0) / 100),
                        refereeReward: String((config?.refereeReward ?? 0) / 100),
                        maxRewardsPerMonth: String(config?.maxRewardsPerMonth ?? 10),
                      })
                    }
                  />
                )
              ) : null}
            </Card>

            <SectionTitle title="Top referrers" />
            <Card padded={false}>
              {(referrals.data?.topReferrers ?? []).map((entry, index) => (
                <Pressable
                  key={entry.customerId}
                  style={styles.rowItem}
                  onPress={() => navigation.navigate('CustomerDetail', { id: entry.customerId })}
                >
                  <Text style={styles.rank}>#{index + 1}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text style={styles.meta}>
                    {entry.qualified} qualified / {entry.invited} invited
                  </Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.ink200} />
                </Pressable>
              ))}
              {(referrals.data?.topReferrers.length ?? 0) === 0 ? <Text style={styles.note}>No referrals yet.</Text> : null}
            </Card>

            <SectionTitle title="Recent referrals" />
            <Card padded={false}>
              {(referrals.data?.recent ?? []).slice(0, 12).map((referral) => (
                <View key={referral.id} style={styles.rowItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {referral.referrerName} → {referral.referredCustomerName}
                    </Text>
                    <Text style={styles.meta}>
                      {referral.qualifiedAt ? `Qualified ${formatDate(referral.qualifiedAt, { day: 'numeric', month: 'short' })}` : 'Waiting for first paid visit'}
                      {' · '}
                      {referral.referrerRewardStatus}
                      {' / '}
                      {referral.refereeRewardStatus}
                    </Text>
                  </View>
                  <Badge
                    label={referral.status}
                    bg={referral.status === 'qualified' || referral.status === 'rewarded' ? colors.mintSoft : colors.ink100}
                    fg={referral.status === 'qualified' || referral.status === 'rewarded' ? colors.mint : colors.ink600}
                  />
                </View>
              ))}
            </Card>
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
  sub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  tabs: { flexDirection: 'row', gap: space(2), marginVertical: space(1) },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  offerLabel: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  offerValue: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.mint },
  couponCode: { fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.brand700, letterSpacing: 1 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  name: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink900, flexShrink: 1 },
  rank: { fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.brand600, width: 30 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ink100 },
  twoUp: { flexDirection: 'row', gap: space(2), marginVertical: space(1) },
  note: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(3) },
});
