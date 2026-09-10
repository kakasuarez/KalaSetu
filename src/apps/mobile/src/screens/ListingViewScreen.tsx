import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { messageFor } from '../api/errors';
import { ListingDetail, ListingStatus, listingsApi } from '../api/listings';
import { mediaApi } from '../api/media';
import { resolveMediaUrl } from '../api/client';
import { BigButton } from '../components/BigButton';
import { SpeakableText } from '../components/SpeakableText';
import { Card, Icon, SpeakerButton, StatusPill, statusLabel } from '../components/ui';
import { ModelViewer3D } from '../components/ModelViewer3D';
import { Product360Viewer } from '../components/Product360Viewer';
import type { AppNav, RootStackParamList } from '../navigation';
import { colors, radius, shadows, spacing, typography } from '../theme';

type Route = RouteProp<RootStackParamList, 'ListingView'>;

const EDITABLE: ListingStatus[] = ['draft', 'ready', 'paused'];

const DETAILS: { key: string; label: string }[] = [
  { key: 'material', label: 'Material' },
  { key: 'dimensions_cm', label: 'Size' },
  { key: 'weight_g', label: 'Weight' },
  { key: 'technique', label: 'How it was made' },
  { key: 'colors', label: 'Colours' },
  { key: 'piece_count', label: 'Pieces' },
  { key: 'work_hours', label: 'Hours of work' },
  { key: 'care_instructions', label: 'Care' },
];

function factText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  return String(value);
}

type CarouselItem =
  | { type: '3d'; url: string }
  | { type: '360'; urls: string[] }
  | { type: 'image'; url: string; id?: string };

