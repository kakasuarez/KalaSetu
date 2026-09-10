/**
 * Learn -- the business-coach surface.
 *
 * This is what "virtual business manager" actually means: not a dashboard of
 * numbers she has to interpret, but a short stack of specific things worth
 * doing this week, each with one button that does it.
 *
 * Coach cards come from GET /coach/cards (apps/api/app/services/coach.py,
 * PRD phase 10) -- demand signal, motif-on-a-modern-product, and stale
 * listing fixes, each grounded in her own orders and listings, never a
 * generic template. SAMPLE_COACH from sampleContent.ts is the fallback for a
 * brand-new shop with no history yet, which is the normal state for a fresh
 * account, not an error. The 'questions' card stays sample data -- it wants
 * the buyer-message inbox, a later phase.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { coachApi, type CoachCard as ApiCoachCard } from '../api/coach';
import {
  SAMPLE_COACH,
  SAMPLE_EVENTS,
  SAMPLE_LESSONS,
  SAMPLE_MARKETS,
  SAMPLE_SAKHI,
  type CoachCard,
} from '../data/sampleContent';
import { BigButton } from '../components/BigButton';
import { Icon, SectionHeading, SpeakerButton } from '../components/ui';
import type { AppNav } from '../navigation';
import { colors, radius, shadows, spacing, typography } from '../theme';

/**
 * The API returns one flat shape (schemas/coach.py's CoachCardOut) with
 * fields that only apply to some kinds left null; CoachCard in
 * sampleContent.ts is a discriminated union instead. This is the one place
 * that gap is bridged, so every card-rendering line below can stay written
 * against the union apps/mobile already had.
 */
function toCoachCard(c: ApiCoachCard): CoachCard | null {
  switch (c.kind) {
    case 'demand':
      return { kind: 'demand', title: c.title, body: c.body ?? '', action: c.action };
    case 'motif':
      return {
        kind: 'motif',
        title: c.title,
        fromPrice: c.fromPrice ?? '',
        toPrice: c.toPrice ?? '',
        action: c.action,
        template: typeof c.meta?.template === 'string' ? c.meta.template : undefined,
      };
    case 'stale':
      return {
        kind: 'stale',
        title: c.title,
        product: c.product ?? '',
        fix: c.fix ?? '',
        action: c.action,
      };
    default:
      return null; // 'questions' is not produced by this endpoint
  }
}

const BORDER: Record<CoachCard['kind'], string> = {
  demand: colors.accent,
  motif: colors.secondary,
  stale: colors.warn,
  questions: colors.primary,
};

const GLYPH: Record<CoachCard['kind'], string> = {
  demand: '🗓',
  motif: '✦',
  stale: '⚠',
  questions: '💬',
};

