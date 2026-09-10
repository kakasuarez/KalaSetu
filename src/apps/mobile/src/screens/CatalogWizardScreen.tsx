/**
 * The seven-step add-product wizard.
 *
 *   photo -> enhance -> craft -> describe -> check -> price -> publish
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import {
  catalogApi,
  type Craft,
  type FollowUpQuestion,
  type GenerateResult,
  type ProductFacts,
} from '../api/catalog';
import { resolveMediaUrl } from '../api/client';
import { messageFor } from '../api/errors';
import { listingsApi } from '../api/listings';
import { mediaApi, type Backdrop } from '../api/media';
import { pricingApi, type PricingSuggestion } from '../api/pricing';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider';
import { BigButton } from '../components/BigButton';
import { PriceBandBar } from '../components/PriceBandBar';
import { QuestionCard, type AnswerValue } from '../components/QuestionCard';
import { SpeakableText, stopSpeaking } from '../components/SpeakableText';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { Card, Icon, SpeakerButton } from '../components/ui';
import { useVoice } from '../store/voice';
import type { AppNav, RootStackParamList } from '../navigation';
import { colors, radius, shadows, spacing, typography } from '../theme';

type Route = RouteProp<RootStackParamList, 'CatalogWizard'>;

const STEPS = ['photo', 'photos', 'enhance', 'craft', 'describe', 'additional', 'check', 'price', 'publish'] as const;
type Step = (typeof STEPS)[number];

const TITLES: Record<Step, string> = {
  photo: 'Take a photo',
  photos: 'Add another photo',
  enhance: 'Improve the photo',
  craft: 'Choose your craft',
  describe: 'Tell us about it',
  additional: 'Add more details',
  check: 'Check your listing',
  price: 'Set the price',
  publish: 'Review and publish',
};

const GUIDES: Record<Step, string> = {
  photo: 'Take a photo of your product, or choose one from your phone.',
  photos: 'Add a second photo of your product so buyers can see it from another angle.',
  enhance: 'Here is your photo before and after. Drag the round handle to see the difference.',
  craft: 'Choose the kind of craft you have made. Tap one of the pictures on the screen.',
  describe:
    'Tap the microphone and tell us about your product in your own words. Then answer what you know. If you are not sure about something, just leave it empty.',
  additional: 'Do you want to add any other details about your product? Tap the microphone and tell us.',
  check: 'This is the listing we wrote from what you told us. Check it before setting a price.',
  price: 'This is a fair price for your work. You can drag it up or down.',
  publish: 'This is how buyers will see it. Choose where to publish, then tap Publish.',
};

const CHANNELS = ['ONDC', 'GeM', 'Amazon CSV', 'WhatsApp catalog'] as const;

/** Studio grounds the ML service can composite onto. */
const BACKDROPS: { value: Backdrop; label: string; swatch: string }[] = [
  { value: 'white', label: 'White', swatch: '#FFFFFF' },
  { value: 'warm', label: 'Warm', swatch: '#F5EDE1' },
  { value: 'sage', label: 'Sage', swatch: '#DFE8DE' },
  { value: 'charcoal', label: 'Dark', swatch: '#2B2118' },
];

/** Fields stored as lists on ProductFacts. A chip answer must be wrapped. */
const LIST_FIELDS = new Set(['colors', 'customizations']);

function factsFromAnswers(
  answers: Record<string, AnswerValue>,
  productType: string | null,
): ProductFacts {
  const facts: Record<string, unknown> = {};
  if (productType) facts.product_type = productType;

  for (const [field, value] of Object.entries(answers)) {
    if (value === null || value === '' || (Array.isArray(value) && !value.length)) {
      continue;
    }
    if (LIST_FIELDS.has(field)) {
      facts[field] = Array.isArray(value) ? value : [String(value)];
    } else if (Array.isArray(value)) {
      facts[field] = value.join(', ');
    } else {
      facts[field] = value;
    }
  }
  return facts as ProductFacts;
}

