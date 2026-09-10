/**
 * Phase 0 screen: prove the phone can reach the API and render live data.
 *
 * Phase 1 replaces this as the app's entry point with Onboard -> Home. It stays
 * reachable as a diagnostic, because "is the phone actually talking to the
 * server" is the first question on demo day.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { health, Readiness } from '../api/health';
import { BigButton } from '../components/BigButton';
import { StatusRow } from '../components/StatusRow';
import { t } from '../i18n';
import { colors, radius, spacing, typography } from '../theme';

type State =
  | { phase: 'loading' }
  | { phase: 'ok'; data: Readiness; at: Date }
  | { phase: 'error'; message: string };

export function HealthScreen() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const s = t();

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      setState({ phase: 'ok', data: await health.ready(), at: new Date() });
    } catch (e) {
      // A 503 from /health/ready still carries a JSON body, but the client
      // throws on non-2xx, so surface it as an error with the API's message.
      const message =
        e instanceof ApiError ? `${e.code}: ${e.message}` : String(e);
      setState({ phase: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const banner =
    state.phase === 'ok'
      ? state.data.status === 'ok'
        ? { text: s.health.connected, color: colors.ok }
        : { text: s.health.degraded, color: colors.warn }
      : state.phase === 'error'
        ? { text: s.health.offline, color: colors.error }
        : { text: s.common.loading, color: colors.textMuted };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.appName}>{s.appName}</Text>
        <Text style={styles.subtitle}>{s.health.subtitle}</Text>

        <View style={[styles.banner, { borderColor: banner.color }]}>
          <Text style={[styles.bannerText, { color: banner.color }]}>{banner.text}</Text>
        </View>

        {state.phase === 'loading' && (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        )}

        {state.phase === 'ok' && (
          <View style={styles.card}>
            <StatusRow label={s.health.database} ok={state.data.checks.db.status === 'ok'}
              detail={`${state.data.checks.db.latency_ms} ms`} />
            <StatusRow label={s.health.queue} ok={state.data.checks.redis.status === 'ok'}
              detail={`${state.data.checks.redis.latency_ms} ms`} />
            <StatusRow label={s.health.ai} ok={state.data.checks.ml.status === 'ok'}
              detail={`${state.data.checks.ml.latency_ms} ms`} />
            <Text style={styles.meta}>
              env {state.data.env}
              {state.data.offline_demo_mode ? ' · offline demo' : ''}
              {'\n'}
              {s.health.checkedAt} {state.at.toLocaleTimeString()}
            </Text>
          </View>
        )}

        {state.phase === 'error' && (
          <View style={styles.card}>
            <Text style={styles.errorText}>{state.message}</Text>
            <Text style={styles.hint}>{s.health.hint}</Text>
          </View>
        )}

        <BigButton
          label={s.common.retry}
          onPress={() => void load()}
          loading={state.phase === 'loading'}
          style={styles.button}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  appName: { ...typography.display, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  banner: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  bannerText: { ...typography.heading },
  spinner: { marginVertical: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  meta: { ...typography.mono, color: colors.textMuted, marginTop: spacing.md },
  errorText: { ...typography.body, color: colors.error },
  hint: { ...typography.label, color: colors.textMuted, marginTop: spacing.sm },
  button: { marginTop: spacing.sm },
});
