/**
 * Section 1: a card grid of the coordinator's artisans -- name, location,
 * craft, language, and an avatar standing in for a photo.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MapPin } from 'lucide-react-native';

import { messageFor } from '../api/errors';
import { BigButton } from '../components/BigButton';
import { Card, EmptyState, SectionHeading } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

import { Avatar } from '../components/Avatar';
import { ManagedArtisan, sakhiApi } from '../api/sakhi';
import { t } from '../i18n/strings';
import { useAuth } from '../store/auth';
import type { AppStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function SakhiProfilesScreen() {
  const { signOut } = useAuth();
  const nav = useNavigation<Nav>();
  const s = t();

  const [artisans, setArtisans] = useState<ManagedArtisan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

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

  const onLoadDemo = async () => {
    setSeeding(true);
    setError(null);
    try {
      setArtisans(await sakhiApi.seedDemoArtisans());
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <SectionHeading
        title={s.sakhi.profilesTitle}
        action={{ label: s.home.signOut, onPress: signOut }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        contentContainerStyle={styles.list}
        data={artisans ?? []}
        keyExtractor={(a) => a.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          artisans === null ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : (
            <EmptyState
              glyph="🧵"
              title={s.sakhi.empty}
              body={s.sakhi.emptyHint}
              action={{ label: s.sakhi.loadDemo, onPress: onLoadDemo }}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
            onPress={() =>
              nav.navigate('SakhiChat', { artisanId: item.id, artisanName: item.name })
            }
          >
            <Card style={styles.profileCard}>
              <View style={styles.avatarRow}>
                <Avatar name={item.name} size={56} />
              </View>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              {item.village ? (
                <View style={styles.locationRow}>
                  <MapPin size={14} color={colors.textMuted} />
                  <Text style={styles.location} numberOfLines={1}>{item.village}</Text>
                </View>
              ) : null}
              {item.primary_craft ? (
                <Text style={styles.craft} numberOfLines={1}>{item.primary_craft}</Text>
              ) : null}
              <View style={styles.languageChip}>
                <Text style={styles.languageText}>{item.language}</Text>
              </View>
            </Card>
          </Pressable>
        )}
      />

      {artisans && artisans.length > 0 ? (
        <View style={styles.footer}>
          <BigButton
            label={s.sakhi.loadDemo}
            variant="secondary"
            onPress={onLoadDemo}
            loading={seeding}
          />
        </View>
      ) : null}
    </SafeAreaView>
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
  list: { padding: spacing.md, gap: spacing.md },
  row: { gap: spacing.md },
  cardPressable: { flex: 1 },
  cardPressed: { opacity: 0.7 },
  profileCard: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  avatarRow: { marginBottom: spacing.xs },
  name: { ...typography.bodyBold, color: colors.text, textAlign: 'center' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { ...typography.caption, color: colors.textMuted },
  craft: { ...typography.caption, color: colors.primary, textAlign: 'center' },
  languageChip: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.secondarySoft,
  },
  languageText: { ...typography.label, fontSize: 12, color: colors.secondary },
  footer: { padding: spacing.md, paddingTop: 0 },
});
