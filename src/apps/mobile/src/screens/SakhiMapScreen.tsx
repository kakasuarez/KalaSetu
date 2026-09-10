/**
 * Section 2: where her artisans are, on one map of India.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '../api/errors';
import { SectionHeading } from '../components/ui';
import { colors, spacing, typography } from '../theme';

import { IndiaMap } from '../components/IndiaMap';
import { ManagedArtisan, sakhiApi } from '../api/sakhi';
import { t } from '../i18n/strings';
import { useAuth } from '../store/auth';

export function SakhiMapScreen() {
  const { signOut } = useAuth();
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

  return (
    <SafeAreaView style={styles.safe}>
      <SectionHeading
        title={s.sakhi.mapTitle}
        action={{ label: s.home.signOut, onPress: signOut }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.content}>
        {artisans === null ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : artisans.length === 0 ? (
          <Text style={styles.empty}>{s.sakhi.mapEmpty}</Text>
        ) : (
          <>
            <Text style={styles.count}>{s.sakhi.mapCount(artisans.length)}</Text>
            <IndiaMap
              points={artisans.map((a) => ({
                id: a.id,
                name: a.name,
                village: a.village,
                lat: a.lat,
                lon: a.lon,
              }))}
            />
          </>
        )}
      </ScrollView>
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
  content: { padding: spacing.md },
  count: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
