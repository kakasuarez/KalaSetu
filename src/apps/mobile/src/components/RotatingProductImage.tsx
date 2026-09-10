import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { resolveMediaUrl } from '../api/client';
import { colors, radius, spacing, typography } from '../theme';
import { ModelViewer3D } from './ModelViewer3D';

type ListingMediaInput = {
  primary_media_url?: string | null;
  media_urls?: string[] | null;
  media?: Array<{ id?: string; kind?: string; url?: string; media_url?: string }> | null;
  facts?: Record<string, unknown> | null;
};

type Props = {
  listing: ListingMediaInput;
  style?: StyleProp<ViewStyle>;
  autoRotate?: boolean;
};

function getGlbUrl(listing: ListingMediaInput): string | null {
  const glbMedia = listing.media?.find((m) => m.kind === 'glb');
  if (glbMedia) {
    if (glbMedia.url) return resolveMediaUrl(glbMedia.url);
    if (glbMedia.media_url) return resolveMediaUrl(glbMedia.media_url);
    if (glbMedia.id) return resolveMediaUrl(`media/${glbMedia.id}/file`);
  }

  const allUrls = [listing.primary_media_url, ...(listing.media_urls || [])].filter(Boolean) as string[];
  const urlCandidate = allUrls.find((u) => {
    const lower = u.toLowerCase();
    return lower.includes('.glb') || lower.includes('.gltf') || lower.includes('kind=glb');
  });

  return urlCandidate ? resolveMediaUrl(urlCandidate) : null;
}

export function RotatingProductImage({ listing, style, autoRotate = true }: Props) {
  const resolvedGlb = getGlbUrl(listing);

  if (resolvedGlb) {
    return (
      <View style={[styles.frame, style]} pointerEvents="none">
        <ModelViewer3D url={resolvedGlb} autoRotate={true} interactive={false} />
      </View>
    );
  }

  const sources = (listing.media_urls?.length ? listing.media_urls : [listing.primary_media_url])
    .map((url) => (url ? resolveMediaUrl(url) : null))
    .filter((url): url is string => Boolean(url));

  const [index, setIndex] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const startIndex = useRef(0);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const is3dSpinActive = Boolean(
    (listing.facts as Record<string, unknown> | undefined)?.has_3d_spin ||
    sources.length > 1
  );

  useEffect(() => {
    if (!autoRotate || sources.length <= 1 || isInteracting) {
      if (timer.current) clearInterval(timer.current);
      return;
    }

    timer.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % sources.length);
    }, 2200);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [autoRotate, sources.length, isInteracting]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => sources.length > 1,
      onMoveShouldSetPanResponder: (_, gesture) => sources.length > 1 && Math.abs(gesture.dx) > 6,
      onPanResponderGrant: () => {
        setIsInteracting(true);
        startIndex.current = index;
      },
      onPanResponderMove: (_, gesture) => {
        if (sources.length < 2) return;
        const direction = gesture.dx < -20 ? 1 : gesture.dx > 20 ? -1 : 0;
        if (direction) {
          setIndex((startIndex.current + direction + sources.length) % sources.length);
        }
      },
      onPanResponderRelease: () => {
        setIsInteracting(false);
      },
      onPanResponderTerminate: () => {
        setIsInteracting(false);
      },
    }),
  ).current;

  return (
    <View style={[styles.frame, style]} {...pan.panHandlers}>
      {sources.length ? (
        <Image source={{ uri: sources[index % sources.length] }} style={styles.image} resizeMode="contain" />
      ) : (
        <Text style={styles.empty}>🧺</Text>
      )}
      {is3dSpinActive ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>360° 3D</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  image: { width: '100%', height: '100%' },
  empty: { ...typography.display, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(43, 33, 24, 0.82)',
  },
  badgeText: { ...typography.label, color: colors.textInverse },
});