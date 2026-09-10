import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { messageFor } from '../api/errors';
import { resolveMediaUrl } from '../api/client';
import { mediaApi } from '../api/media';
import { BigButton } from '../components/BigButton';
import type { RootStackParamList } from '../navigation';
import { colors, radius, spacing, typography } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MediaCollection'>;
type Route = RouteProp<RootStackParamList, 'MediaCollection'>;

const MAX_EDGE = 1600;

export function MediaCollectionScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [uris, setUris] = useState<string[]>(params?.initialUris ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimumImagesVisible, setMinimumImagesVisible] = useState(false);
  const openedGallery = useRef(false);

  useEffect(() => {
    if (params?.source !== 'gallery' || openedGallery.current) return;
    openedGallery.current = true;
    void pickFromGallery();
  }, [params?.source]);

  const pickFromGallery = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 1,
      });
      if (!result.canceled && result.assets.length) {
        setUris((current) => [...current, ...result.assets.map((asset) => asset.uri)]);
      }
    } catch (e) {
      setError(messageFor(e));
    }
  };

  const takePhoto = async () => {
    setError(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 1 });
      if (photo?.uri) setUris((current) => [...current, photo.uri]);
    } catch (e) {
      setError(messageFor(e));
    }
  };

  const continueWithImages = async () => {
    if (uris.length < 2) {
      setMinimumImagesVisible(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded = await Promise.all(uris.map(async (uri) => {
        const context = ImageManipulator.manipulate(uri);
        context.resize({ width: MAX_EDGE });
        const rendered = await context.renderAsync();
        const compressed = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
        return mediaApi.upload(compressed.uri, 'image_raw', 'product.jpg');
      }));
      const mediaUris = uploaded.map((item, index) => resolveMediaUrl(item.url) ?? uris[index]);
      const audio = params?.audioUri
        ? await mediaApi.upload(params.audioUri, 'audio', 'description.m4a')
        : null;
      if (params?.additionalForWizard) {
        navigation.navigate('CatalogWizard', {
          additionalMediaIds: uploaded.map((item) => item.id),
          additionalUris: mediaUris,
        });
      } else {
        navigation.navigate('CatalogWizard', {
          rawMediaId: uploaded[0].id,
          rawUri: mediaUris[0],
          extraMediaIds: uploaded.slice(1).map((item) => item.id),
          extraUris: mediaUris.slice(1),
          audioMediaId: audio?.id,
        });
      }
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Add product images</Text>
      <Text style={styles.hint}>Add at least 2 images from different angles.</Text>
      {permission.granted ? <CameraView ref={cameraRef} style={styles.camera} facing="back" /> : null}
      {!permission.granted ? <BigButton label="Allow camera" onPress={() => void requestPermission()} /> : null}
      <View style={styles.actions}>
        <BigButton label="Take photo" onPress={() => void takePhoto()} disabled={!permission.granted || busy} />
        <BigButton label="Choose from device" variant="secondary" onPress={() => void pickFromGallery()} disabled={busy} />
      </View>
      <Text style={styles.count}>{uris.length} image{uris.length === 1 ? '' : 's'} added</Text>
      <View style={styles.grid}>
        {uris.map((uri, index) => <Image key={`${uri}-${index}`} source={{ uri }} style={styles.thumb} />)}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <BigButton label="Continue" onPress={() => void continueWithImages()} loading={busy} disabled={busy} />
      <Modal
        visible={minimumImagesVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMinimumImagesVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add at least 2 images</Text>
            <Text style={styles.modalText}>
              Please add one more image from another angle to create the 360 degree product view.
            </Text>
            <BigButton
              label="Add another image"
              onPress={() => setMinimumImagesVisible(false)}
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  hint: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  camera: { height: 190, borderRadius: radius.md, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  count: { ...typography.bodyBold, color: colors.text, textAlign: 'center' },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignContent: 'flex-start' },
  thumb: { width: '31%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  error: { ...typography.body, color: colors.error, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  modalTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  modalText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  modalButton: { marginTop: spacing.xs },
});