/**
 * Drag-to-compare between the raw photo and the enhanced one.
 *
 * This is the moment the app earns her trust: she sees her own photo on the
 * left of the handle and a studio-grade version of the same photo on the
 * right, and nothing was swapped for a stock image. So the handle is large,
 * obvious, and grabbable anywhere on the image rather than only on the line.
 */
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type Props = {
  beforeUri: string;
  /** Null while the enhancement is still running. */
  afterUri: string | null;
  height?: number;
};

export function BeforeAfterSlider({ beforeUri, afterUri, height = 300 }: Props) {
  const [width, setWidth] = useState(0);
  const [x, setX] = useState(0);

  // The responder reads locationX, which is relative to the view that
  // captured the touch -- so the capture has to happen on the container, not
  // on whichever child happens to be under her thumb.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) => setX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setX(e.nativeEvent.locationX),
    }),
  ).current;

  const clamped = width ? Math.max(0, Math.min(x || width / 2, width)) : 0;
  const canvasSize = Math.min(width, height);
  const canvasLeft = (width - canvasSize) / 2;

  return (
    <View>
      <View
        style={[styles.frame, { height }]}
        onLayout={(e) => {
          const next = e.nativeEvent.layout.width;
          setWidth(next);
          setX((current) => (current ? current : next / 2));
        }}
        {...pan.panHandlers}
      >
        <Image
          source={{ uri: beforeUri }}
          style={[styles.image, { width: canvasSize, height: canvasSize, left: canvasLeft }]}
          resizeMode="contain"
        />
        <View style={styles.tagLeft}>
          <Text style={styles.tagText}>Before</Text>
        </View>

        {afterUri ? (
          <>
            {/* Clipped to the handle, but the image inside keeps the full
                container width -- sizing it to the clip would squash it. */}
            <View style={[styles.clip, { width: clamped }]}> 
              <Image
                source={{ uri: afterUri }}
                style={[styles.image, { width: canvasSize, height: canvasSize, left: canvasLeft }]}
                resizeMode="contain"
              />
              <View style={styles.tagRightInner}>
                <Text style={styles.tagText}>After</Text>
              </View>
            </View>
            <View style={[styles.divider, { left: clamped - 1.5 }]} pointerEvents="none" />
            <View style={[styles.handle, { left: clamped - 26 }]} pointerEvents="none">
              <Text style={styles.handleText}>‹ ›</Text>
            </View>
          </>
        ) : (
          <View style={styles.working}>
            <ActivityIndicator color={colors.textInverse} />
            <Text style={styles.workingText}>Improving your photo…</Text>
          </View>
        )}
      </View>

      <Text style={styles.hint}>
        {afterUri
          ? 'Drag the round handle to see the difference'
          : 'This takes a few seconds'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  image: { position: 'absolute', top: 0 },
  clip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  divider: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: colors.surface },
  handle: {
    position: 'absolute',
    top: '50%',
    marginTop: -26,
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  handleText: { ...typography.bodyBold, color: colors.textInverse },
  tagLeft: {
    position: 'absolute',
    left: spacing.gap,
    bottom: spacing.gap,
    backgroundColor: 'rgba(43,33,24,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tagRightInner: {
    position: 'absolute',
    left: spacing.gap,
    top: spacing.gap,
    backgroundColor: colors.ok,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tagText: { ...typography.label, color: colors.textInverse },
  working: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(43,33,24,0.45)',
  },
  workingText: { ...typography.body, color: colors.textInverse },
  hint: { ...typography.body, color: colors.textMuted, marginTop: spacing.gap },
});
