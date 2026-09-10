/**
 * Section 3: every artisan, with Chat and Call.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MessageCircle, Phone, PhoneOff } from 'lucide-react-native';

import { messageFor } from '../api/errors';
import { Card, EmptyState, SectionHeading } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

import { Avatar } from '../components/Avatar';
import { ManagedArtisan, sakhiApi } from '../api/sakhi';
import { t } from '../i18n/strings';
import { useAuth } from '../store/auth';
import type { AppStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function SakhiDirectoryScreen() {
  const { signOut } = useAuth();
  const nav = useNavigation<Nav>();
  const s = t();

  const [artisans, setArtisans] = useState<ManagedArtisan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setArtisans(await sakhiApi.listArtisans());
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const call = (phone: string | null) => {
    if (!phone) return;
    void Linking.openURL(`tel:${phone}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <SectionHeading
        title={s.sakhi.directoryTitle}
        action={{ label: s.home.signOut, onPress: signOut }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        contentContainerStyle={styles.list}
        data={artisans ?? []}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={
          artisans === null ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : (
            <EmptyState glyph="📇" title={s.sakhi.empty} body={s.sakhi.emptyHint} />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <Avatar name={item.name} size={44} />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.phone ?? s.sakhi.noPhone} · {item.language}
              </Text>
            </View>
            <View style={styles.actions}>
              <ActionButton
                icon={MessageCircle}
                label={s.sakhi.chat}
                onPress={() =>
                  nav.navigate('SakhiChat', { artisanId: item.id, artisanName: item.name })
                }
              />
              <ActionButton
                icon={item.phone ? Phone : PhoneOff}
                label={s.sakhi.call}
                onPress={() => call(item.phone)}
                disabled={!item.phone}
              />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

function ActionButton({
  icon: IconCmp,
  label,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        disabled && styles.actionBtnDisabled,
        pressed && !disabled && styles.actionBtnPressed,
      ]}
    >
      <IconCmp size={20} color={disabled ? colors.textMuted : colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { marginTop: spacing.xl },
  error: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    marginHorizontal: spacing.md,
  },
  list: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  info: { flex: 1 },
  name: { ...typography.bodyBold, color: colors.text },
  sub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  actionBtnDisabled: { backgroundColor: colors.surfaceAlt },
  actionBtnPressed: { opacity: 0.7 },
});
