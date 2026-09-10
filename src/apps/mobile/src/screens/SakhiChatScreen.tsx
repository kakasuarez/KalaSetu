/**
 * One artisan's thread: text (translated into her language), voice notes,
 * and a call button in the header.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Pause, Phone, Play, Send } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { messageFor } from '../api/errors';
import { resolveMediaUrl } from '../api/client';
import { colors, radius, spacing, typography } from '../theme';

import { VoiceButton } from '../components/VoiceButton';
import { Message, ManagedArtisan, sakhiApi } from '../api/sakhi';
import { t } from '../i18n/strings';
import type { AppStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<AppStackParamList, 'SakhiChat'>;
type Rt = RouteProp<AppStackParamList, 'SakhiChat'>;

function VoiceBubble({ path }: { path: string }) {
  const url = resolveMediaUrl(path) ?? '';
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const s = t();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={s.sakhi.playVoice}
      onPress={() => (status.playing ? player.pause() : player.play())}
      style={styles.voiceRow}
    >
      {status.playing ? (
        <Pause size={18} color={colors.textInverse} />
      ) : (
        <Play size={18} color={colors.textInverse} />
      )}
      <Text style={styles.voiceLabel}>{s.sakhi.voiceMessage}</Text>
    </Pressable>
  );
}

function Bubble({ message }: { message: Message }) {
  return (
    <View style={styles.bubbleWrap}>
      <View style={styles.bubble}>
        {message.kind === 'voice' && message.audio_path ? (
          <VoiceBubble path={message.audio_path} />
        ) : (
          <>
            <Text style={styles.bubbleText}>{message.body}</Text>
            {message.translated_body ? (
              <>
                <View style={styles.bubbleDivider} />
                <Text style={styles.bubbleTextTranslated}>
                  {message.translated_body}
                </Text>
              </>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

export function SakhiChatScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { artisanId, artisanName } = route.params;
  const s = t();

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const [msgs, artisans] = await Promise.all([
        sakhiApi.listMessages(artisanId),
        sakhiApi.listArtisans(),
      ]);
      setMessages(msgs);
      const mine = artisans.find((a: ManagedArtisan) => a.id === artisanId);
      setPhone(mine?.phone ?? null);
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    }
  }, [artisanId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendText = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setSending(true);
    setError(null);
    try {
      const msg = await sakhiApi.sendText(artisanId, body);
      setMessages((prev) => [...(prev ?? []), msg]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(messageFor(e));
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const sendVoice = async (uri: string) => {
    setSending(true);
    setError(null);
    try {
      const msg = await sakhiApi.sendVoice(artisanId, uri);
      setMessages((prev) => [...(prev ?? []), msg]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setSending(false);
    }
  };

  const call = () => {
    if (phone) void Linking.openURL(`tel:${phone}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={s.common.back}
          onPress={() => nav.goBack()}
          hitSlop={12}
        >
          <ChevronLeft size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{artisanName}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={s.sakhi.call}
          onPress={call}
          disabled={!phone}
          hitSlop={12}
          style={!phone && styles.headerCallDisabled}
        >
          <Phone size={22} color={phone ? colors.primary : colors.textMuted} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        {messages === null ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <Bubble message={item} />}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={s.sakhi.typeMessage}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            editable={!sending}
          />
          <VoiceButton onRecorded={sendVoice} disabled={sending} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={s.common.send}
            onPress={sendText}
            disabled={sending || !draft.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              (sending || !draft.trim()) && styles.sendBtnDisabled,
              pressed && styles.sendBtnPressed,
            ]}
          >
            <Send size={20} color={colors.textInverse} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: { ...typography.heading, color: colors.text, flex: 1 },
  headerCallDisabled: { opacity: 0.4 },
  loading: { marginTop: spacing.xl },
  error: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    padding: spacing.xs,
  },
  list: { padding: spacing.md, gap: spacing.sm },
  bubbleWrap: { alignSelf: 'flex-end', maxWidth: '82%', marginBottom: spacing.xs },
  bubble: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    borderBottomRightRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  bubbleText: { ...typography.body, color: colors.textInverse },
  bubbleDivider: {
    height: 1,
    backgroundColor: colors.textInverse,
    opacity: 0.3,
    marginVertical: spacing.xs,
  },
  bubbleTextTranslated: {
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    color: colors.textInverse,
  },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  voiceLabel: { ...typography.body, color: colors.textInverse },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnPressed: { backgroundColor: colors.primaryPressed },
});
