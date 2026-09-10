/**
 * The price band she can drag.
 *
 * The three markers are the pricing engine's own low / recommended / high
 * (apps/api/app/services/pricing.py). They are deliberately NOT labelled p25,
 * p50 and p75: those percentile columns exist on the listing but nothing
 * computes them yet, and dressing a wage-fair formula up as a market
 * distribution would be a claim we cannot support.
 *
 * The floor is drawn as a hard edge rather than a suggestion, because that is
 * what it is -- below it she is paying to work.
 */
import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type Props = {
  low: number;
  recommended: number;
  high: number;
  floor: number;
  value: number;
  onChange: (next: number) => void;
};

function rupees(value: number): string {
  return '₹' + Math.round(value).toLocaleString('en-IN');
}

export function PriceBandBar({ low, recommended, high, floor, value, onChange }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const rangeRef = useRef({ low, high });
  const startX = useRef(0);
  const startValue = useRef(value);

  widthRef.current = width;
  rangeRef.current = { low, high };

  // The thumb represents the price she will publish, so keep its travel
  // exactly inside the engine's suggested low-to-high range.
  const min = Math.min(rangeRef.current.low, rangeRef.current.high);
  const max = Math.max(rangeRef.current.low, rangeRef.current.high);
  const span = Math.max(max - min, 1);

  const toX = (v: number) => ((v - min) / span) * width;
  const toValue = (x: number) => {
    const currentMin = Math.min(rangeRef.current.low, rangeRef.current.high);
    const currentMax = Math.max(rangeRef.current.low, rangeRef.current.high);
    const currentSpan = Math.max(currentMax - currentMin, 1);
    return currentMin + (Math.max(0, Math.min(x, widthRef.current)) / (widthRef.current || 1)) * currentSpan;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        startValue.current = toValue(startX.current);
        onChange(Math.round(startValue.current));
      },
      onPanResponderMove: (_, gesture) => {
        const currentWidth = widthRef.current;
        const currentMin = Math.min(rangeRef.current.low, rangeRef.current.high);
        const currentMax = Math.max(rangeRef.current.low, rangeRef.current.high);
        const currentSpan = Math.max(currentMax - currentMin, 1);
        const next = currentMin + ((startX.current + gesture.dx) / (currentWidth || 1)) * currentSpan;
        onChange(Math.round(Math.max(currentMin, Math.min(next, currentMax))));
      },
    }),
  ).current;

  const belowFloor = value < floor;

  return (
    <View>
      <View
        style={styles.track}
        onLayout={(e) => {
          const nextWidth = e.nativeEvent.layout.width;
          widthRef.current = nextWidth;
          setWidth(nextWidth);
        }}
        {...pan.panHandlers}
      >
        <View style={styles.rail} />
        {width > 0 ? (
          <>
            <View
              style={[styles.band, { left: toX(low), width: Math.max(toX(high) - toX(low), 2) }]}
            />
            <View style={[styles.floorMark, { left: toX(floor) - 1 }]} />
            <View
              style={[
                styles.thumb,
                belowFloor && styles.thumbWarn,
                { left: Math.max(0, Math.min(toX(value), width)) - 18 },
              ]}
            />
          </>
        ) : null}
      </View>

      <View style={styles.labels}>
        <Text style={styles.label}>{rupees(low)}</Text>
        <Text style={styles.labelStrong}>{rupees(recommended)}</Text>
        <Text style={styles.label}>{rupees(high)}</Text>
      </View>
      <Text style={styles.legend}>
        Lowest fair price · Suggested · Highest you could ask
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 56, justifyContent: 'center' },
  rail: { height: 16, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  band: {
    position: 'absolute',
    top: 20,
    height: 16,
    backgroundColor: '#E8CBA0',
  },
  floorMark: {
    position: 'absolute',
    top: 12,
    width: 3,
    height: 32,
    borderRadius: 2,
    backgroundColor: colors.error,
  },
  thumb: {
    position: 'absolute',
    top: 10,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  thumbWarn: { backgroundColor: colors.error },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...typography.caption, color: colors.textMuted },
  labelStrong: { ...typography.label, color: colors.text },
  legend: { ...typography.caption, fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
});
