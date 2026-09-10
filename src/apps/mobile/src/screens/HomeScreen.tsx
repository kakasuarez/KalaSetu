/**
 * Home.
 *
 * The first thing she checks is whether she earned anything, so money is the
 * largest thing on the screen and every figure can be tapped to hear itself.
 *
 * The greeting deliberately carries no name. She signs in with a phone number
 * and a PIN, so the server only knows her as "Artisan 8200" until she fills in
 * her profile -- and greeting someone by a serial number is worse than not
 * greeting them by name at all.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { resolveMediaUrl } from '../api/client';
import { artisansApi, type Artisan } from '../api/artisans';
import { listingsApi, type Listing } from '../api/listings';
import { messageFor } from '../api/errors';
import { SAMPLE_EARNINGS } from '../data/sampleContent';
import { ProductCard, formatPrice, productName } from '../components/ProductCard';
import { RotatingProductImage } from '../components/RotatingProductImage';
import {
  Card,
  EmptyState,
  Fab,
  Icon,
  SectionHeading,
  SpeakerButton,
} from '../components/ui';
import type { AppNav } from '../navigation';
import { colors, radius, shadows, spacing, typography } from '../theme';

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function rupees(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN');
}

export function HomeScreen() {
  const navigation = useNavigation<AppNav>();
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Both in flight together: the profile call renders the header and the
      // listings call the body, and neither needs the other.
      const [me, mine] = await Promise.all([
        artisansApi.me(),
        listingsApi.list(undefined, 20),
      ]);
      setArtisan(me);
      setListings(mine);
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const hero = listings[0] ?? null;
  const topFour = useMemo(() => listings.slice(0, 4), [listings]);

  const place = [artisan?.village, artisan?.primary_craft].filter(Boolean).join(' · ');
  const avatarUri = resolveMediaUrl(artisan?.photo_url);

  const screenSummary = [
    greeting() + '.',
    place || null,
    `Your total earnings are ${rupees(SAMPLE_EARNINGS.totalRupees)}.`,
    `You have sold ${SAMPLE_EARNINGS.productsSold} products.`,
    hero ? `Your most popular product is ${productName(hero)}.` : null,
    `You have ${listings.length} products in your shop.`,
  ]
    .filter(Boolean)
    .join(' ');

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <View style={styles.greetingRow}>
              <Text style={styles.greeting}>{greeting()}</Text>
              <SpeakerButton phrase={screenSummary} accessibilityLabel="Listen to this screen" />
            </View>
            {place ? <Text style={styles.place}>{place}</Text> : null}
          </View>

          <Pressable
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Icon name="user" size={26} color={colors.primary} />
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.stats}>
          <StatCard
            tint={colors.accentSoft}
            glyph={<Text style={styles.rupeeGlyph}>₹</Text>}
            label="Total earnings"
            value={rupees(SAMPLE_EARNINGS.totalRupees)}
            pill={`↑ ${rupees(SAMPLE_EARNINGS.weekDeltaRupees)} this week`}
            pillTint={colors.okSoft}
            pillColor={colors.okText}
            speak={`Your total earnings are ${rupees(SAMPLE_EARNINGS.totalRupees)}. This is sample data.`}
          />
          <StatCard
            tint={colors.okSoft}
            glyph={<Icon name="package" size={24} color={colors.ok} />}
            label="Products sold"
            value={String(SAMPLE_EARNINGS.productsSold)}
            pill={`${SAMPLE_EARNINGS.soldThisMonth} this month`}
            pillTint={colors.surfaceAlt}
            pillColor={colors.textMuted}
            speak={`You have sold ${SAMPLE_EARNINGS.productsSold} products. This is sample data.`}
          />
        </View>
        {/* Orders are not ingested until the WhatsApp and ONDC channels land,
            so these two figures are illustrative. Saying so is the only
            honest option -- she might otherwise act on them. */}
        <Text style={styles.sampleNote}>
          Sample figures — real sales appear once your shop is published
        </Text>

        {hero ? (
          <>
            <SectionHeading
              title="Most popular"
              speak={`Your most popular product is ${productName(hero)}, ${formatPrice(hero.price)}.`}
            />
            <Pressable
              onPress={() => navigation.navigate('ListingView', { listingId: hero.id })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
            >
              <RotatingProductImage listing={hero} style={styles.heroMedia} />
              <View style={styles.heroBody}>
                <Text style={styles.heroName} numberOfLines={2}>
                  {productName(hero)}
                </Text>
                <Text style={styles.heroPrice}>{formatPrice(hero.price)}</Text>
              </View>
            </Pressable>
          </>
        ) : null}

        {topFour.length ? (
          <>
            <SectionHeading
              title="Your best products"
              action={{ label: 'See all →', onPress: () => navigation.navigate('Shop') }}
            />
            <View style={styles.grid}>
              {topFour.map((listing) => (
                <View key={listing.id} style={styles.gridCell}>
                  <ProductCard
                    listing={listing}
                    compact
                    onPress={() =>
                      navigation.navigate('ListingView', { listingId: listing.id })
                    }
                  />
                </View>
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            glyph="🧺"
            title="Your shop is empty"
            body="Take a photo of something you have made, and I will write the listing for you."
            action={{ label: 'Add your first product', onPress: () => navigation.navigate('CatalogWizard', {}) }}
          />
        )}

        <View style={styles.tail} />
      </ScrollView>

      <Fab
        icon="mic"
        size={68}
        pulse
        accessibilityLabel="Ask me anything"
        onPress={() => navigation.navigate('VoiceAssistant')}
      />
    </SafeAreaView>
  );
}

function StatCard({
  tint,
  glyph,
  label,
  value,
  pill,
  pillTint,
  pillColor,
  speak,
}: {
  tint: string;
  glyph: React.ReactNode;
  label: string;
  value: string;
  pill: string;
  pillTint: string;
  pillColor: string;
  speak: string;
}) {
  return (
    <Card style={styles.stat}>
      <View style={styles.statHead}>
        <View style={[styles.statGlyph, { backgroundColor: tint }]}>{glyph}</View>
        <SpeakerButton phrase={speak} size={36} accessibilityLabel={`Listen to ${label}`} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={[styles.statPill, { backgroundColor: pillTint }]}>
        <Text style={[styles.statPillText, { color: pillColor }]}>{pill}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: spacing.xxl },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.gap,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  headerText: { flex: 1, minWidth: 0 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  greeting: { ...typography.title, color: colors.text },
  place: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  pressed: { opacity: 0.8 },
  error: {
    ...typography.body,
    color: colors.error,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.gap,
  },

  stats: {
    flexDirection: 'row',
    gap: spacing.gap,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  stat: { flex: 1, minWidth: 0 },
  statHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statGlyph: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rupeeGlyph: { fontSize: 24, color: '#B8791B', fontFamily: typography.bodyBold.fontFamily },
  statLabel: { ...typography.caption, color: colors.textMuted, marginTop: 10 },
  statValue: {
    ...typography.display,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  statPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statPillText: { ...typography.label },
  sampleNote: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },

  hero: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  heroMedia: {
    height: 220,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: { width: '100%', height: '100%' },
  heroGlyph: { fontSize: 64 },
  heroBody: { padding: spacing.md },
  heroName: { ...typography.heading, color: colors.text },
  heroPrice: { ...typography.bodyBold, color: colors.primary, marginTop: spacing.xs },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    paddingHorizontal: spacing.md,
  },
  gridCell: { width: '48%', flexGrow: 1 },
  tail: { height: 96 },
});
