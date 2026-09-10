import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type Props = {
  urls: string[];
  style?: StyleProp<ViewStyle>;
  autoRotate?: boolean;
  showBadge?: boolean;
  showHint?: boolean;
};

export function Product360Viewer({
  urls,
  style,
  autoRotate = true,
  showBadge = true,
  showHint = true,
}: Props) {
  const [index, setIndex] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const startIndex = useRef(0);
  const lastDx = useRef(0);
  const autoRotateTimer = useRef<NodeJS.Timeout | null>(null);

  const count = urls.length;

  // Auto-rotate effect when not interacting
  useEffect(() => {
    if (!autoRotate || count <= 1 || isInteracting) {
      if (autoRotateTimer.current) clearInterval(autoRotateTimer.current);
      return;
    }

    autoRotateTimer.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % count);
    }, 1800);

    return () => {
      if (autoRotateTimer.current) clearInterval(autoRotateTimer.current);
    };
  }, [autoRotate, count, isInteracting]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => count > 1,
      onMoveShouldSetPanResponder: (_, gesture) =>
        count > 1 && Math.abs(gesture.dx) > 4,
      onPanResponderGrant: () => {
        setIsInteracting(true);
        startIndex.current = index;
        lastDx.current = 0;
      },
      onPanResponderMove: (_, gesture) => {
        if (count < 2) return;
        // Sensitivity: 1 step per 30px dragged
        const step = Math.round((gesture.dx - lastDx.current) / -30);
        if (step !== 0) {
          lastDx.current = gesture.dx;
          setIndex((prev) => (prev + step + count * 100) % count);
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

  if (!urls.length) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.empty}>🧺</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} {...pan.panHandlers}>
      <Image
        source={{ uri: urls[index % count] }}
        style={styles.image}
        resizeMode="contain"
      />

      {showBadge && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>360° 3D</Text>
        </View>
      )}

      {showHint && count > 1 && (
        <View style={styles.hintContainer} pointerEvents="none">
          <Text style={styles.hintText}>
            घुमाने के लिए छुएं • Drag to rotate 360°
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  empty: {
    ...typography.display,
    color: colors.textMuted,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(43, 33, 24, 0.85)',
    zIndex: 5,
  },
  badgeText: {
    ...typography.label,
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  hintContainer: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  hintText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: 'rgba(253, 249, 243, 0.92)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