export function LearnScreen() {
  const navigation = useNavigation<AppNav>();

  // null = still loading; [] is a legitimate result (a brand-new shop).
  const [liveCards, setLiveCards] = useState<CoachCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // persist=false: opening this tab must not itself stamp last_coached_at
    // on a listing -- that would burn the 14-day quiet period every time she
    // just glances at the screen. Only an explicit refresh action should.
    coachApi
      .getCards(false)
      .then((res) => {
        if (cancelled) return;
        const mapped = res.cards.map(toCoachCard).filter((c): c is CoachCard => c !== null);
        setLiveCards(mapped);
      })
      .catch(() => {
        // No history yet, or the API is unreachable -- either way this is
        // not an error state the artisan needs to see; she gets the sample
        // cards below instead, same as a screen that never fetched.
        if (!cancelled) setLiveCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A new account has no orders and no stale listings, so an empty result is
  // the common case, not a failure -- fall back to sample suggestions rather
  // than showing a blank Learn tab on day one.
  const usingSample = liveCards === null || liveCards.length === 0;
  const questionsCard = SAMPLE_COACH.find((c) => c.kind === 'questions');
  const coachCards: CoachCard[] = usingSample
    ? SAMPLE_COACH
    : questionsCard
      ? [...liveCards, questionsCard]
      : liveCards;

  const act = (card: CoachCard) => {
    if (card.kind === 'questions') navigation.navigate('Inbox');
    else if (card.kind === 'demand') navigation.navigate('CatalogWizard', {});
    else if (card.kind === 'motif') navigation.navigate('Mockup', { suggestedTemplate: card.template });
    else navigation.navigate('Shop');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Learn</Text>
          <Text style={styles.subtitle}>Your business coach</Text>
        </View>

        {usingSample ? (
          <Text style={styles.sampleNote}>
            Sample suggestions — real advice appears once your shop has sales
          </Text>
        ) : null}

        <View style={styles.sakhi}>
          <View style={styles.sakhiHead}>
            <View style={styles.sakhiPhoto}>
              <Icon name="user" size={28} color={colors.primary} />
            </View>
            <View style={styles.sakhiText}>
              <Text style={styles.sakhiName}>{SAMPLE_SAKHI.name}</Text>
              <Text style={styles.sakhiRole}>
                {SAMPLE_SAKHI.role} · {SAMPLE_SAKHI.village}
              </Text>
            </View>
          </View>
          <View style={styles.sakhiButtons}>
            <BigButton
              label="Call"
              onPress={() => Linking.openURL('tel:')}
              style={styles.sakhiCall}
            />
            <BigButton label="Message" variant="secondary" onPress={() => undefined} style={styles.flex} />
          </View>
          <Text style={styles.sakhiHint}>Need help? Talk to your Sakhi.</Text>
        </View>

        <SectionHeading title="Suggestions for you" />
        <View style={styles.cards}>
          {coachCards.map((card, i) => (
            <View
              // Real cards can include several of the same kind (up to five
              // stale listings) -- `card.kind` alone would collide and React
              // would silently drop every duplicate past the first.
              key={`${card.kind}-${i}`}
              style={[styles.coach, { borderLeftColor: BORDER[card.kind] }]}
            >
              <View style={styles.coachHead}>
                <View style={styles.coachGlyph}>
                  <Text style={styles.coachGlyphText}>{GLYPH[card.kind]}</Text>
                </View>
                <Text style={styles.coachTitle}>{card.title}</Text>
                <SpeakerButton
                  size={44}
                  phrase={
                    card.kind === 'demand'
                      ? `${card.title}. ${card.body}`
                      : card.kind === 'stale'
                        ? `${card.title}. ${card.product}. ${card.fix}`
                        : card.title
                  }
                />
              </View>

              {card.kind === 'demand' ? <Text style={styles.coachBody}>{card.body}</Text> : null}

              {card.kind === 'motif' ? (
                <View style={styles.motif}>
                  <View style={styles.motifSide}>
                    <View style={styles.motifImage} />
                    <Text style={styles.motifPrice}>{card.fromPrice}</Text>
                  </View>
                  <Text style={styles.motifArrow}>→</Text>
                  <View style={styles.motifSide}>
                    <View style={styles.motifImage} />
                    <Text style={[styles.motifPrice, styles.motifPriceUp]}>{card.toPrice}</Text>
                  </View>
                </View>
              ) : null}

              {card.kind === 'stale' ? (
                <>
                  <Text style={styles.coachBody}>{card.product}</Text>
                  <View style={styles.fix}>
                    <Text style={styles.fixText}>{card.fix}</Text>
                  </View>
                </>
              ) : null}

              <BigButton
                label={card.action}
                variant={card.kind === 'motif' ? 'secondary' : 'primary'}
                onPress={() => act(card)}
                style={styles.coachAction}
              />
            </View>
          ))}
        </View>

        <SectionHeading title="Sell here too" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {SAMPLE_MARKETS.map((market) => (
            <View key={market.abbr} style={styles.market}>
              <View style={styles.marketBadge}>
                <Text style={styles.marketBadgeText}>{market.abbr}</Text>
              </View>
              <Text style={styles.marketName}>{market.name}</Text>
              <Text style={styles.marketBenefit}>{market.benefit}</Text>
              <Text style={styles.marketStatus}>Not connected</Text>
            </View>
          ))}
        </ScrollView>

        <SectionHeading title="Fairs near you" />
        <View style={styles.cards}>
          {SAMPLE_EVENTS.map((event) => (
            <View key={event.name} style={styles.event}>
              <View style={styles.date}>
                <Text style={styles.dateDay}>{event.day}</Text>
                <Text style={styles.dateMonth}>{event.month}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.eventName}>{event.name}</Text>
                <Text style={styles.eventPlace}>
                  {event.place} · {event.distance}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <SectionHeading title="Learn how" />
        <View style={styles.lessons}>
          {SAMPLE_LESSONS.map((lesson) => (
            <Pressable
              key={lesson.title}
              accessibilityRole="button"
              style={({ pressed }) => [styles.lesson, pressed && styles.pressed]}
            >
              <View style={styles.lessonArt}>
                <Text style={styles.lessonGlyph}>{lesson.glyph}</Text>
              </View>
              <Text style={styles.lessonTitle} numberOfLines={2}>
                {lesson.title}
              </Text>
              <View style={styles.lessonFoot}>
                <Text style={styles.lessonMinutes}>{lesson.minutes} min</Text>
                {lesson.done ? <Icon name="check" size={18} color={colors.ok} /> : null}
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.tail} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  sampleNote: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },

  sakhi: {
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EFD5A6',
    backgroundColor: colors.accentSoft,
  },
  sakhiHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.gap },
  sakhiPhoto: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sakhiText: { flex: 1, minWidth: 0 },
  sakhiName: { ...typography.heading, color: colors.text },
  sakhiRole: { ...typography.caption, color: colors.textMuted },
  sakhiButtons: { flexDirection: 'row', gap: 10, marginTop: spacing.gap },
  sakhiCall: { flex: 1, backgroundColor: colors.ok },
  sakhiHint: { ...typography.caption, color: colors.textMuted, marginTop: 10 },

  cards: { paddingHorizontal: spacing.md, gap: spacing.gap },
  coach: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 6,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.soft,
  },
  coachHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coachGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachGlyphText: { fontSize: 22 },
  coachTitle: { ...typography.heading, color: colors.text, flex: 1 },
  coachBody: { ...typography.body, color: colors.text, marginTop: 10 },
  coachAction: { marginTop: spacing.gap },

  motif: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.gap },
  motifSide: { flex: 1 },
  motifImage: {
    aspectRatio: 1,
    borderRadius: radius.image,
    backgroundColor: colors.surfaceAlt,
  },
  motifPrice: { ...typography.bodyBold, color: colors.text, marginTop: 6, textAlign: 'center' },
  motifPriceUp: { color: colors.ok },
  motifArrow: { ...typography.heading, color: colors.primary },

  fix: {
    marginTop: spacing.gap,
    padding: spacing.gap,
    borderRadius: radius.md,
    backgroundColor: colors.warnSoft,
  },
  fixText: { ...typography.body, color: colors.text },

  rail: { gap: spacing.gap, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  market: {
    width: 200,
    padding: spacing.gap,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  marketBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketBadgeText: { ...typography.bodyBold, color: colors.secondary },
  marketName: { ...typography.bodyBold, color: colors.text, marginTop: 10 },
  marketBenefit: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  marketStatus: { ...typography.label, color: colors.textMuted, marginTop: 10 },

  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap,
    padding: spacing.gap,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  date: {
    width: 64,
    paddingVertical: spacing.sm,
    borderRadius: radius.image,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  dateDay: { ...typography.heading, color: colors.text },
  dateMonth: { ...typography.label, fontSize: 13, color: colors.textMuted },
  eventName: { ...typography.bodyBold, color: colors.text },
  eventPlace: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  lessons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    paddingHorizontal: spacing.md,
  },
  lesson: {
    width: '48%',
    flexGrow: 1,
    padding: spacing.gap,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  lessonArt: {
    height: 88,
    borderRadius: radius.image,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonGlyph: { fontSize: 36 },
  lessonTitle: { ...typography.bodyBold, color: colors.text, marginTop: 10 },
  lessonFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  lessonMinutes: { ...typography.caption, color: colors.textMuted },
  tail: { height: 96 },
});
