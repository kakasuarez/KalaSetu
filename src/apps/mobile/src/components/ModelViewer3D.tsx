import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface ModelViewer3DProps {
  url: string;
  autoRotate?: boolean;
  interactive?: boolean;
}

export function ModelViewer3D({
  url,
  autoRotate = true,
  interactive = true,
}: ModelViewer3DProps) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
          model-viewer { width: 100%; height: 100%; background-color: transparent; }
        </style>
      </head>
      <body>
        <model-viewer
          src="${url}"
          ${autoRotate ? 'auto-rotate' : ''}
          ${interactive ? 'camera-controls' : ''}
          touch-action="pan-y"
          shadow-intensity="1"
          alt="3D model display">
        </model-viewer>
      </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          srcDoc={htmlContent}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: 'transparent',
          }}
          title="3D Model Viewer"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
  webview: {
    backgroundColor: 'transparent',
  },
});