/**
 * Profile -- and the story card that is the point of it.
 *
 * Buyers of handmade goods are buying the maker as much as the object, so the
 * card carrying her photo, village, craft, years and two lines in her own
 * voice is the thing that converts (PRD.md:4685). It is rendered on the server
 * so it can travel: attached to listings, shared into WhatsApp, embedded in an
 * ONDC catalogue.
 *
 * Every field is optional and stays blank when she has not filled it in. The
 * card never invents a village.
 */
import React, { useCallback, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import { artisansApi, isPlaceholderName, type Artisan } from '../api/artisans';
import { resolveMediaUrl } from '../api/client';
import { messageFor } from '../api/errors';
import { mediaApi } from '../api/media';
import { useAuth } from '../store/auth';
import { useVoice } from '../store/voice';
import { BigButton } from '../components/BigButton';
import { SpeakableText } from '../components/SpeakableText';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { Card, Icon } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

type Field = 'name' | 'village' | 'district' | 'primary_craft' | 'years_experience';

const FIELDS: { key: Field; label: string; hint: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Your name', hint: 'The name buyers will see' },
  { key: 'village', label: 'Village or town', hint: '' },
  { key: 'district', label: 'District or state', hint: '' },
  { key: 'primary_craft', label: 'Your craft', hint: 'For example, Mithila painting' },
  { key: 'years_experience', label: 'Years of practice', hint: '', numeric: true },
];

export function ProfileScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const { lang } = useVoice();

  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [draft, setDraft] = useState<Record<Field, string>>({
    name: '',
    village: '',
    district: '',
    primary_craft: '',
    years_experience: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyStory, setBusyStory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hydrate = useCallback((me: Artisan) => {
    setArtisan(me);
    setDraft({
      // A placeholder name is shown as an empty box on purpose: she should be
      // typing her own name here, not editing "Artisan 8200".
      name: isPlaceholderName(me.name) ? '' : me.name,
      village: me.village ?? '',
      district: me.district ?? me.state ?? '',
      primary_craft: me.primary_craft ?? '',
      years_experience: me.years_experience == null ? '' : String(me.years_experience),
    });
  }, []);

  React.useEffect(() => {
    artisansApi
      .me()
      .then(hydrate)
      .catch((e) => setError(messageFor(e)))
      .finally(() => setLoading(false));
  }, [hydrate]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const years = draft.years_experience.replace(/[^0-9]/g, '');
      const me = await artisansApi.update({
        name: draft.name.trim() || undefined,
        village: draft.village.trim() || null,
        district: draft.district.trim() || null,
        primary_craft: draft.primary_craft.trim() || null,
        years_experience: years ? Number(years) : null,
      });
      hydrate(me);
      setSaved(true);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (picked.canceled || !picked.assets?.length) return;

    setSaving(true);
    setError(null);
    try {
      const uploaded = await mediaApi.upload(picked.assets[0].uri, 'image_raw', 'face.jpg');
      hydrate(await artisansApi.update({ photo_media_id: uploaded.id }));
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setSaving(false);
    }
  };

  const onStory = async (uri: string) => {
    setBusyStory(true);
    setError(null);
    try {
      await artisansApi.story(uri, lang.code);
      hydrate(await artisansApi.me());
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusyStory(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const cardUri = resolveMediaUrl(artisan?.story_card_url);
  const photoUri = resolveMediaUrl(artisan?.photo_url);
  const story = artisan?.story_en || artisan?.story_native;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <Icon name="back" size={26} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.title}>Your profile</Text>
        </View>

        <SpeakableText
          style={styles.lede}
          speak="This card is shown to buyers with every product you list. It carries your photo, your village, your craft and your own words."
        >
          Buyers see this card with every product you list
        </SpeakableText>

        {cardUri ? (
          <Image
            source={{ uri: cardUri }}
            style={styles.card}
            resizeMode="contain"
            accessibilityLabel="Your story card"
          />
        ) : (
          <View style={[styles.card, styles.cardEmpty]}>
            <Text style={styles.cardEmptyText}>Your card will appear here</Text>
          </View>
        )}

        <View style={styles.photoRow}>
          <View style={styles.photo}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoImage} />
            ) : (
              <Icon name="user" size={30} color={colors.primary} />
            )}
          </View>
          <BigButton
            label={photoUri ? 'Change photo' : 'Add your photo'}
            variant="secondary"
            onPress={pickPhoto}
            style={styles.photoButton}
          />
        </View>

        <Text style={styles.sectionTitle}>Your words</Text>
        <Card>
          {story ? (
            <SpeakableText style={styles.story} speak={story}>
              {story}
            </SpeakableText>
          ) : (
            <Text style={styles.storyEmpty}>
              Tell buyers about your craft in your own voice. Two lines is enough.
            </Text>
          )}
          <View style={styles.recorder}>
            {busyStory ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <VoiceRecorder
                maxSeconds={45}
                label={story ? 'Record again' : 'Tell your story'}
                // The story endpoint transcribes and summarises in one pass,
                // so the raw audio goes there rather than through /transcribe.
                onTranscript={() => undefined}
                onRecorded={onStory}
              />
            )}
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Your details</Text>
        {FIELDS.map((field) => (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            {field.hint ? <Text style={styles.fieldHint}>{field.hint}</Text> : null}
            <TextInput
              style={styles.input}
              value={draft[field.key]}
              onChangeText={(t) => setDraft((d) => ({ ...d, [field.key]: t }))}
              keyboardType={field.numeric ? 'numeric' : 'default'}
              placeholder="Not given"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={field.label}
            />
          </View>
        ))}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.saved}>Saved</Text> : null}

        <BigButton label="Save" onPress={save} loading={saving} style={styles.save} />
        <BigButton
          label="Sign out"
          variant="secondary"
          onPress={signOut}
          style={styles.signOut}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title, color: colors.text },
  lede: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm },

  card: {
    width: '100%',
    aspectRatio: 1080 / 1350,
    borderRadius: radius.lg,
    marginTop: spacing.gap,
    backgroundColor: colors.surfaceAlt,
  },
  cardEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardEmptyText: { ...typography.body, color: colors.textMuted },

  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap,
    marginTop: spacing.md,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoButton: { flex: 1 },

  sectionTitle: { ...typography.heading, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  story: { ...typography.body, color: colors.text },
  storyEmpty: { ...typography.body, color: colors.textMuted },
  recorder: { alignItems: 'center', marginTop: spacing.gap },

  field: { marginTop: spacing.gap },
  fieldLabel: { ...typography.bodyBold, color: colors.text },
  fieldHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
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

  error: { ...typography.body, color: colors.error, marginTop: spacing.md },
  saved: { ...typography.body, color: colors.ok, marginTop: spacing.md },
  save: { marginTop: spacing.md },
  signOut: { marginTop: spacing.gap },
});
