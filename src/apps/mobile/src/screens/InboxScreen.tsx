/**
 * Inbox -- every buyer conversation in one place, whichever platform it came
 * from. WhatsApp, ONDC buyer apps and the in-app channel all land here, and a
 * reply routes back to wherever the question started.
 *
 * The channel badge on each avatar is the whole point of the row: she needs to
 * know she is talking to a WhatsApp buyer before she chooses how to answer.
 *
 * The threads below are SAMPLE DATA from src/data/sampleContent.ts. Buyer
 * messages arrive with the WhatsApp channel and the RAG engine (PRD phases 7
 * and 9); nothing writes to `buyer_queries` yet.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { SAMPLE_THREADS, type Channel, type SampleThread } from '../data/sampleContent';
import { FilterChips, type Chip } from '../components/ui';
import type { AppNav } from '../navigation';
import { colors, radius, spacing, typography } from '../theme';

type Filter = 'all' | 'needs_reply' | Channel;

const FILTERS: Chip<Filter>[] = [
  { value: 'needs_reply', label: 'Needs reply' },
  { value: 'all', label: 'All' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ondc', label: 'ONDC' },
];

const CHANNEL_LOOK: Record<Channel, { colour: string; letter: string; name: string }> = {
  whatsapp: { colour: colors.whatsapp, letter: 'W', name: 'WhatsApp' },
  ondc: { colour: colors.ondc, letter: 'O', name: 'ONDC' },
  app: { colour: colors.primary, letter: 'K', name: 'KalaSetu' },
};

export function InboxScreen() {
  const navigation = useNavigation<AppNav>();
  // "Needs reply" first: an unanswered buyer is the only thing on this screen
  // that costs her money.
  const [filter, setFilter] = useState<Filter>('needs_reply');

  const threads = useMemo(() => {
    if (filter === 'all') return SAMPLE_THREADS;
    if (filter === 'needs_reply') return SAMPLE_THREADS.filter((t) => t.unread);
    return SAMPLE_THREADS.filter((t) => t.channel === filter);
  }, [filter]);

  const unread = SAMPLE_THREADS.filter((t) => t.unread).length;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Inbox</Text>
          {unread ? (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadText}>{unread} new</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.sampleNote}>
          Sample messages — real buyer chat arrives with WhatsApp and ONDC
        </Text>

        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

        <View style={styles.list}>
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              onPress={() => navigation.navigate('Thread', { threadId: thread.id })}
            />
          ))}
          {threads.length === 0 ? (
            <Text style={styles.none}>Nothing waiting for a reply.</Text>
          ) : null}
        </View>

        <View style={styles.tail} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ThreadRow({ thread, onPress }: { thread: SampleThread; onPress: () => void }) {
  const look = CHANNEL_LOOK[thread.channel];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${thread.buyer} on ${look.name}. ${thread.preview}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{thread.initial}</Text>
        </View>
        <View style={[styles.channelBadge, { backgroundColor: look.colour }]}>
          <Text style={styles.channelBadgeText}>{look.letter}</Text>
        </View>
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.buyer} numberOfLines={1}>
          {thread.buyer}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {thread.preview}
        </Text>
      </View>

      <View style={styles.rowEnd}>
        <Text style={styles.time}>{thread.time}</Text>
        {thread.unread ? (
          <View style={styles.dot} />
        ) : thread.autoAnswered ? (
          <View style={styles.aiPill}>
            <Text style={styles.aiPillText}>AI replied</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  title: { ...typography.title, color: colors.text },
  unreadPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 11,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  unreadText: { ...typography.label, color: colors.textInverse },
  sampleNote: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },

  list: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap,
    minHeight: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.gap,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.heading, fontSize: 19, color: colors.primary },
  channelBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelBadgeText: {
    ...typography.label,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textInverse,
  },
  rowBody: { flex: 1, minWidth: 0 },
  buyer: { ...typography.bodyBold, color: colors.text },
  preview: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  rowEnd: { alignItems: 'flex-end', gap: 6 },
  time: { ...typography.caption, fontSize: 14, color: colors.textMuted },
  dot: { width: 12, height: 12, borderRadius: 999, backgroundColor: colors.primary },
  aiPill: {
    backgroundColor: colors.okSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  aiPillText: { ...typography.label, fontSize: 13, color: colors.okText },
  none: {
    ...typography.body,
    color: colors.textMuted,
    padding: spacing.lg,
    textAlign: 'center',
  },
  tail: { height: 96 },
});
