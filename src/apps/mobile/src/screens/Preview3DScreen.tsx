/**
 * Photo -> rotatable 3D preview (PRD phase 12).
 *
 * Real reconstruction, not a trick: apps/api/app/services/preview3d.py sends
 * her photo to a hosted image-to-3D model (Replicate) and gets back an
 * actual mesh. This screen's only job is to start that job, poll it, and
 * hand the resulting .glb to a viewer.
 *
 * The viewer is Google's <model-viewer> web component inside a WebView, not
 * a native 3D engine (three.js/expo-gl). <model-viewer> already does
 * orbit/zoom/pan gesture handling, camera framing and lighting for a single
 * glTF/GLB -- correctly reimplementing that on top of a raw 3D engine is a
 * project by itself, for a capability one script tag already provides.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { WebView } from 'react-native-webview';

import { preview3dApi, Preview3DStatus } from '../api/preview3d';
import { messageFor } from '../api/errors';
import { BigButton } from '../components/BigButton';
import { Icon } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { colors, radius, spacing, typography } from '../theme';

type Route = RouteProp<RootStackParamList, 'Preview3D'>;

const POLL_INTERVAL_MS = 3000;
// Matches services/preview3d.py's own _POLL_TIMEOUT_SECONDS -- the app gives
// up waiting exactly when the server would have, so it never watches a spinner
// for a job the backend already abandoned.
const POLL_TIMEOUT_MS = 240_000;

const STATUS_LABEL: Record<Preview3DStatus, string> = {
  starting: 'Starting…',
  processing: 'Building the 3D model… this takes about a minute',
  succeeded: 'Done',
  failed: 'Could not build a 3D preview',
  canceled: 'Cancelled',
};

function viewerHtml(glbUrl: string): string {
  // model-viewer is loaded from jsDelivr, on the CDN allowlist WebView
  // content is restricted to; everything else here is inline, no other
  // network dependency once the script itself has loaded.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #FDF9F3; }
  model-viewer { width: 100%; height: 100%; --poster-color: transparent; }
</style>
</head>
<body>
  <model-viewer
    src="${glbUrl}"
    camera-controls
    auto-rotate
    auto-rotate-delay="600"
    rotation-per-second="18deg"
    shadow-intensity="1"
    exposure="1"
    environment-image="neutral"
  ></model-viewer>
</body>
</html>`;
}

export function Preview3DScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { mediaId, listingId } = route.params;

  const [status, setStatus] = useState<Preview3DStatus>('starting');
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    startedAt.current = Date.now();

    const run = async () => {
      let jobId: string;
      try {
        const job = await preview3dApi.start(mediaId, listingId);
        if (cancelled.current) return;
        jobId = job.job_id;
        setStatus(job.status);
      } catch (e) {
        if (!cancelled.current) setError(messageFor(e));
        return;
      }

      const poll = async () => {
        if (cancelled.current) return;
        if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
          setStatus('failed');
          setError('This is taking longer than expected. Please try again.');
          return;
        }
        try {
          const job = await preview3dApi.poll(jobId);
          if (cancelled.current) return;
          setStatus(job.status);
          if (job.status === 'succeeded' && job.glb_url) {
            setGlbUrl(job.glb_url);
            return; // done -- stop polling
          }
          if (job.status === 'failed') {
            setError(job.error ?? 'The 3D model could not be built.');
            return;
          }
          setTimeout(poll, POLL_INTERVAL_MS);
        } catch (e) {
          if (!cancelled.current) setError(messageFor(e));
        }
      };

      setTimeout(poll, POLL_INTERVAL_MS);
    };

    void run();
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, listingId]);

  const busy = status === 'starting' || status === 'processing';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Icon name="back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>3D Preview</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        {glbUrl ? (
          <WebView
            style={styles.webview}
            originWhitelist={['*']}
            source={{ html: viewerHtml(glbUrl) }}
            allowsInlineMediaPlayback
          />
        ) : error ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{error}</Text>
            <BigButton
              label="Try again"
              variant="secondary"
              onPress={() => navigation.goBack()}
              style={styles.retryButton}
            />
          </View>
        ) : (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>{STATUS_LABEL[status]}</Text>
            {busy ? (
              <Text style={styles.statusHint}>
                Real 3D reconstruction from her photo -- not a trick spin.
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: { ...typography.heading, color: colors.text },
  body: { flex: 1 },
  webview: { flex: 1, backgroundColor: colors.bg },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statusText: { ...typography.body, color: colors.text, textAlign: 'center' },
  statusHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    backgroundColor: colors.errorSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  retryButton: { marginTop: spacing.sm },
});
