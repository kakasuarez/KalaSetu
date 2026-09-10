/**
 * One product tile, used by the Home grid and the Shop grid.
 *
 * `compact` is the Home variant: image, name, price. The full variant adds the
 * one-line description and the channel dots the Shop needs.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Listing } from '../api/listings';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { StatusPill } from './ui';
import { RotatingProductImage } from './RotatingProductImage';

type Props = {
  listing: Listing;
  onPress: () => void;
  compact?: boolean;
};

/** Rupees as she reads them: no decimals, Indian digit grouping. */
export function formatPrice(value: string | null): string {
  if (!value) return 'No price yet';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'No price yet';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function productName(listing: Listing): string {
  return listing.title_en || listing.title_hi || 'Untitled product';
}

export function ProductCard({ listing, onPress, compact = false }: Props) {
  const description = listing.description_en || listing.description_hi || '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${productName(listing)}, ${formatPrice(listing.price)}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.imageWrap}>
        <RotatingProductImage listing={listing} style={styles.image} />
        <StatusPill status={listing.status} style={styles.status} />
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {productName(listing)}
        </Text>
        {!compact && description ? (
          <Text style={styles.description} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
        <Text style={compact ? styles.priceCompact : styles.price}>
          {formatPrice(listing.price)}
        </Text>
        {!compact ? (
          <View style={styles.channels}>
            {/* Publishing lands in phases 7-8. Until then every channel is
                honestly grey: nothing has been published anywhere. */}
            <View style={[styles.dot, styles.dotOff]} />
            <View style={[styles.dot, styles.dotOff]} />
            <Text style={styles.channelText}>Not published yet</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  pressed: { opacity: 0.85 },
  imageWrap: { aspectRatio: 0.9, backgroundColor: colors.surfaceAlt },
  image: { width: '100%', height: '100%' },
  status: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  body: { padding: spacing.gap },
  name: { ...typography.bodyBold, color: colors.text, lineHeight: 24 },
  description: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  price: {
    ...typography.heading,
    color: colors.primary,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  priceCompact: {
    ...typography.bodyBold,
    color: colors.primary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  channels: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 999 },
  dotOff: { backgroundColor: colors.border },
  channelText: { ...typography.caption, fontSize: 14, color: colors.textMuted, marginLeft: 2 },
});
