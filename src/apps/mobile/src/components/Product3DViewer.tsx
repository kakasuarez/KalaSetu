import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { colors, radius, spacing, typography } from '../theme';

type Props = {
  glbUrl: string;
  style?: StyleProp<ViewStyle>;
  autoRotate?: boolean;
  showBadge?: boolean;
  showHint?: boolean;
};

export function Product3DViewer({
  glbUrl,
  style,
  autoRotate = true,
  showBadge = true,
  showHint = true,
}: Props) {
  const [loading, setLoading] = useState(true);

  // Escape the GLB URL so special characters (&, ", <, >) cannot break the
  // embedded HTML or be interpreted as markup. Use unicode escapes so the
  // formatter cannot collapse them back to plain characters.
  const AMP = '\u0026';
  const QUOT = '\u0022';
  const LT = '\u003C';
  const GT = '\u003E';
  const escapedUrl = glbUrl
    .replace(/\u0026/g, AMP + 'amp;')
    .replace(/\u0022/g, QUOT + 'quot;')
    .replace(/\u003C/g, LT + 'lt;')
    .replace(/\u003E/g, GT + 'gt;');

  const htmlContent = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    model-viewer {
      width: 100%;
      height: 100%;
      --poster-color: transparent;
      background-color: transparent;
      outline: none;
    }
  </style>
</head>
<body>
  <model-viewer
    src="${escapedUrl}"
    camera-controls
    interaction-prompt="auto"
    touch-action="pan-y"
    ${autoRotate ? 'auto-rotate rotation-per-second="25deg"' : ''}
    shadow-intensity="1.2"
    shadow-softness="0.8"
    exposure="1.1"
    environment-image="neutral"
    alt="3D Product Model"
  ></model-viewer>
  <script>
    const viewer = document.querySelector('model-viewer');
    if (viewer) {
      viewer.addEventListener('load', () => {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage('LOADED');
        }
      });
    }
  </script>
</body>
</html>
  `.trim();

  return (
    <View style={[styles.container, style]}>
      {Platform.OS === 'web' ? (
        // Web rendering via iframe
        <iframe
          srcDoc={htmlContent}
          title="3D Product Viewer"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: 'transparent',
          }}
          onLoad={() => setLoading(false)}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        />
      ) : (
        // Native rendering via WebView
        <WebView
          source={{ html: htmlContent }}
          originWhitelist={['*']}
          style={styles.webview}
          containerStyle={styles.webviewContainer}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          onMessage={(event) => {
            if (event.nativeEvent.data === 'LOADED') {
              setLoading(false);
            }
          }}
          onLoadEnd={() => {
            setTimeout(() => setLoading(false), 800);
          }}
        />
      )}

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>3D मॉडल लोड हो रहा है...</Text>
          <Text style={styles.loadingSubtext}>Loading 3D model</Text>
        </View>
      )}

      {showBadge && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>360° 3D</Text>
        </View>
      )}

      {showHint && !loading && (
        <View style={styles.hintContainer} pointerEvents="none">
          <Text style={styles.hintText}>घुमाने के लिए छुएं • Drag to rotate 360°</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    position: 'relative',
  },
  webview: {
    backgroundColor: 'transparent',
    width: '100%',
    height: '100%',
  },
  webviewContainer: {
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 237, 225, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    zIndex: 2,
  },
  loadingText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  loadingSubtext: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(43, 33, 24, 0.85)',
    zIndex: 3,
  },
  badgeText: {
    ...typography.label,
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  hintContainer: {
    position: 'absolute',
    bottom: spacing.xs,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
  },
  hintText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: 'rgba(253, 249, 243, 0.88)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
});
