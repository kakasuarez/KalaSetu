/**
 * Bottom tab bar for the coordinator's three sections.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Contact, Map as MapIcon, Users } from 'lucide-react-native';

import { colors, typography } from '../theme';

const ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  SakhiProfiles: Users,
  SakhiMap: MapIcon,
  SakhiDirectory: Contact,
};

export function SakhiTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = (options.tabBarLabel as string) ?? options.title ?? route.name;
        const focused = state.index === index;
        const IconCmp = ICONS[route.name] ?? Users;

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
            <IconCmp size={26} color={focused ? colors.primary : colors.textMuted} />
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
  tab: { flex: 1, height: 72, alignItems: 'center', justifyContent: 'center', gap: 2 },
  marker: {
    position: 'absolute',
    top: 0,
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  markerActive: { backgroundColor: colors.primary },
  label: { ...typography.label, fontSize: 13, color: colors.textMuted },
  labelActive: { color: colors.primary },
});
