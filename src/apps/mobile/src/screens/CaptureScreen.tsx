/**
 * Photograph a product, compress it, upload it.
 */
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
  useAudioRecorder } from 'expo-audio';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { messageFor } from '../api/errors';
import { BigButton } from '../components/BigButton';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation';
import { colors, radius, spacing, typography } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Capture'>;

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

const CAPTURE_RETRY_MS = 150;
const CAPTURE_DEADLINE_MS = 3000;
const NOT_READY = 'ERR_CAMERA_NOT_READY';

function mountErrorMessage(detail: string, s: ReturnType<typeof t>): string {
  const has = (...names: string[]) => names.some((n) => detail.includes(n));
  if (has('NotAllowedError', 'SecurityError', 'Permission')) return s.capture.cameraBlocked;
  if (has('NotFoundError', 'OverconstrainedError', 'DevicesNotFound')) return s.capture.cameraMissing;
  if (has('NotReadableError', 'AbortError', 'TrackStart')) return s.capture.cameraBusy;
  return s.capture.notReady;
}

export function CaptureScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Capture'>>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const s = t();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [camKey, setCamKey] = useState(0);
  const mountFailed = useRef(false);

  const restartCamera = () => {
    mountFailed.current = false;
    setReady(false);
    setError(null);
    setCamKey((k) => k + 1);
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>{s.capture.permissionTitle}</Text>
        <Text style={styles.help}>{s.capture.permissionHelp}</Text>
        <BigButton label={s.capture.grant} onPress={() => void requestPermission()} />
      </SafeAreaView>
    );
  }

  const shoot = async () => {
    setError(null);
    setBusy(true);
    const deadline = Date.now() + CAPTURE_DEADLINE_MS;
    try {
      for (;;) {
        try {
          const shot = await cameraRef.current?.takePictureAsync({ quality: 1 });
          if (shot?.uri) setPhotoUri(shot.uri);
          break;
        } catch (e) {
          if ((e as { code?: string })?.code !== NOT_READY || Date.now() >= deadline) throw e;
          await new Promise((r) => setTimeout(r, CAPTURE_RETRY_MS));
        }
      }
    } catch (e) {
      setError((e as { code?: string })?.code === NOT_READY ? s.capture.notReady : messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!photoUri) return;
    setError(null);
    setBusy(true);
    try {
      const context = ImageManipulator.manipulate(photoUri);
      context.resize({ width: MAX_EDGE });
      const rendered = await context.renderAsync();
      const compressed = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: JPEG_QUALITY,
      });

      navigation.navigate('MediaCollection', {
        initialUris: [compressed.uri],
        additionalForWizard: params?.additionalForWizard,
        audioUri: audioUri ?? undefined,
      });
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    setError(null);
    try {
      if (recording) {
        await recorder.stop();
        setAudioUri(recorder.uri ?? null);
        setRecording(false);
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone permission is required for a voice description.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (e) {
      setRecording(false);
      setError(messageFor(e));
    }
  };

  if (photoUri) {
    return (
      <SafeAreaView style={styles.safe}>
        <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BigButton
          label={recording ? 'Stop voice description' : audioUri ? 'Record again' : 'Add voice description'}
          variant="secondary"
          onPress={() => void toggleRecording()}
          disabled={busy}
        />
        <View style={styles.actions}>
          <BigButton
            label={s.capture.retake}
            variant="secondary"
            onPress={() => setPhotoUri(null)}
            disabled={busy}
          />
          <BigButton
            label={busy ? s.capture.uploading : s.capture.usePhoto}
            onPress={() => void confirm()}
            loading={busy}
          />
        </View>
      </SafeAreaView>
    );
  }

  const pickImage = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      setError(messageFor(e));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>{s.capture.title}</Text>
      <CameraView
        key={camKey}
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => {
          if (!mountFailed.current) setReady(true);
        }}
        onMountError={(event) => {
          mountFailed.current = true;
          setReady(false);
          const e = event as {
            message?: string;
            nativeEvent?: { name?: string; message?: string };
          };
          const detail = [e.nativeEvent?.name, e.nativeEvent?.message, e.message]
            .filter(Boolean)
            .join(' ');
          setError(mountErrorMessage(detail, s));
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        {mountFailed.current ? (
          <BigButton label={s.capture.tryAgain} onPress={restartCamera} />
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <BigButton
                label="Gallery"
                variant="secondary"
                onPress={() => void pickImage()}
                disabled={busy}
              />
            </View>
            <View style={{ flex: 1 }}>
              <BigButton
                label={ready ? s.capture.shutter : s.capture.starting}
                onPress={() => void shoot()}
                loading={busy}
                disabled={!ready || busy}
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  help: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  camera: { flex: 1, marginHorizontal: spacing.lg, borderRadius: radius.md, overflow: 'hidden' },
  preview: { flex: 1, margin: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  actions: { padding: spacing.lg, gap: spacing.sm },
  error: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});