export function ListingViewScreen() {
  const navigation = useNavigation<AppNav>();
  const { params } = useRoute<Route>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [generating3d, setGenerating3d] = useState(false);
  const [removing3d, setRemoving3d] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<ListingDetail | null>(null);

  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<ListingStatus>('draft');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listingsApi.get(params.listingId);
      setListing(data);
      setTitle(data.title_en || data.title_hi || '');
      setStatus(data.status);
      setPrice(data.price ? Number(data.price).toString() : '');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setLoading(false);
    }
  }, [params.listingId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const mediaItems = useMemo<CarouselItem[]>(() => {
    if (!listing) return [];
    const items: CarouselItem[] = [];

    const allUrls = [
      listing.primary_media_url,
      ...(listing.media_urls || []),
    ].filter(Boolean) as string[];

    // 1. Look for .glb file URL directly from media_urls
    const glbCandidate = allUrls.find((u) => {
      const lower = u.toLowerCase();
      return lower.includes('.glb') || lower.includes('.gltf') || lower.includes('kind=glb');
    });

    let glbUrl: string | null = null;

    if (glbCandidate) {
      glbUrl = resolveMediaUrl(glbCandidate);
    } else {
      const glbMedia = listing.media?.find((m) => m.kind === 'glb');
      if (glbMedia) {
        const rawUrl = (glbMedia as { url?: string; file_path?: string }).url || 
                       (glbMedia as { url?: string; file_path?: string }).file_path;
        if (rawUrl) {
          glbUrl = resolveMediaUrl(rawUrl);
        }
      }
    }

    // 2. Gather all standard image URLs
    const imageUrls: string[] = [];
    allUrls.forEach((u) => {
      const lower = u.toLowerCase();
      if (!lower.includes('.glb') && !lower.includes('.gltf') && !lower.includes('kind=glb')) {
        const resolved = resolveMediaUrl(u);
        if (resolved && !imageUrls.includes(resolved)) {
          imageUrls.push(resolved);
        }
      }
    });

    const is3dSpinActive = Boolean((listing.facts as Record<string, unknown> | undefined)?.has_3d_spin);

    if (glbUrl) {
      items.push({ type: '3d', url: glbUrl });
    } else if (is3dSpinActive && imageUrls.length > 0) {
      items.push({ type: '360', urls: imageUrls });
    }

    imageUrls.forEach((resolved) => {
      items.push({ type: 'image', url: resolved });
    });

    return items;
  }, [listing]);

  const activeItem = mediaItems[activeMediaIndex] || mediaItems[0];

  const prevMedia = () => {
    setActiveMediaIndex((prev) => (prev > 0 ? prev - 1 : mediaItems.length - 1));
  };

  const nextMedia = () => {
    setActiveMediaIndex((prev) => (prev < mediaItems.length - 1 ? prev + 1 : 0));
  };

  const save = async () => {
    if (!listing) return;
    setError(null);
    setSaving(true);
    try {
      await listingsApi.update(listing.id, {
        title_en: title || null,
        price: price ? `${price}.00` : null,
        status,
      });
      navigation.goBack();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setSaving(false);
    }
  };

  const primaryMedia = listing?.media?.find((m) => m.id === listing.primary_media_id);
  const isEnhanced = primaryMedia?.kind === 'image_enhanced';
  const has3DActive = mediaItems.some((i) => i.type === '3d' || i.type === '360');

  const generate3DModel = async () => {
    if (!listing?.id) return;
    setError(null);
    setGenerating3d(true);
    try {
      await mediaApi.generate3dFromListing(listing.id);
      await load();
      setActiveMediaIndex(0);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setGenerating3d(false);
    }
  };

  const remove3DModel = async () => {
    if (!listing?.id) return;
    setError(null);
    setRemoving3d(true);
    try {
      try {
        await mediaApi.remove3dFromListing(listing.id);
      } catch {
        // ignore if not present
      }
      const facts = { ...((listing.facts ?? {}) as Record<string, unknown>), has_3d_spin: false };
      await listingsApi.update(listing.id, { facts });
      await load();
      setActiveMediaIndex(0);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setRemoving3d(false);
    }
  };

  const enhancePhoto = async () => {
    if (!listing?.primary_media_id) return;
    setError(null);
    setEnhancing(true);
    try {
      const res = await mediaApi.enhance(listing.primary_media_id);
      await listingsApi.update(listing.id, { primary_media_id: res.id });
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setEnhancing(false);
    }
  };

  const undoEnhancements = async () => {
    if (!primaryMedia?.parent_id || !listing) return;
    setError(null);
    setEnhancing(true);
    try {
      await listingsApi.update(listing.id, { primary_media_id: primaryMedia.parent_id });
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setEnhancing(false);
    }
  };

  const replacePhoto = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]?.uri || !listing) return;

      setReplacing(true);
      const context = ImageManipulator.manipulate(result.assets[0].uri);
      context.resize({ width: 1600 });
      const rendered = await context.renderAsync();
      const compressed = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.7,
      });

      const uploaded = await mediaApi.upload(compressed.uri, 'image_raw', 'product.jpg');
      const enhanced = await mediaApi.enhance(uploaded.id);
      await listingsApi.update(listing.id, { primary_media_id: enhanced.id });
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setReplacing(false);
    }
  };

  const description = listing?.description_en || listing?.description_hi || '';
  const facts = (listing?.facts ?? {}) as Record<string, unknown>;

  const spoken = useMemo(() => {
    if (!listing) return '';
    const money = listing.price ? `₹${Math.round(Number(listing.price))}` : 'no price yet';
    return `${title || 'Untitled product'}. ${money}. ${description}`;
  }, [listing, title, description]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.error}>{error || 'Something went wrong.'}</Text>
        <BigButton label="Back" onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  const hasStats = listing.views_count > 0 || listing.orders_count > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.media}>
          {activeItem?.type === '3d' ? (
            <ModelViewer3D url={activeItem.url} autoRotate={true} interactive={true} />
          ) : activeItem?.type === '360' ? (
            <Product360Viewer urls={activeItem.urls} autoRotate={true} />
          ) : activeItem?.type === 'image' ? (
            <Image source={{ uri: activeItem.url }} style={styles.photo} />
          ) : (
            <View style={styles.photoEmpty}>
              <Text style={styles.photoEmptyGlyph}>🧺</Text>
            </View>
          )}

          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backButton}
          >
            <Icon name="back" size={26} strokeWidth={2.4} />
          </Pressable>

          <StatusPill status={listing.status} style={styles.statusOnPhoto} />

          {mediaItems.length > 1 ? (
            <>
              <Pressable style={styles.arrowLeft} onPress={prevMedia}>
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
              <Pressable style={styles.arrowRight} onPress={nextMedia}>
                <Text style={styles.arrowText}>›</Text>
              </Pressable>

              <View style={styles.dotsRow}>
                {mediaItems.map((item, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => setActiveMediaIndex(idx)}
                    style={[
                      styles.dotItem,
                      idx === activeMediaIndex && styles.dotItemActive,
                    ]}
                  >
                    <Text style={[styles.dotLabel, idx === activeMediaIndex && styles.dotLabelActive]}>
                      {item.type === '3d' || item.type === '360' ? '3D' : `${idx}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.photoActions}>
            {!has3DActive ? (
              <PhotoAction
                label="Create 3D"
                glyph="sparkle"
                busy={generating3d}
                onPress={() => void generate3DModel()}
              />
            ) : (
              <PhotoAction
                label="Remove 3D"
                glyph="undo"
                busy={removing3d}
                onPress={() => void remove3DModel()}
              />
            )}
            <PhotoAction
              label="Replace"
              glyph="camera"
              busy={replacing}
              onPress={() => void replacePhoto()}
            />
            {isEnhanced ? (
              <PhotoAction
                label="Undo"
                glyph="undo"
                busy={enhancing}
                onPress={() => void undoEnhancements()}
              />
            ) : (
              <PhotoAction
                label="Improve"
                glyph="sparkle"
                busy={enhancing}
                onPress={() => void enhancePhoto()}
              />
            )}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title || 'Untitled product'}</Text>
            <SpeakerButton phrase={spoken} />
          </View>

          <View style={styles.badges}>
            {listing.craft_class ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{listing.craft_class.replace(/_/g, ' ')}</Text>
              </View>
            ) : null}
            {listing.gi_tag ? (
              <View style={[styles.badge, styles.badgeGi]}>
                <Icon name="award" size={16} color={colors.text} />
                <Text style={styles.badgeText}>{listing.gi_tag}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.price}>
            {listing.price ? `₹${Math.round(Number(listing.price)).toLocaleString('en-IN')}` : 'No price yet'}
          </Text>
          {listing.dignity_floor ? (
            <Text style={styles.floor}>
              Fair-wage floor ₹
              {Math.round(Number(listing.dignity_floor)).toLocaleString('en-IN')}
            </Text>
          ) : null}

          {hasStats ? (
            <View style={styles.stats}>
              <Stat label="Seen" value={listing.views_count} />
              <Stat label="Orders" value={listing.orders_count} />
            </View>
          ) : null}

          {description ? (
            <>
              <Text style={styles.sectionHead}>Description</Text>
              <SpeakableText style={styles.description} speak={description}>
                {description}
              </SpeakableText>
            </>
          ) : null}

          <Text style={styles.sectionHead}>Details</Text>
          <Card padded={false}>
            {DETAILS.map((row, i) => {
              const value = factText(facts[row.key]);
              return (
                <View
                  key={row.key}
                  style={[styles.detailRow, i === DETAILS.length - 1 && styles.detailLast]}
                >
                  <Text style={styles.detailLabel}>{row.label}</Text>
                  <Text style={value ? styles.detailValue : styles.detailMissing}>
                    {value ?? 'Not specified'}
                  </Text>
                </View>
              );
            })}
          </Card>

          <Text style={styles.sectionHead}>Edit</Text>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Product name"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Product name"
          />

          <Text style={styles.fieldLabel}>Price (₹)</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            placeholder="No price yet"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Price in rupees"
          />

          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusRow}>
            {EDITABLE.map((value) => {
              const on = status === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setStatus(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [
                    styles.statusChip,
                    on && styles.statusChipOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.statusChipText, on && styles.statusChipTextOn]}>
                    {statusLabel(value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!EDITABLE.includes(listing.status) ? (
            <Text style={styles.statusNote}>
              This item is {statusLabel(listing.status).toLowerCase()}. Changing that
              happens on the marketplace, not here.
            </Text>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <BigButton
          label="Back"
          variant="secondary"
          onPress={() => navigation.goBack()}
          style={styles.footerBtn}
        />
        <BigButton
          label="Save changes"
          onPress={() => void save()}
          loading={saving}
          disabled={saving}
          style={styles.footerGrow}
        />
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PhotoAction({
  label,
  glyph,
  busy,
  onPress,
}: {
  label: string;
  glyph: 'camera' | 'sparkle' | 'undo' | 'package';
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.photoAction, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <>
          <Icon name={glyph} size={18} color={colors.primary} />
          <Text style={styles.photoActionText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  container: { paddingBottom: spacing.xxl },

  media: { height: 440, backgroundColor: colors.surfaceAlt, position: 'relative' },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain' as const,
    backgroundColor: colors.surfaceAlt,
  },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoEmptyGlyph: { fontSize: 64 },

  arrowLeft: {
    position: 'absolute',
    left: 12,
    top: '46%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrowRight: {
    position: 'absolute',
    right: 12,
    top: '46%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrowText: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginTop: -4 },

  dotsRow: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    gap: 6,
    zIndex: 10,
  },
  dotItem: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dotItemActive: {
    backgroundColor: colors.primary,
  },
  dotLabel: {
    ...typography.caption,
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dotLabelActive: {
    color: colors.textInverse,
  },

  backButton: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(253,249,243,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadows.soft,
  },
  statusOnPhoto: { position: 'absolute', top: 26, right: 14, zIndex: 10 },
  photoActions: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    gap: spacing.sm,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  photoAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(253,249,243,0.94)',
    ...shadows.soft,
  },
  photoActionText: { ...typography.label, color: colors.primary },

  body: { padding: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { ...typography.title, color: colors.text, flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  badgeGi: { backgroundColor: colors.accentSoft },
  badgeText: { ...typography.label, color: colors.text },
  price: { ...typography.money, color: colors.primary, marginTop: spacing.gap },
  floor: { ...typography.caption, color: colors.textMuted },

  stats: { flexDirection: 'row', gap: spacing.gap, marginTop: spacing.gap },
  stat: {
    flex: 1,
    padding: spacing.gap,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  statValue: { ...typography.heading, color: colors.text },
  statLabel: { ...typography.caption, color: colors.textMuted },

  sectionHead: { ...typography.heading, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  description: { ...typography.body, color: colors.text },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.gap,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLast: { borderBottomWidth: 0 },
  detailLabel: { ...typography.body, color: colors.textMuted },
  detailValue: { ...typography.bodyBold, color: colors.text, flexShrink: 1, textAlign: 'right' },
  detailMissing: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
    flexShrink: 1,
    textAlign: 'right',
  },

  fieldLabel: { ...typography.bodyBold, color: colors.text, marginTop: spacing.gap },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 56,
    marginTop: spacing.sm,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  statusChip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  statusChipText: { ...typography.label, color: colors.text },
  statusChipTextOn: { color: colors.textInverse },
  statusNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  pressed: { opacity: 0.8 },

  error: { ...typography.body, color: colors.error, marginTop: spacing.md },
  footer: {
    flexDirection: 'row',
    gap: spacing.gap,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerBtn: { flex: 1 },
  footerGrow: { flex: 2 },
});