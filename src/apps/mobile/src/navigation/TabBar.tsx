/**
 * The bottom tab bar.
 *
 * Hand-rolled rather than styled through screenOptions because the active
 * state is three things at once -- a terracotta bar above the icon, a
 * terracotta icon, and a terracotta label. Colour alone would not survive
 * being read at arm's length in sunlight, and roughly one in twelve men
 * cannot separate the terracotta from the brown at all.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { colors, spacing, typography } from '../theme';
import { Icon, IconName } from '../components/ui';

const ICONS: Record<string, IconName> = {
  Home: 'home',
  Shop: 'shop',
  Inbox: 'inbox',
  Learn: 'learn',
};

/** Unread counts per route. Only Inbox has one, and only once it is real. */
type Props = BottomTabBarProps & { badges?: Record<string, number> };

export function TabBar({ state, descriptors, navigation, badges }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = (options.tabBarLabel as string) ?? options.title ?? route.name;
        const focused = state.index === index;
        const badge = badges?.[route.name] ?? 0;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={styles.tab}
          >
            <View style={[styles.marker, focused && styles.markerActive]} />
            <View>
              <Icon
                name={ICONS[route.name] ?? 'home'}
                size={28}
                color={focused ? colors.primary : colors.textMuted}
              />
              {badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: {
    flex: 1,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  marker: {
    position: 'absolute',
    top: 0,
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  markerActive: { backgroundColor: colors.primary },
  label: { ...typography.label, fontSize: 14, color: colors.textMuted },
  labelActive: { color: colors.primary },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...typography.label,
    fontSize: 13,
    lineHeight: 16,
    color: colors.textInverse,
  },
});
