/**
 * "Your design on a tote bag" -- the motif coach card's action screen.
 *
 * Two picks (which of her products, which product template) and one button.
 * The mockup is a real perspective warp of HER photo (services/mockup.py),
 * not a generated approximation -- so the picker only offers listings she
 * already has a photo on, never lets her type or upload anything new here.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { coachApi, MockupResult, MockupTemplate } from '../api/coach';
import { resolveMediaUrl } from '../api/client';
import { messageFor } from '../api/errors';
import { Listing, listingsApi } from '../api/listings';
import { productName } from '../components/ProductCard';
import { BigButton } from '../components/BigButton';
import { SpeakableText } from '../components/SpeakableText';
import { Card, Icon } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { colors, radius, shadows, spacing, typography } from '../theme';

type Route = RouteProp<RootStackParamList, 'Mockup'>;

export function MockupScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const suggestedTemplate = route.params?.suggestedTemplate;

  const [listings, setListings] = useState<Listing[] | null>(null);
  const [templates, setTemplates] = useState<MockupTemplate[] | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(
    suggestedTemplate ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MockupResult | null>(null);

  useEffect(() => {
    Promise.all([listingsApi.list(), coachApi.getTemplates()])
      .then(([allListings, tpl]) => {
        // Only listings with an actual photo can be warped onto anything.
        const withPhoto = allListings.filter((l) => l.primary_media_id);
        setListings(withPhoto);
        setTemplates(tpl);
        if (!selectedTemplate && tpl.length) setSelectedTemplate(tpl[0].id);
      })
      .catch((e) => setError(messageFor(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosenTemplateLabel = useMemo(
    () => templates?.find((t) => t.id === selectedTemplate)?.label ?? '',
    [templates, selectedTemplate],
  );

  const generate = async () => {
    if (!selectedListing?.primary_media_id || !selectedTemplate) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await coachApi.generateMockup(
        selectedTemplate,
        selectedListing.primary_media_id,
      );
      setResult(res);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const loading = listings === null || templates === null;
  const canGenerate = !!selectedListing && !!selectedTemplate && !busy;

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
        <Text style={styles.headerTitle}>See it on a product</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {result ? (
            <Card style={styles.resultCard}>
              <Image
                source={{ uri: resolveMediaUrl(result.url) ?? undefined }}
                style={styles.resultImage}
                resizeMode="contain"
              />
              <SpeakableText
                style={styles.resultTitle}
                speak={`Your design on a ${result.label}. From ${result.current_price} rupees to ${result.potential_price} rupees. That is ${result.multiplier} times more.`}
                autoSpeak
              >
                {result.label}
              </SpeakableText>
              <View style={styles.priceRow}>
                <Text style={styles.priceFrom}>₹{result.current_price}</Text>
                <Text style={styles.priceArrow}>→</Text>
                <Text style={styles.priceTo}>₹{result.potential_price}</Text>
                <View style={styles.multiplierBadge}>
                  <Text style={styles.multiplierText}>{result.multiplier}×</Text>
                </View>
              </View>
              <BigButton
                label="Try another product"
                variant="secondary"
                onPress={() => setResult(null)}
              />
            </Card>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Which product?</Text>
              {listings && listings.length === 0 ? (
                <Text style={styles.emptyHint}>
                  Add a photo to one of your products first — the mockup uses
                  your real design, not a generated one.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {listings?.map((l) => {
                    const chosen = selectedListing?.id === l.id;
                    return (
                      <Pressable
                        key={l.id}
                        onPress={() => setSelectedListing(l)}
                        style={[styles.thumbWrap, chosen && styles.thumbWrapChosen]}
                      >
                        <Image
                          source={{ uri: resolveMediaUrl(l.primary_media_url) ?? undefined }}
                          style={styles.thumb}
                        />
                        <Text style={styles.thumbLabel} numberOfLines={1}>
                          {productName(l)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <Text style={styles.sectionLabel}>Onto what?</Text>
              <View style={styles.templateRow}>
                {templates?.map((tpl) => {
                  const chosen = selectedTemplate === tpl.id;
                  return (
                    <Pressable
                      key={tpl.id}
                      onPress={() => setSelectedTemplate(tpl.id)}
                      style={[styles.templateChip, chosen && styles.templateChipChosen]}
                    >
                      <Text
                        style={[
                          styles.templateChipText,
                          chosen && styles.templateChipTextChosen,
                        ]}
                      >
                        {tpl.label}
                      </Text>
                      <Text
                        style={[
                          styles.templateChipPrice,
                          chosen && styles.templateChipTextChosen,
                        ]}
                      >
                        ₹{tpl.base_price}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <BigButton
                label={busy ? 'Making your mockup…' : `See it on a ${chosenTemplateLabel || 'product'}`}
                onPress={generate}
                disabled={!canGenerate}
                loading={busy}
                style={styles.generateButton}
              />
            </>
          )}
        </ScrollView>
      )}
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
  loading: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.md },
  error: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    backgroundColor: colors.errorSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  sectionLabel: { ...typography.label, color: colors.textMuted, marginTop: spacing.sm },
  emptyHint: { ...typography.body, color: colors.textMuted },
  rail: { gap: spacing.sm, paddingVertical: spacing.xs },
  thumbWrap: {
    width: 110,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 4,
    alignItems: 'center',
  },
  thumbWrapChosen: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  thumb: {
    width: 100,
    height: 100,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  thumbLabel: { ...typography.caption, color: colors.text, marginTop: 4, width: 100 },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  templateChip: {
    minWidth: 120,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateChipChosen: { borderColor: colors.primary, backgroundColor: colors.primary },
  templateChipText: { ...typography.bodyBold, color: colors.text },
  templateChipTextChosen: { color: colors.textInverse },
  templateChipPrice: { ...typography.caption, color: colors.textMuted },
  generateButton: { marginTop: spacing.md },
  resultCard: { gap: spacing.sm, alignItems: 'center' },
  resultImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  resultTitle: { ...typography.heading, color: colors.text },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceFrom: { ...typography.body, color: colors.textMuted, textDecorationLine: 'line-through' },
  priceArrow: { ...typography.body, color: colors.textMuted },
  priceTo: { ...typography.money, fontSize: 26, color: colors.ok },
  multiplierBadge: {
    backgroundColor: colors.okSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  multiplierText: { ...typography.label, color: colors.okText },
});
