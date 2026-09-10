/**
 * The floating circular action -- voice on Home, "+" on the Shop.
 *
 * `pulse` draws the soft expanding ring behind the voice button. It is the
 * only thing on Home that moves, which is the point: it has to read as "talk
 * to me" to someone who is never going to read the label beside it.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../../theme';
import { Icon, IconName } from './Icon';

type Props = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Shown as a dark pill to the left of the button. */
  label?: string;
  size?: number;
  pulse?: boolean;
  /** Distance from the bottom of the screen -- must clear the 76dp tab bar. */
  bottom?: number;
};

export function Fab({
  icon,
  onPress,
  accessibilityLabel,
  label,
  size = 64,
  pulse = false,
  bottom = 100,
}: Props) {
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, ring]);

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      {label ? (
        <View style={styles.label}>
          <Text style={styles.labelText}>{label}</Text>
        </View>
      ) : null}
      <View>
        {pulse ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                opacity: ring.interpolate({
                  inputRange: [0, 0.7, 1],
                  outputRange: [0.55, 0, 0],
                }),
                transform: [
                  {
                    scale: ring.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.55],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => [
            styles.button,
            { width: size, height: size, borderRadius: size / 2 },
            pressed && styles.pressed,
          ]}
        >
          <Icon name={icon} size={size * 0.47} color={colors.textInverse} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ring: { position: 'absolute', backgroundColor: colors.primary },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    ...shadows.lifted,
  },
  pressed: { transform: [{ scale: 0.94 }] },
  label: {
    backgroundColor: colors.text,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  labelText: { ...typography.label, color: colors.textInverse },
});
