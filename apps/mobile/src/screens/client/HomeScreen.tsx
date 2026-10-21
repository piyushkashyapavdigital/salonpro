/**
 * Customer home: balance, next visit, what is popular, and what is on offer.
 *
 * Everything on the screen comes from one call (`GET /customer/home`), so it is
 * cheap to refresh and cannot show half an answer.
 */
import React, { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../shared/auth';
import { health, customer } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import { Badge, Banner, Button, Card, Empty, Loading, ProgressBar, SectionTitle, StatTile } from '../../shared/components';
import { colors, font, gradients, radius, shadow, space, statusColors, STATUS_LABEL } from '../../shared/theme';
import { LinearGradient } from '../../shared/components';
import { formatDate, formatMoney, formatMoneyShort, formatTime12, relativeTime } from '../../core';

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const home = useAsync(() => customer.home(), []);
  const homeData = home.data;

  const badges = useAsync(async () => {
    const checks = await Promise.allSettled([health()]);
    const report = checks[0];
    return report.status === 'fulfilled' ? report.value.integrations : null;
  }, []);

  const refresh = useCallback(() => home.refresh(), [home]);

  if (home.loading && !homeData) return <Loading label="Loading your salon…" />;

  const firstName = (user?.name ?? homeData?.profile.name ?? 'there').split(' ')[0];
  const wallet = homeData?.wallet;
  const next = homeData?.upcoming?.[0];
  const integrations = badges.data;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space(10) }}
        refreshControl={<RefreshControl refreshing={home.refreshing} onRefresh={refresh} tintColor={colors.brand500} />}
      >
        <LinearGradient
          colors={gradients.header as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>Hi {firstName} 👋</Text>
              <Text style={styles.heroSub}>
                {homeData?.visitsThisMonth ? `${homeData.visitsThisMonth} visits this month` : 'Ready for a fresh look?'}
              </Text>
            </View>
            <Pressable onPress={() => navigation.navigate('Notifications')} style={styles.bell} hitSlop={8}>
              <MaterialIcons name="notifications-none" size={22} color={colors.white} />
            </Pressable>
          </View>

          <Pressable onPress={() => navigation.navigate('Wallet')} style={styles.walletCard}>
            <View>
              <Text style={styles.walletLabel}>Wallet balance</Text>
              <Text style={styles.walletValue}>{formatMoney(wallet?.totalBalance ?? 0)}</Text>
              <Text style={styles.walletSplit}>
                {formatMoney(wallet?.cashBalance ?? 0)} purchased · {formatMoney(wallet?.bonusBalance ?? 0)} bonus
              </Text>
            </View>
            <View style={styles.recharge}>
              <MaterialIcons name="add" size={16} color={colors.brand700} />
              <Text style={styles.rechargeText}>Recharge</Text>
            </View>
          </Pressable>

          {homeData?.loyaltyEnabled ? (
            <View style={styles.loyaltyRow}>
              <MaterialIcons name="stars" size={16} color="#FDE68A" />
              <Text style={styles.loyaltyText}>
                {homeData.loyalty.points} loyalty points
                {homeData.loyalty.lifetimePoints ? ` · ${homeData.loyalty.lifetimePoints} earned so far` : ''}
              </Text>
            </View>
          ) : null}
        </LinearGradient>

        <View style={styles.body}>
          {home.error ? <Banner tone="error" title="Could not load" message={home.error} action="Try again" onAction={refresh} /> : null}

          {integrations && !integrations.otpDelivery ? (
            <Banner
              tone="info"
              message="This salon's server has no SMS provider connected, so sign-in codes are shown on screen and no message is sent."
            />
          ) : null}

          {homeData?.birthdayReward ? (
            <Banner tone="success" title="Happy birthday!" message="A birthday reward is waiting in your wallet." />
          ) : null}

          <SectionTitle title="Your next visit" action="See all" onAction={() => navigation.navigate('Visits')} />
          {next ? (
            <Card onPress={() => navigation.navigate('VisitDetail', { id: next.id })}>
              <View style={styles.visitHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.visitDate}>{formatDate(next.date, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                  <Text style={styles.visitTime}>
                    {formatTime12(next.startTime)} – {formatTime12(next.endTime)}
                  </Text>
                </View>
                <Badge label={STATUS_LABEL[next.status] ?? next.status} {...statusColors(next.status)} />
              </View>
              <View style={styles.visitBody}>
                {next.services.map((service) => (
                  <View key={service.serviceId} style={styles.serviceLine}>
                    <Text style={styles.serviceName} numberOfLines={1}>
                      {service.name}
                    </Text>
                    <Text style={styles.servicePrice}>{formatMoney(service.price)}</Text>
                  </View>
                ))}
                {next.staffName ? <Text style={styles.staffLine}>with {next.staffName}</Text> : null}
              </View>
              <View style={styles.visitFoot}>
                <Text style={styles.visitTotal}>{formatMoney(next.totalAmount)}</Text>
                <Text style={styles.visitPay}>
                  {next.paymentStatus === 'paid' ? 'Paid' : `${formatMoney(next.paidAmount)} paid`}
                </Text>
              </View>
            </Card>
          ) : (
            <Card>
              <Empty
                icon="📅"
                title="Nothing booked yet"
                message="Pick a service and a time that suits you — it takes a few taps."
                action="Book now"
                onAction={() => navigation.navigate('Book')}
              />
            </Card>
          )}

          <View style={styles.quickRow}>
            <QuickAction icon="content-cut" label="Book" color={colors.brand500} soft={colors.brand50} onPress={() => navigation.navigate('Book')} />
            <QuickAction icon="local-offer" label="Offers" color={colors.lilac} soft={colors.lilacSoft} onPress={() => navigation.navigate('Offers')} />
            <QuickAction icon="card-giftcard" label="Refer" color={colors.mint} soft={colors.mintSoft} onPress={() => navigation.navigate('Referral')} />
            <QuickAction icon="receipt-long" label="History" color={colors.sky} soft={colors.skySoft} onPress={() => navigation.navigate('Visits')} />
          </View>

          <SectionTitle title="Popular at the salon" action="All services" onAction={() => navigation.navigate('Book')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.popularRow}>
            {(homeData?.popular ?? []).map((service) => (
              <Pressable
                key={service.id}
                onPress={() => navigation.navigate('Book', { serviceId: service.id })}
                style={styles.popularCard}
              >
                <Text style={styles.popularEmoji}>{service.imageEmoji || '✨'}</Text>
                <Text style={styles.popularName} numberOfLines={2}>
                  {service.name}
                </Text>
                <Text style={styles.popularMeta}>
                  {formatMoney(service.price)} · {service.durationMinutes} min
                </Text>
                {service.bookings ? <Text style={styles.popularBooked}>{service.bookings} booked</Text> : null}
              </Pressable>
            ))}
          </ScrollView>

          {(homeData?.offers?.length ?? 0) > 0 ? (
            <>
              <SectionTitle title="Offers for you" action="See all" onAction={() => navigation.navigate('Offers')} />
              <Card>
                {homeData!.offers.slice(0, 3).map((coupon, index) => (
                  <View key={coupon.id} style={[styles.couponRow, index > 0 && styles.couponRowBorder]}>
                    <View style={styles.couponCode}>
                      <Text style={styles.couponCodeText}>{coupon.code}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.couponTitle}>
                        {coupon.type === 'percent' ? `${coupon.value}% off` : `${formatMoney(coupon.value)} off`}
                      </Text>
                      <Text style={styles.couponSub} numberOfLines={2}>
                        {coupon.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {homeData?.profile ? (
            <>
              <SectionTitle title="Your loyalty so far" />
              <Card>
                <View style={styles.statsRow}>
                  <StatTile label="Visits" value={String(homeData.profile.totalVisits)} />
                  <StatTile label="Lifetime spend" value={formatMoneyShort(homeData.profile.totalCompletedSpend)} />
                  <StatTile label="Average visit" value={formatMoneyShort(homeData.profile.averageSpend)} />
                </View>
                <View style={{ marginTop: space(3) }}>
                  <Text style={styles.progressLabel}>
                    {homeData.profile.successfulReferrals} friends joined with your code
                  </Text>
                  <ProgressBar ratio={Math.min(1, homeData.profile.successfulReferrals / 5)} />
                </View>
              </Card>
            </>
          ) : null}

          {(homeData?.recentPayments?.length ?? 0) > 0 ? (
            <>
              <SectionTitle title="Recent payments" />
              <Card>
                {homeData!.recentPayments.slice(0, 3).map((order, index) => (
                  <View key={order.id} style={[styles.paymentRow, index > 0 && styles.couponRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentTitle}>{order.purpose.replace(/_/g, ' ')}</Text>
                      <Text style={styles.paymentSub}>
                        {order.mode === 'simulated' ? 'Simulated payment (no money moved)' : order.mode}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.paymentAmount}>{formatMoney(order.amountPaid || order.amount)}</Text>
                      <Badge label={STATUS_LABEL[order.status] ?? order.status} {...statusColors(order.status)} />
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <Text style={styles.footnote}>
            {integrations && !integrations.razorpayLive
              ? 'Payments on this server run in simulated mode — no real money is charged and nothing is claimed as paid unless the server verified it.'
              : 'Payments are verified on the server before anything is marked paid.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, color, soft, onPress }: { icon: string; label: string; color: string; soft: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && styles.quickPressed]}>
      <View style={[styles.quickIcon, { backgroundColor: soft }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: { paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(6), borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  hello: { color: colors.white, fontSize: font.size.xl, fontWeight: font.weight.heavy, letterSpacing: -0.4 },
  heroSub: { color: '#EADCF6', fontSize: font.size.sm, marginTop: 2 },
  bell: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  walletCard: { marginTop: space(5), backgroundColor: '#ffffff1f', borderRadius: radius.lg, padding: space(4), flexDirection: 'row', alignItems: 'center', gap: space(3) },
  walletLabel: { color: '#EADCF6', fontSize: font.size.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  walletValue: { color: colors.white, fontSize: font.size.xxl, fontWeight: font.weight.heavy, marginTop: 2, letterSpacing: -0.6 },
  walletSplit: { color: '#D8C7EC', fontSize: font.size.xs, marginTop: 2 },
  recharge: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space(1), backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) },
  rechargeText: { color: colors.brand700, fontWeight: font.weight.bold, fontSize: font.size.xs },
  loyaltyRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(3) },
  loyaltyText: { color: '#FDE68A', fontSize: font.size.xs, fontWeight: font.weight.semibold },
  body: { padding: space(4), gap: space(3) },
  visitHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  visitDate: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  visitTime: { fontSize: font.size.sm, color: colors.ink500, marginTop: 2 },
  visitBody: { marginTop: space(3), gap: space(1.5) },
  serviceLine: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3) },
  serviceName: { flex: 1, fontSize: font.size.sm, color: colors.ink700 },
  servicePrice: { fontSize: font.size.sm, color: colors.ink500 },
  staffLine: { fontSize: font.size.xs, color: colors.ink400, marginTop: space(1) },
  visitFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(3), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  visitTotal: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  visitPay: { fontSize: font.size.xs, color: colors.ink500 },
  quickRow: { flexDirection: 'row', gap: space(2), marginTop: space(1) },
  quick: { flex: 1, alignItems: 'center', gap: space(1.5), backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: space(3), ...shadow.card },
  quickPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  quickIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: font.size.xs, color: colors.ink700, fontWeight: font.weight.semibold },
  popularRow: { gap: space(3), paddingVertical: space(1) },
  popularCard: { width: 156, backgroundColor: colors.white, borderRadius: radius.lg, padding: space(3.5), gap: space(1), ...shadow.card },
  popularEmoji: { fontSize: 26 },
  popularName: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.ink900, minHeight: 34 },
  popularMeta: { fontSize: font.size.xs, color: colors.ink500 },
  popularBooked: { fontSize: font.size.xs, color: colors.brand600, fontWeight: font.weight.semibold },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  couponRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  couponCode: { backgroundColor: colors.brand50, borderColor: colors.brand200, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.sm, paddingHorizontal: space(2.5), paddingVertical: space(1.5) },
  couponCodeText: { color: colors.brand700, fontWeight: font.weight.heavy, fontSize: font.size.sm },
  couponTitle: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.ink900 },
  couponSub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: space(3) },
  progressLabel: { fontSize: font.size.xs, color: colors.ink500, marginBottom: space(2) },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  paymentTitle: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800, textTransform: 'capitalize' },
  paymentSub: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  paymentAmount: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900, marginBottom: space(1) },
  footnote: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(2) },
});