function rupees(value: number | string | null): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function requestedTitle(instruction: string): string | null {
  const match = instruction.match(
    /(?:change|update|set)\s+(?:the\s+)?title\s+(?:to|as)\s+(.+)/i,
  );
  if (!match) return null;
  const title = match[1].trim().replace(/[.!?]+$/, '').trim();
  return title || null;
}

export function CatalogWizardScreen() {
  const navigation = useNavigation<AppNav>();
  const { params } = useRoute<Route>();
  const { lang } = useVoice();

  const [step, setStep] = useState<Step>(params?.rawMediaId ? 'photos' : 'photo');

  const [rawMediaId, setRawMediaId] = useState<string | null>(params?.rawMediaId ?? null);
  const [rawUri, setRawUri] = useState<string | null>(params?.rawUri ?? null);
  const [extraMediaIds, setExtraMediaIds] = useState<string[]>(params?.extraMediaIds ?? []);
  const [extraUris, setExtraUris] = useState<string[]>(params?.extraUris ?? []);
  const [enhancedMediaId, setEnhancedMediaId] = useState<string | null>(null);
  const [enhancedUri, setEnhancedUri] = useState<string | null>(null);
  const [enhancedExtraMediaIds, setEnhancedExtraMediaIds] = useState<string[]>([]);
  const [enhancedExtraUris, setEnhancedExtraUris] = useState<string[]>([]);
  const [backdrop, setBackdrop] = useState<Backdrop>('white');

  const [crafts, setCrafts] = useState<Craft[]>([]);
  const [craftId, setCraftId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [transcript, setTranscript] = useState<string>('');
  const [additionalDetails, setAdditionalDetails] = useState<string>('');
  const [followUps, setFollowUps] = useState<FollowUpQuestion[]>([]);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [suggestion, setSuggestion] = useState<PricingSuggestion | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [channels, setChannels] = useState<Record<string, boolean>>({ ONDC: true });

  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [imageRequirementVisible, setImageRequirementVisible] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const craft = useMemo(() => crafts.find((c) => c.id === craftId) ?? null, [crafts, craftId]);

  useEffect(() => {
    if (params?.additionalMediaIds?.some((id) => !extraMediaIds.includes(id))) {
      setExtraMediaIds((current) => [...current, ...params.additionalMediaIds!.filter((id) => !current.includes(id))]);
      setExtraUris((current) => [...current, ...(params.additionalUris ?? [])]);
      setStep('photos');
    }
    if (params?.additionalMediaId && !extraMediaIds.includes(params.additionalMediaId)) {
      setExtraMediaIds((current) => [...current, params.additionalMediaId!]);
      if (params.additionalUri) {
        setExtraUris((current) => [...current, params.additionalUri!]);
      }
      setStep('photos');
    }
  }, [params?.additionalMediaId, params?.additionalUri, params?.additionalMediaIds, params?.additionalUris, extraMediaIds]);

  useEffect(() => {
    catalogApi.crafts().then(setCrafts).catch((e) => setError(messageFor(e)));
  }, []);

  useEffect(() => stopSpeaking, []);

  useEffect(() => {
    if (params?.rawMediaId && params.rawMediaId !== rawMediaId) {
      setRawMediaId(params.rawMediaId);
      setRawUri(params.rawUri ?? null);
      setEnhancedMediaId(null);
      setEnhancedUri(null);
      setEnhancedExtraMediaIds([]);
      setEnhancedExtraUris([]);
      setStep('photos');
    }
  }, [params?.rawMediaId, params?.rawUri, rawMediaId]);

  const go = (next: Step) => {
    stopSpeaking();
    setError(null);
    setStep(next);
  };

  const back = () => {
    if (stepIndex === 0) {
      navigation.goBack();
      return;
    }
    go(STEPS[stepIndex - 1]);
  };

  const facts = useMemo(
    () => factsFromAnswers(answers, craft?.product_type ?? null),
    [answers, craft],
  );

  const enhance = useCallback(async (ground: Backdrop = backdrop) => {
    if (!rawMediaId || enhancing) return;
    setEnhancing(true);
    setError(null);
    try {
      const sourceIds = [rawMediaId, ...extraMediaIds];
      const enhanced = await Promise.all(sourceIds.map((id) => mediaApi.enhance(id, ground)));
      setEnhancedMediaId(enhanced[0].id);
      setEnhancedUri(resolveMediaUrl(enhanced[0].url) ?? enhanced[0].url);
      setEnhancedExtraMediaIds(enhanced.slice(1).map((item) => item.id));
      setEnhancedExtraUris(enhanced.slice(1).map((item) => resolveMediaUrl(item.url) ?? item.url));
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setEnhancing(false);
    }
  }, [rawMediaId, extraMediaIds, enhancing, backdrop]);

  useEffect(() => {
    if (step === 'enhance' && !enhancedMediaId && !enhancing) void enhance();
  }, [step, enhancedMediaId, enhancing, enhance]);

  const generate = useCallback(async (spokenInstruction?: string) => {
    setBusy(true);
    setError(null);
    try {
      const allSpokenDetails = spokenInstruction ?? [transcript, additionalDetails]
        .filter(Boolean)
        .join('. ');
      let merged = facts;
      if (allSpokenDetails.trim()) {
        const extracted = await catalogApi.extractFacts({
          transcript: allSpokenDetails,
          lang: lang.code,
          craft_id: craftId,
          existing_facts: facts,
        });
        merged = extracted.facts;
        setFollowUps(extracted.follow_ups);
      }
      const generated = await catalogApi.generate({
        facts: merged,
        craft_id: craftId,
        craft_class: craftId,
        artisan_words: allSpokenDetails || null,
        title_override: requestedTitle(allSpokenDetails),
        tone: 'marketplace',
      });
      setResult(generated);
      go('check');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }, [facts, transcript, additionalDetails, lang.code, craftId]);

  const suggestPrice = useCallback(async () => {
    if (!rawMediaId) return;
    setBusy(true);
    setError(null);
    try {
      const suggested = await pricingApi.suggest({
        image_media_id: enhancedMediaId ?? rawMediaId,
        audio_media_id: params?.audioMediaId,
        transcript: [transcript, additionalDetails].filter(Boolean).join('. ') || undefined,
        facts,
        language: lang.code,
      });
      setSuggestion(suggested);
      setPrice(Math.round(Number(suggested.recommended)));
      go('price');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }, [rawMediaId, enhancedMediaId, params?.audioMediaId, transcript, additionalDetails, facts, lang.code]);

  const publish = useCallback(async () => {
    if (!result) return;
    const mediaId = enhancedMediaId ?? rawMediaId;
    setBusy(true);
    setError(null);
    try {
      const l = result.listing;
      await listingsApi.create({
        title_en: l.title_en,
        title_hi: l.title_hi,
        description_en: l.description_en,
        description_hi: l.description_hi,
        seo_keywords: l.seo_keywords,
        facts: facts as Record<string, unknown>,
        craft_class: craftId,
        price: price ? `${price}.00` : null,
        primary_media_id: mediaId,
        media_ids: [mediaId, ...(enhancedMediaId ? enhancedExtraMediaIds : extraMediaIds)].filter(
          (id): id is string => Boolean(id),
        ),
        status: 'ready',
      });
      setPublished(true);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }, [result, enhancedMediaId, enhancedExtraMediaIds, rawMediaId, extraMediaIds, facts, craftId, price]);

  const renderPhoto = () => (
    <View style={styles.tiles}>
      <Tile
        glyph="📷"
        title="Camera"
        subtitle="Take a photo now"
        onPress={() => navigation.navigate('Capture')}
      />
      <Tile
        glyph="🎥"
        title="Video"
        subtitle="List many items at once"
        disabled
        badge="Coming soon"
        onPress={() => undefined}
      />
      <Tile
        glyph="🖼"
        title="Gallery"
        subtitle="Pick from your phone"
        onPress={() => navigation.navigate('MediaCollection', { source: 'gallery' })}
      />
      <Text style={styles.hint}>One clear photo in daylight works best.</Text>
    </View>
  );

  const renderPhotos = () => (
    <View style={styles.additionalSection}>
      <View style={styles.photoRequirement}>
        <Text style={styles.photoRequirementTitle}>Add one more photo</Text>
        <Text style={styles.hint}>
          Two photos let buyers view your product from different angles.
        </Text>
      </View>
      <View style={styles.photoRow}>
        {[rawUri, ...extraUris].filter(Boolean).map((uri, index) => (
          <Image key={`${uri}-${index}`} source={{ uri: uri! }} style={styles.photoThumb} resizeMode="contain" />
        ))}
      </View>
      <BigButton
        label="Add more images"
        onPress={() => navigation.navigate('MediaCollection', { source: 'gallery', additionalForWizard: true })}
        loading={busy}
        disabled={busy}
      />
      <BigButton
        label="Take another photo"
        variant="secondary"
        onPress={() => navigation.navigate('Capture', { additionalForWizard: true })}
        disabled={busy}
      />
    </View>
  );

  const renderEnhance = () => {
    if (!rawUri) return <Text style={styles.error}>Take a photo first.</Text>;
    return (
      <View style={styles.section}>
        <BeforeAfterSlider beforeUri={rawUri} afterUri={enhancedUri} />

        <Text style={styles.sectionHead}>Backdrop</Text>
        <View style={styles.swatches}>
          {BACKDROPS.map((option) => {
            const on = option.value === backdrop;
            return (
              <Pressable
                key={option.value}
                disabled={enhancing}
                onPress={() => {
                  setBackdrop(option.value);
                  setEnhancedUri(null);
                  setEnhancedMediaId(null);
                  setEnhancedExtraMediaIds([]);
                  setEnhancedExtraUris([]);
                  void enhance(option.value);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${option.label} backdrop`}
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.swatch,
                  on && styles.swatchOn,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.swatchDot, { backgroundColor: option.swatch }]} />
                <Text style={styles.swatchLabel}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {!enhancedUri && !enhancing ? (
          <BigButton label="Try again" variant="secondary" onPress={() => void enhance()} />
        ) : null}
      </View>
    );
  };

  const renderCraft = () => (
    <View style={styles.grid}>
      {crafts.map((c) => {
        const on = c.id === craftId;
        return (
          <Pressable
            key={c.id}
            onPress={() => setCraftId(on ? null : c.id)}
            accessibilityRole="button"
            accessibilityLabel={c.label}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && styles.pressed]}
          >
            <Text style={styles.tileIcon}>{c.icon}</Text>
            <Text style={[styles.tileLabel, on && styles.tileLabelOn]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderDescribe = () => (
    <View style={styles.section}>
      <Text style={styles.hint}>
        Speak in any language — Hindi, English, or your own. We will write the
        listing in English.
      </Text>

      <View style={styles.recorder}>
        <VoiceRecorder
          maxSeconds={60}
          label={transcript ? 'Record again' : 'Tap and speak'}
          onTranscript={setTranscript}
        />
      </View>

      {transcript ? (
        <Card>
          <Text style={styles.quoteHead}>You said</Text>
          <Text style={styles.quoteBody}>{transcript}</Text>
        </Card>
      ) : null}

      {craft ? (
        <>
          <Text style={styles.sectionHead}>
            {craft.questions.length} questions about your {craft.label.toLowerCase()}
          </Text>
          {craft.questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              required={craft.required.includes(q.field)}
              value={answers[q.field] ?? null}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [q.field]: v }))}
            />
          ))}
        </>
      ) : null}
    </View>
  );

  const renderAdditional = () => (
    <View style={styles.additionalSection}>
      <View style={styles.additionalPrompt}>
        <View style={styles.additionalIcon}>
          <Icon name="mic" size={28} color={colors.textInverse} />
        </View>
        <Text style={styles.additionalTitle}>Any additional details?</Text>
        <Text style={styles.additionalHint}>
          You can mention anything else buyers should know about your product.
        </Text>
      </View>
      <VoiceRecorder
        maxSeconds={60}
        label={additionalDetails ? 'Record again' : 'Tap to speak'}
        showPauseDone
        onTranscript={setAdditionalDetails}
      />
      {additionalDetails ? (
        <Card style={styles.additionalTranscript}>
          <Text style={styles.quoteHead}>You said</Text>
          <Text style={styles.quoteBody}>{additionalDetails}</Text>
        </Card>
      ) : null}
    </View>
  );

  const renderCheck = () => {
    if (!result) return null;
    const l = result.listing;
    const photo = enhancedUri ?? rawUri;
    return (
      <View style={styles.section}>
        <View style={styles.preview}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.previewImage} resizeMode="contain" />
          ) : null}
          <View style={styles.previewBody}>
            <SpeakableText style={styles.previewTitle} speak={l.title_en}>
              {l.title_en}
            </SpeakableText>
            <SpeakableText style={styles.previewText} speak={l.description_en}>
              {l.description_en}
            </SpeakableText>
            {l.bullet_points_en.map((b) => (
              <Text key={b} style={styles.bullet}>
                • {b}
              </Text>
            ))}
          </View>
        </View>

        <Card style={styles.voiceEditCard}>
          <View style={styles.voiceEditHeading}>
            <View style={styles.voiceEditIcon}>
              <Icon name="mic" size={22} color={colors.textInverse} />
            </View>
            <View style={styles.voiceEditCopy}>
              <Text style={styles.voiceEditTitle}>Edit with your voice</Text>
              <Text style={styles.muted}>
                Tell us what to change in this listing.
              </Text>
            </View>
          </View>
          <VoiceRecorder
            maxSeconds={60}
            label="Tap to edit by voice"
            disabled={busy}
            onTranscript={(instruction) => void generate(instruction)}
          />
          {busy ? <Text style={styles.voiceEditWorking}>Updating your listing…</Text> : null}
        </Card>

        {result.violations.length ? (
          <Card style={styles.warnCard}>
            <Text style={styles.warnTitle}>Please check these</Text>
            {result.violations.map((v) => (
              <Text key={v.claim} style={styles.warnText}>
                “{v.claim}” — {v.reason}
              </Text>
            ))}
          </Card>
        ) : null}

        <Text style={styles.sectionHead}>Not specified</Text>
        <Text style={styles.muted}>
          {l.unspecified_fields.length
            ? l.unspecified_fields.map((f) => f.replace(/_/g, ' ')).join(', ')
            : 'Nothing — you answered everything.'}
        </Text>

        {followUps.length ? (
          <Text style={styles.muted}>
            You can go back and answer {followUps.length} more question
            {followUps.length > 1 ? 's' : ''} for a fuller listing.
          </Text>
        ) : null}
      </View>
    );
  };

  const renderPrice = () => {
    if (!suggestion || price === null) {
      return <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />;
    }
    const floor = Number(suggestion.dignity_floor);
    const belowFloor = price < floor;

    return (
      <View style={styles.section}>
        {belowFloor ? (
          <View style={styles.floorCard}>
            <View style={styles.floorHead}>
              <View style={styles.floorGlyph}>
                <Icon name="warning" size={26} color={colors.error} />
              </View>
              <SpeakableText
                style={styles.floorTitle}
                speak={`This price is below your labour. Counting materials and your time you should earn at least ${rupees(floor)}. Selling at ${rupees(price)} would be a loss.`}
                autoSpeak
                hideButton
              >
                This price is below your labour
              </SpeakableText>
            </View>
            <Text style={styles.floorBody}>
              Counting materials and your time, you should earn at least{' '}
              <Text style={styles.floorAmount}>{rupees(floor)}</Text>. Selling at{' '}
              {rupees(price)} would be a loss.
            </Text>
            <View style={styles.advice}>
              <Text style={styles.adviceText}>🏅 Add your GI tag — prices rise about 20%</Text>
              <Text style={styles.adviceText}>🧺 Sell as a set instead of one piece</Text>
              <Text style={styles.adviceText}>🏢 Talk to wholesale (B2B) buyers</Text>
            </View>
            <BigButton
              label={`Set the price to ${rupees(suggestion.recommended)}`}
              onPress={() => setPrice(Math.round(Number(suggestion.recommended)))}
              style={styles.floorReset}
            />
          </View>
        ) : (
          <View style={styles.priceHead}>
            <View>
              <Text style={styles.muted}>Suggested price</Text>
              <Text style={styles.priceBig}>{rupees(price)}</Text>
            </View>
            <SpeakerButton
              phrase={`A fair price for this is ${rupees(price)}. The lowest fair price is ${rupees(suggestion.low)} and the highest is ${rupees(suggestion.high)}.`}
            />
          </View>
        )}

        <PriceBandBar
          low={Number(suggestion.low)}
          recommended={Number(suggestion.recommended)}
          high={Number(suggestion.high)}
          floor={floor}
          value={price}
          onChange={(next) => setPrice(Math.round(next))}
        />

        <View style={styles.reasons}>
          {suggestion.reasons.map((reason) => (
            <View
              key={reason.factor}
              style={[
                styles.reason,
                reason.impact === 'raises' ? styles.reasonUp : styles.reasonDown,
              ]}
            >
              <Text
                style={[
                  styles.reasonText,
                  reason.impact === 'raises' ? styles.reasonTextUp : styles.reasonTextDown,
                ]}
              >
                {reason.impact === 'raises' ? '↑' : '↓'} {reason.message}
              </Text>
            </View>
          ))}
        </View>

        {suggestion.missing_facts.length ? (
          <Text style={styles.muted}>
            Tell us your work hours and material cost for a sharper price.
          </Text>
        ) : null}
      </View>
    );
  };

  const renderPublish = () => {
    if (!result) return null;
    const l = result.listing;
    const photo = enhancedUri ?? rawUri;
    return (
      <View style={styles.section}>
        <View style={styles.preview}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.previewImage} resizeMode="contain" />
          ) : null}
          <View style={styles.previewBody}>
            <Text style={styles.previewTitle}>{l.title_en}</Text>
            <Text style={styles.muted} numberOfLines={2}>
              {l.description_en}
            </Text>
            <Text style={styles.previewPrice}>{price ? rupees(price) : 'No price set'}</Text>
          </View>
        </View>

        <Text style={styles.sectionHead}>Where to publish</Text>
        <Card padded={false}>
          {CHANNELS.map((channel) => (
            <View key={channel} style={styles.channelRow}>
              <Text style={styles.channelName}>{channel}</Text>
              <Switch
                value={!!channels[channel]}
                onValueChange={(v) => setChannels((prev) => ({ ...prev, [channel]: v }))}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.surface}
              />
            </View>
          ))}
        </Card>
        <Text style={styles.muted}>
          Your item is saved to your shop now. Sending it to these marketplaces
          is coming soon.
        </Text>
      </View>
    );
  };

  const BODIES: Record<Step, () => React.ReactNode> = {
    photo: renderPhoto,
    photos: renderPhotos,
    enhance: renderEnhance,
    craft: renderCraft,
    describe: renderDescribe,
    additional: renderAdditional,
    check: renderCheck,
    price: renderPrice,
    publish: renderPublish,
  };

  const actions: Record<Step, { label: string; onPress: () => void; disabled?: boolean }> = {
    photo: { label: 'Continue', onPress: () => go('photos'), disabled: !rawMediaId },
    photos: {
      label: 'Continue',
      onPress: () => {
        if (rawMediaId && extraMediaIds.length < 1) setImageRequirementVisible(true);
        else go('enhance');
      },
    },
    enhance: { label: 'Continue', onPress: () => go('craft'), disabled: enhancing },
    craft: { label: 'Continue', onPress: () => go('describe'), disabled: !craftId },
    describe: { label: 'Continue', onPress: () => go('additional') },
    additional: { label: 'Write my listing', onPress: () => void generate() },
    check: { label: 'Looks right', onPress: () => void suggestPrice() },
    price: { label: 'Keep this price', onPress: () => go('publish') },
    publish: { label: 'Publish', onPress: () => void publish() },
  };
  const action = actions[step];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={back}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <Icon name="back" size={26} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.stepCount}>
              Step {stepIndex + 1} of {STEPS.length}
            </Text>
            <Text style={styles.stepTitle} numberOfLines={1}>
              {TITLES[step]}
            </Text>
          </View>
          <SpeakerButton phrase={GUIDES[step]} size={48} />
        </View>
        <View style={styles.bars}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[
                styles.bar,
                i < stepIndex && styles.barDone,
                i === stepIndex && styles.barActive,
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <SpeakableText style={styles.guide} speak={GUIDES[step]} autoSpeak hideButton>
          {GUIDES[step]}
        </SpeakableText>

        {BODIES[step]()}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <BigButton
          label="Back"
          variant="secondary"
          onPress={back}
          disabled={busy}
          style={styles.footerBtn}
        />
        <BigButton
          label={busy ? 'Working…' : action.label}
          onPress={action.onPress}
          loading={busy}
          disabled={busy || action.disabled}
          style={styles.footerGrow}
        />
      </View>

      <Modal
        visible={published}
        transparent
        animationType="fade"
        onRequestClose={() => setPublished(false)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successCircle}>
              <Icon name="check" size={52} color={colors.textInverse} strokeWidth={3} />
            </View>
            <Text style={styles.successTitle}>Your item is live in the market!</Text>
            <Text style={styles.successText}>Published to ONDC and WhatsApp.</Text>
            <BigButton
              label="See my shop"
              onPress={() => {
                setPublished(false);
                navigation.navigate('Tabs', { screen: 'Shop' });
              }}
              style={styles.successButton}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={imageRequirementVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageRequirementVisible(false)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.requirementCard}>
            <Text style={styles.requirementTitle}>Add at least 2 photos</Text>
            <Text style={styles.requirementText}>
              Please add one more photo from another angle so buyers can inspect your product clearly.
            </Text>
            <BigButton
              label="Add more images"
              onPress={() => setImageRequirementVisible(false)}
              style={styles.successButton}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Tile({
  glyph,
  title,
  subtitle,
  onPress,
  disabled = false,
  badge,
}: {
  glyph: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.bigTile,
        disabled && styles.bigTileOff,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.bigTileGlyph}>
        <Text style={styles.bigTileGlyphText}>{glyph}</Text>
      </View>
      <View style={styles.bigTileText}>
        <Text style={styles.bigTileTitle}>{title}</Text>
        <Text style={styles.bigTileSubtitle}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: spacing.gap,
    paddingTop: spacing.sm,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  stepCount: { ...typography.caption, color: colors.textMuted },
  stepTitle: { ...typography.heading, color: colors.text },
  bars: { flexDirection: 'row', gap: 5, marginTop: 10 },
  bar: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border },
  barDone: { backgroundColor: colors.ok },
  barActive: { backgroundColor: colors.primary },

  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  guide: { ...typography.body, color: colors.textMuted },
  section: { gap: spacing.md },
  hint: { ...typography.body, color: colors.textMuted },
  muted: { ...typography.body, color: colors.textMuted },
  sectionHead: { ...typography.heading, color: colors.text, marginTop: spacing.sm },
  spinner: { marginTop: spacing.xl },

  tiles: { gap: spacing.gap },
  bigTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 120,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bigTileOff: { opacity: 0.55 },
  bigTileGlyph: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigTileGlyphText: { fontSize: 34 },
  bigTileText: { flex: 1 },
  bigTileTitle: { ...typography.heading, color: colors.text },
  bigTileSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  badge: {
    backgroundColor: colors.warnSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { ...typography.label, fontSize: 13, color: colors.warnText },

  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.gap,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  swatchOn: { borderColor: colors.primary },
  swatchDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchLabel: { ...typography.label, color: colors.text },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap },
  tile: {
    width: '31%',
    aspectRatio: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileIcon: { fontSize: 32 },
  tileLabel: { ...typography.label, color: colors.text, textAlign: 'center' },
  tileLabelOn: { color: colors.primary },
  pressed: { opacity: 0.8 },

  recorder: { alignItems: 'center', paddingVertical: spacing.md },
  quoteHead: { ...typography.caption, color: colors.textMuted },
  quoteBody: { ...typography.body, color: colors.text, marginTop: spacing.xs },
  additionalSection: { gap: spacing.md },
  additionalPrompt: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  additionalIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  additionalTitle: { ...typography.heading, color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  additionalHint: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  additionalTranscript: { backgroundColor: colors.surface },
  photoRequirement: {
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  photoRequirementTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  photoRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  photoThumb: {
    width: '48%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },

  preview: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surfaceAlt,
    resizeMode: 'contain' as const,
  },
  previewBody: { padding: spacing.md, gap: spacing.sm },
  previewTitle: { ...typography.heading, color: colors.text },
  previewText: { ...typography.body, color: colors.text },
  previewPrice: { ...typography.title, color: colors.primary },
  bullet: { ...typography.body, color: colors.textMuted },
  voiceEditCard: { marginTop: spacing.md, backgroundColor: colors.primarySoft },
  voiceEditHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  voiceEditIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceEditCopy: { flex: 1 },
  voiceEditTitle: { ...typography.bodyBold, color: colors.text },
  voiceEditWorking: { ...typography.caption, color: colors.primary, textAlign: 'center' },

  warnCard: { borderLeftWidth: 6, borderLeftColor: colors.warn },
  warnTitle: { ...typography.bodyBold, color: colors.text },
  warnText: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },

  priceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceBig: { ...typography.money, color: colors.primary },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reason: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  reasonUp: { backgroundColor: colors.okSoft },
  reasonDown: { backgroundColor: colors.warnSoft },
  reasonText: { ...typography.label },
  reasonTextUp: { color: colors.okText },
  reasonTextDown: { color: colors.warnText },

  floorCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 8,
    borderLeftColor: colors.error,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  floorHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  floorGlyph: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.errorSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floorTitle: { ...typography.heading, color: colors.error, flex: 1 },
  floorBody: { ...typography.body, color: colors.text, marginTop: spacing.gap },
  floorAmount: { ...typography.bodyBold, color: colors.text },
  advice: { gap: spacing.sm, marginTop: spacing.gap },
  adviceText: { ...typography.body, color: colors.text },
  floorReset: { marginTop: spacing.md },

  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.gap,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  channelName: { ...typography.bodyBold, color: colors.text },

  error: { ...typography.body, color: colors.error },
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
  successOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(43, 33, 24, 0.42)',
  },
  successCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    ...shadows.soft,
  },
  successCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ok,
    borderWidth: 2,
    borderColor: colors.okSoft,
  },
  successTitle: {
    ...typography.heading,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  successText: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  successButton: { width: '100%', marginTop: spacing.lg },
  requirementCard: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    ...shadows.soft,
  },
  requirementTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  requirementText: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
});