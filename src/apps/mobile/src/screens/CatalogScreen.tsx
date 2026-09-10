/**
 * Shop -- her whole catalogue, two columns.
 *
 * Search is a microphone, not a text field: typing a product name is the one
 * thing she is least likely to manage, and everything else in the app is
 * already voice-first.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { listingsApi, type Listing, type ListingStatus } from '../api/listings';
import { messageFor } from '../api/errors';
import { ProductCard, productName } from '../components/ProductCard';
import {
  EmptyState,
  Fab,
  FilterChips,
  Icon,
  SpeakerButton,
  type Chip,
} from '../components/ui';
import type { AppNav } from '../navigation';
import { colors, spacing, typography } from '../theme';

type Filter = 'all' | ListingStatus;

const FILTERS: Chip<Filter>[] = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Live' },
  { value: 'draft', label: 'Draft' },
  { value: 'paused', label: 'Paused' },
];

export function CatalogScreen() {
  const navigation = useNavigation<AppNav>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Fetch everything and filter on the device: her catalogue is tens of
      // items, not thousands, and a refetch per chip tap on a rural
      // connection would make the filters feel broken.
      setListings(await listingsApi.list(undefined, 200));
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

  const shown = useMemo(
    () => (filter === 'all' ? listings : listings.filter((l) => l.status === filter)),
    [listings, filter],
  );

  const countLine =
    listings.length === 1 ? '1 item listed' : `${listings.length} items listed`;

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
          <View style={styles.titleRow}>
            <Text style={styles.title}>My Shop</Text>
            <SpeakerButton
              size={40}
              phrase={
                shown.length
                  ? `You have ${countLine.replace(' listed', '')}. ` +
                    shown
                      .slice(0, 3)
                      .map((l) => productName(l))
                      .join(', ')
                  : 'Your shop is empty.'
              }
            />
          </View>
          <Text style={styles.count}>{countLine}</Text>
        </View>

        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

        {/* A microphone rather than a text field: typing a product name is
            the one thing she is least likely to manage. It opens the same
            assistant as the Home button, which can answer questions about
            what is in her shop. */}
        <Pressable
          onPress={() => navigation.navigate('VoiceAssistant')}
          accessibilityRole="button"
          accessibilityLabel="Search by voice"
          style={({ pressed }) => [styles.search, pressed && styles.pressed]}
        >
          <View style={styles.searchMic}>
            <Icon name="mic" size={22} color={colors.textInverse} />
          </View>
          <Text style={styles.searchText}>Search by voice</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        ) : shown.length ? (
          <View style={styles.grid}>
            {shown.map((listing) => (
              <View key={listing.id} style={styles.cell}>
                <ProductCard
                  listing={listing}
                  onPress={() =>
                    navigation.navigate('ListingView', { listingId: listing.id })
                  }
                />
              </View>
            ))}
          </View>
        ) : listings.length ? (
          <EmptyState
            glyph="🧺"
            title="Nothing here yet"
            body="No items in this list. Add a new one."
            action={{ label: 'Add new item', onPress: () => navigation.navigate('CatalogWizard', {}) }}
          />
        ) : (
          <EmptyState
            glyph="🧺"
            title="Your shop is empty"
            body="Take a photo of something you have made, and I will write the listing for you."
            action={{ label: 'Add new item', onPress: () => navigation.navigate('CatalogWizard', {}) }}
          />
        )}

        <View style={styles.tail} />
      </ScrollView>

      <Fab
        icon="plus"
        label="Add new item"
        accessibilityLabel="Add new item"
        onPress={() => navigation.navigate('CatalogWizard', {})}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.title, color: colors.text },
  count: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  error: {
    ...typography.body,
    color: colors.error,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap,
    height: 60,
    marginHorizontal: spacing.md,
    marginBottom: spacing.gap,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  searchMic: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchText: { ...typography.body, color: colors.text },
  spinner: { marginTop: spacing.xl },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  cell: { width: '48%', flexGrow: 1 },
  tail: { height: 96 },
});
