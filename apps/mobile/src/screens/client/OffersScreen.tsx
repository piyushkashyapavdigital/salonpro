/**
 * Coupons the salon is running, loyalty points, and a way through to referrals.
 */
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { customer } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import { AppSheet, Badge, Banner, Button, Card, Empty, Loading, SectionTitle, type SheetRequest } from '../../shared/components';
import { colors, font, radius, shadow, space } from '../../shared/theme';
import { formatDate, formatMoney } from '../../core';

export function OffersScreen() {
  const navigation = useNavigation<any>();
  const offers = useAsync(() => customer.offers(), []);
  const data = offers.data;
  const [sheet, setSheet] = useState<SheetRequest | null>(null);

  const copyCode = (code: string) => {
    setSheet({
      tone: 'info',
      title: 'Coupon code',
      message: `${code}\n\nUse it at checkout in the booking screen — the discount is applied by the server.`,
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={22} color={colors.ink800} />
        </Pressable>
        <Text style={styles.title}>Offers</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={offers.refreshing} onRefresh={offers.refresh} tintColor={colors.brand500} />}
      >
        {offers.error ? <Banner tone="error" message={offers.error} action="Try again" onAction={offers.reload} /> : null}
        {offers.loading && !data ? <Loading label="Loading offers…" /> : null}

        {data ? (
          <>
            <Card>
              <View style={styles.loyaltyRow}>
                <View style={styles.loyaltyIcon}>
                  <MaterialIcons name="stars" size={22} color={colors.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.loyaltyTitle}>Loyalty points</Text>
                  <Text style={styles.loyaltyValue}>{data.loyalty.points} points</Text>
                  <Text style={styles.loyaltySub}>{data.loyalty.lifetimePoints} earned since you joined</Text>
                </View>
              </View>
            </Card>

            <SectionTitle title="Coupons" />
            {data.coupons.length === 0 ? (
              <Card>
                <Empty icon="🏷" title="No coupons right now" message="The salon will publish discounts here when they run them." />
              </Card>
            ) : (
              data.coupons.map((coupon) => (
                <Card key={coupon.id}>
                  <View style={styles.couponHead}>
                    <Pressable onPress={() => copyCode(coupon.code)} style={styles.code}>
                      <Text style={styles.codeText}>{coupon.code}</Text>
                      <MaterialIcons name="content-copy" size={13} color={colors.brand700} />
                    </Pressable>
                    <Badge
                      label={coupon.type === 'percent' ? `${coupon.value}% OFF` : `${formatMoney(coupon.value)} OFF`}
                      bg={colors.mintSoft}
                      fg={colors.mint}
                    />
                  </View>
                  <Text style={styles.couponDescription}>{coupon.description}</Text>
                  <View style={styles.couponMeta}>
                    {coupon.minAmount > 0 ? <Text style={styles.metaText}>Minimum spend {formatMoney(coupon.minAmount)}</Text> : null}
                    {coupon.maxDiscount ? <Text style={styles.metaText}>Up to {formatMoney(coupon.maxDiscount)} off</Text> : null}
                    {coupon.usedCount > 0 ? <Text style={styles.metaText}>{coupon.usedCount} used</Text> : null}
                  </View>
                  <Text style={styles.validity}>Valid until {formatDate(coupon.endAt, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  <Button label="Use in a booking" variant="secondary" size="sm" style={{ marginTop: space(3) }} onPress={() => navigation.navigate('Book')} />
                </Card>
              ))
            )}

            <SectionTitle title="Top up the wallet" action="Wallet" onAction={() => navigation.navigate('Wallet')} />
            {data.rechargeOffers.map((offer) => (
              <Card key={offer.id} onPress={() => navigation.navigate('Wallet')}>
                <View style={styles.rechargeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rechargeTitle}>{offer.label}</Text>
                    <Text style={styles.rechargeSub}>
                      Pay {formatMoney(offer.payAmount)} · get {formatMoney(offer.bonusAmount)} bonus
                    </Text>
                  </View>
                  <Text style={styles.rechargeTotal}>{formatMoney(offer.totalValue)}</Text>
                </View>
              </Card>
            ))}

            <Button label="Invite a friend, both get wallet credit" onPress={() => navigation.navigate('Referral')} />
          </>
        ) : null}
      </ScrollView>
      <AppSheet request={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  loyaltyRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  loyaltyIcon: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' },
  loyaltyTitle: { fontSize: font.size.sm, color: colors.ink500 },
  loyaltyValue: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.ink900, letterSpacing: -0.4 },
  loyaltySub: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  couponHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) },
  code: { flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: colors.brand50, borderWidth: 1, borderColor: colors.brand200, borderStyle: 'dashed', borderRadius: radius.sm, paddingHorizontal: space(3), paddingVertical: space(2) },
  codeText: { color: colors.brand700, fontWeight: font.weight.heavy, fontSize: font.size.md, letterSpacing: 1 },
  couponDescription: { fontSize: font.size.sm, color: colors.ink700, marginTop: space(3), lineHeight: 20 },
  couponMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3), marginTop: space(2) },
  metaText: { fontSize: font.size.xs, color: colors.ink500 },
  validity: { fontSize: font.size.xs, color: colors.ink400, marginTop: space(2) },
  rechargeRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  rechargeTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  rechargeSub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  rechargeTotal: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: colors.mint },
});
