/**
 * Refer a friend: the code, the link, the rules, and what has actually been
 * paid out so far — all from `GET /customer/referrals`.
 *
 * Nothing here promises money that has not been credited: "pending" rewards are
 * labelled as waiting for the friend's first paid visit, exactly as the server
 * tracks them.
 */
import React from 'react';
import { Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { customer } from '../shared/endpoints';
import { useAsync } from '../shared/hooks';
import { Avatar, Badge, Banner, Button, Card, Empty, Loading, Row, SectionTitle, StatTile } from '../shared/components';
import { colors, font, radius, shadow, space } from '../shared/theme';
import { formatMoney } from '../core';

export function ReferralScreen() {
  const navigation = useNavigation<any>();
  const referrals = useAsync(() => customer.referrals(), []);
  const data = referrals.data;

  const share = async () => {
    if (!data) return;
    const message = `I get my hair done at this salon — use my code ${data.code} when you join and we both get ${formatMoney(
      data.config.refereeReward,
    )} of wallet credit after your first visit. ${data.link}`;
    try {
      await Share.share({ message, title: 'Join me at the salon' });
    } catch {
      Alert.alert('Your referral code', `${data.code}\n\n${data.link}`);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Refer & earn</Text>
          <Text style={styles.sub}>
            {data
              ? `You get ${formatMoney(data.config.referrerReward)}, they get ${formatMoney(data.config.refereeReward)}`
              : 'Invite friends to the salon'}
          </Text>
        </View>
        <Button label="Share" size="sm" onPress={() => void share()} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={referrals.refreshing} onRefresh={referrals.refresh} tintColor={colors.brand500} />}
      >
        {referrals.error ? <Banner tone="error" message={referrals.error} action="Try again" onAction={referrals.reload} /> : null}
        {referrals.loading && !data ? <Loading label="Loading your referrals…" /> : null}

        {data ? (
          <>
            <Card>
              <Text style={styles.codeLabel}>Your referral code</Text>
              <View style={styles.codeRow}>
                <Text style={styles.code}>{data.code}</Text>
                <Button label="Share link" variant="secondary" size="sm" onPress={() => void share()} />
              </View>
              <Text style={styles.link} numberOfLines={1}>
                {data.link}
              </Text>

              <View style={styles.statsRow}>
                <StatTile label="Invited" value={String(data.totalInvitations)} />
                <StatTile label="Joined" value={String(data.registered)} />
                <StatTile label="Qualified" value={String(data.qualified)} tone={colors.mint} />
              </View>

              <View style={styles.payout}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutLabel}>Credited to your wallet</Text>
                  <Text style={styles.payoutValue}>{formatMoney(data.creditedRewards)}</Text>
                </View>
                {data.pendingRewards > 0 ? (
                  <Badge label={`${formatMoney(data.pendingRewards)} pending`} bg={colors.amberSoft} fg="#B45309" />
                ) : null}
              </View>
            </Card>

            <SectionTitle title="How it works" />
            <Card>
              {data.rules.map((rule, index) => (
                <View key={rule} style={[styles.ruleRow, index > 0 && styles.ruleBorder]}>
                  <View style={styles.ruleNumber}>
                    <Text style={styles.ruleNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
              <Row label="Coupon/reward status" value={data.config.requireFirstPaidVisit ? 'After their first paid visit' : 'On sign-up'} />
              <Row label="Monthly limit" value={`${data.config.maxRewardsPerMonth} rewards`} />
            </Card>

            <SectionTitle title="Your referrals" />
            {data.referrals.length === 0 ? (
              <Card>
                <Empty
                  icon="🤝"
                  title="No referrals yet"
                  message="Share your code — you will see who joined and when the reward lands."
                  action="Share now"
                  onAction={() => void share()}
                />
              </Card>
            ) : (
              <Card>
                {data.referrals.map((referral, index) => (
                  <View key={referral.id} style={[styles.referralRow, index > 0 && styles.ruleBorder]}>
                    <Avatar name={referral.referredCustomerName} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.referralName}>{referral.referredCustomerName}</Text>
                      <Text style={styles.referralMeta}>
                        {referral.qualifiedAt ? 'First visit completed' : 'Waiting for their first paid visit'}
                      </Text>
                    </View>
                    <Badge
                      label={referral.referrerRewardStatus === 'credited' ? `+${formatMoney(data.config.referrerReward)}` : referral.status}
                      bg={referral.referrerRewardStatus === 'credited' ? colors.mintSoft : colors.ink100}
                      fg={referral.referrerRewardStatus === 'credited' ? colors.mint : colors.ink600}
                    />
                  </View>
                ))}
              </Card>
            )}

            {data.leaderboard.length > 0 ? (
              <>
                <SectionTitle title="Top referrers this month" />
                <Card>
                  {data.leaderboard.map((entry, index) => (
                    <View key={entry.customerId} style={[styles.referralRow, index > 0 && styles.ruleBorder]}>
                      <Text style={styles.rank}>#{index + 1}</Text>
                      <Text style={styles.leaderName} numberOfLines={1}>
                        {entry.name}
                      </Text>
                      <Text style={styles.leaderMeta}>
                        {entry.qualified} referrals · {formatMoney(entry.earned)}
                      </Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} />
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
  codeLabel: { fontSize: font.size.xs, color: colors.ink500, textTransform: 'uppercase', letterSpacing: 0.6 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3), marginTop: space(2) },
  code: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.brand700, letterSpacing: 2 },
  link: { fontSize: font.size.xs, color: colors.ink400, marginTop: space(2) },
  statsRow: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  payout: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(4), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  payoutLabel: { fontSize: font.size.xs, color: colors.ink500 },
  payoutValue: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.mint, letterSpacing: -0.4 },
  ruleRow: { flexDirection: 'row', gap: space(3), paddingVertical: space(3) },
  ruleBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  ruleNumber: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  ruleNumberText: { color: colors.brand700, fontWeight: font.weight.bold, fontSize: font.size.xs },
  ruleText: { flex: 1, fontSize: font.size.sm, color: colors.ink700, lineHeight: 20 },
  referralRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  referralName: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  referralMeta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  rank: { fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.brand600, width: 30 },
  leaderName: { flex: 1, fontSize: font.size.sm, color: colors.ink800, fontWeight: font.weight.semibold },
  leaderMeta: { fontSize: font.size.xs, color: colors.ink500 },
});
