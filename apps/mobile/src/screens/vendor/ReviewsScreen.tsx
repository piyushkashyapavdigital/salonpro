/**
 * Reviews: the private side of the Google review funnel.
 *
 * Customers rate 1–5 on the hosted page. 4–5★ customers are handed to Google;
 * 1–3★ never leaves SalonPro. This screen shows every rating the salon
 * captured, including whether the customer was actually sent to Google.
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { admin } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import { Badge, Banner, Card, Chip, Empty, Loading, SectionTitle, StatTile } from '../../shared/components';
import { colors, font, radius, space } from '../../shared/theme';
import { formatDateTime } from '../../core';
import type { SalonReview } from '../../core';

type Filter = 'all' | 'positive' | 'private';

function Stars({ rating }: { rating: number }) {
  return (
    <Text style={styles.stars} accessibilityLabel={`${rating} out of 5 stars`}>
      {'★'.repeat(Math.max(0, Math.min(5, rating)))}
      <Text style={styles.starsEmpty}>{'☆'.repeat(Math.max(0, 5 - rating))}</Text>
    </Text>
  );
}

function ReviewCard({ review }: { review: SalonReview }) {
  return (
    <Card>
      <View style={styles.reviewHead}>
        <View style={{ flex: 1 }}>
          <Stars rating={review.rating} />
          <View style={styles.whoRow}>
            <Text style={styles.who}>
              {review.customerName || 'Anonymous customer'}
              {review.customerPhone ? ` · ${review.customerPhone}` : ''}
            </Text>
            {review.customerId ? <Badge label="Verified visit" bg={colors.brand50} fg={colors.brand700} /> : null}
          </View>
        </View>
        <Badge
          label={review.googleRedirected ? 'Google hand-off' : review.rating <= 3 ? 'private' : 'saved'}
          bg={review.googleRedirected ? colors.mintSoft : review.rating <= 3 ? colors.amberSoft : colors.ink100}
          fg={review.googleRedirected ? colors.mint : review.rating <= 3 ? colors.amber : colors.ink600}
        />
      </View>
      <Text style={review.message ? styles.message : styles.emptyMessage}>
        {review.message || 'No written message — rating only.'}
      </Text>
      <Text style={styles.meta}>{formatDateTime(review.createdAt)}</Text>
    </Card>
  );
}

export function ReviewsScreen() {
  const navigation = useNavigation<any>();
  const reviews = useAsync(() => admin.reviews({ limit: 200 }), []);
  const [filter, setFilter] = useState<Filter>('all');

  const all = reviews.data?.reviews ?? [];
  const stats = reviews.data?.stats;
  const visible = useMemo(() => {
    if (filter === 'positive') return all.filter((review) => review.rating >= 4);
    if (filter === 'private') return all.filter((review) => review.rating <= 3);
    return all;
  }, [all, filter]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reviews</Text>
          <Text style={styles.sub}>Google hand-offs and private feedback</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={reviews.refreshing} onRefresh={reviews.refresh} tintColor={colors.brand500} />}
      >
        {reviews.error ? <Banner tone="error" message={reviews.error} action="Try again" onAction={reviews.reload} /> : null}

        <Banner
          tone="info"
          title="How this works"
          message="Only the salon team can see this feedback. 4–5★ customers can choose to share their words on Google; 1–3★ feedback stays private here."
        />

        {reviews.loading && !reviews.data ? (
          <Loading label="Loading reviews…" />
        ) : (
          <>
            <Card>
              <View style={styles.statsRow}>
                <StatTile label="Average" value={stats?.total ? `${stats.average.toFixed(1)}★` : '—'} tone={colors.brand700} />
                <StatTile label="Total" value={String(stats?.total ?? 0)} />
              </View>
              <View style={styles.statsRow}>
                <StatTile label="Google hand-offs" value={String(stats?.googleRedirected ?? 0)} tone={colors.mint} />
                <StatTile label="Private (1–3★)" value={String(stats?.privateFeedback ?? 0)} tone={stats?.privateFeedback ? colors.rose : colors.ink800} />
              </View>
              <View style={styles.breakdown}>
                {[5, 4, 3, 2, 1].map((rating) => {
                  const key = (['oneStar', 'twoStar', 'threeStar', 'fourStar', 'fiveStar'] as const)[rating - 1];
                  return (
                    <View key={rating} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{rating}★</Text>
                      <View style={styles.breakdownTrack}>
                        <View
                          style={[
                            styles.breakdownFill,
                            {
                              width: `${stats?.total ? (Number(stats[key]) / stats.total) * 100 : 0}%`,
                              backgroundColor: rating >= 4 ? colors.mint : colors.amber,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.breakdownValue}>{stats ? stats[key] : 0}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>

            <View style={styles.chips}>
              <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="4–5★ Google" active={filter === 'positive'} onPress={() => setFilter('positive')} />
              <Chip label="1–3★ private" active={filter === 'private'} onPress={() => setFilter('private')} />
            </View>

            <SectionTitle title={filter === 'all' ? 'Every review' : filter === 'positive' ? 'Positive reviews' : 'Private feedback'} />
            {visible.length === 0 ? (
              <Card>
                <Empty
                  icon="⭐"
                  title="No reviews here yet"
                  message="Share the hosted review link from Settings. Ratings will appear here as customers submit them."
                />
              </Card>
            ) : (
              visible.map((review) => <ReviewCard key={review.id} review={review} />)
            )}
          </>
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
  statsRow: { flexDirection: 'row', gap: space(2), marginBottom: space(2) },
  breakdown: { gap: space(1.5), marginTop: space(2) },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  breakdownLabel: { width: 26, fontSize: font.size.xs, color: colors.ink500, fontWeight: font.weight.semibold },
  breakdownTrack: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.ink100, overflow: 'hidden' },
  breakdownFill: { height: 6, borderRadius: radius.pill },
  breakdownValue: { width: 26, textAlign: 'right', fontSize: font.size.xs, color: colors.ink600 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  reviewHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  stars: { fontSize: 20, color: colors.amber, letterSpacing: 1 },
  starsEmpty: { color: colors.ink200 },
  whoRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space(1.5), marginTop: 2 },
  who: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  message: { fontSize: font.size.sm, color: colors.ink700, lineHeight: 21, marginTop: space(2) },
  emptyMessage: { fontSize: font.size.sm, color: colors.ink400, fontStyle: 'italic', marginTop: space(2) },
  meta: { fontSize: font.size.xs, color: colors.ink400, marginTop: space(2) },
});
