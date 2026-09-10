/**
 * Tap to start, tap to stop, auto-stops at the cap.
 *
 * Records with expo-audio (expo-av is deprecated in SDK 54), uploads to
 * /catalog/transcribe, and hands the transcript back. The server picks the
 * engine — Groq Whisper normally, local faster-whisper when that is throttled
 * or the demo is offline.
 *
 * A tap toggle rather than press-and-hold on purpose: holding a button steady
 * for 60 seconds is hard for anyone, and the artisans this is built for are
 * often working one-handed.
 *
 * Three things about expo-audio's lifecycle that this component has to work
 * around, all verified in node_modules/expo-audio/build/AudioModule.web.js:
 *
 *   1. `stop()` sets mediaRecorder = null, so EVERY take needs its own
 *      `prepareToRecordAsync()`. A recorder is not reusable.
 *   2. Calling `stop()` when it is already null throws "Cannot start an audio
 *      recording without initializing a MediaRecorder" — the same message
 *      `record()` throws, which makes a double-stop look like a failed start.
 *   3. `useAudioRecorderState` POLLS on an interval, so `state.isRecording`
 *      lags reality by up to that interval. Branching start-vs-stop on it lets
 *      a quick second tap call `start()` mid-recording. The synchronous
 *      `phaseRef` below is the source of truth; polled state is display only.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { catalogApi } from '../api/catalog';
import { messageFor } from '../api/errors';
import { useVoice } from '../store/voice';
import { colors, radius, spacing, typography } from '../theme';

type Phase = 'idle' | 'recording' | 'paused' | 'working';

type Props = {
  maxSeconds: number;
  onTranscript: (text: string) => void;
  /**
   * Take the audio file instead of a transcript.
   *
   * When present, the recording is NOT sent to /catalog/transcribe -- the
   * caller gets the URI and posts it wherever it belongs. The profile story
   * needs this: its endpoint transcribes and summarises in one pass, and
   * transcribing here first would mean uploading the same audio twice.
   */
  onRecorded?: (uri: string) => Promise<void> | void;
  /** Shown under the button. Keep it short — it is read aloud elsewhere. */
  label?: string;
  disabled?: boolean;
  /**
   * Invert for use on the terracotta voice overlay. A terracotta mic on a
   * terracotta ground is invisible in sunlight, which is exactly the
   * condition this app is used in.
   */
  onDark?: boolean;
  showPauseDone?: boolean;
};

export function VoiceRecorder({
  maxSeconds,
  onTranscript,
  onRecorded,
  label = 'Tap to speak',
  disabled = false,
  onDark = false,
  showPauseDone = false,
}: Props) {
  const { lang } = useVoice();
  // LOW_QUALITY is deliberate: speech stays intelligible, a 60s note is well
  // under 1 MB, and it uploads on rural 3G.
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const state = useAudioRecorderState(recorder, 250);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef<Phase>('idle');
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhaseNow = (next: Phase) => {
    phaseRef.current = next; // synchronous — guards against tap races
    setPhase(next);
  };

  const clearTimer = () => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
  };

  const elapsed = Math.floor((state.durationMillis ?? 0) / 1000);

  const finish = useCallback(async () => {
    if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') return;
    setPhaseNow('working');
    clearTimer();
    setError(null);

    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch (e) {
      // Already torn down (auto-stop raced a tap). If a URI survived we can
      // still use it; otherwise report honestly rather than silently dropping
      // what the artisan just said.
      uri = recorder.uri ?? null;
      if (!uri) {
        setError('That recording was lost. Please try again.');
        setPhaseNow('idle');
        return;
      }
    }

    try {
      if (!uri) throw new Error('Nothing was recorded. Please try again.');

      if (onRecorded) {
        await onRecorded(uri);
        return;
      }

      const { text } = await catalogApi.transcribe(uri, lang.code);
      if (!text.trim()) {
        setError('We could not hear anything. Please speak a little louder.');
        return;
      }
      onTranscript(text);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setPhaseNow('idle');
    }
  }, [recorder, lang.code, onTranscript, onRecorded]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    try {
      recorder.pause();
      setPhaseNow('paused');
    } catch (e) {
      setError(messageFor(e));
    }
  }, [recorder]);

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    try {
      recorder.record();
      setPhaseNow('recording');
    } catch (e) {
      setError(messageFor(e));
    }
  }, [recorder]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return; // ignore taps while busy
    setError(null);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone access is needed. Allow it for this site, then try again.');
        return;
      }

      // iOS records near-silently and Android may route oddly without this.
      // Non-essential elsewhere, so never let it block a recording.
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch {
        /* platform does not need it */
      }

      // A recorder is single-use (see note 1 above): always build a fresh one.
      await recorder.prepareToRecordAsync();
      try {
        recorder.record();
      } catch {
        // Lost the MediaRecorder between prepare and record (a re-render can
        // swap the instance). Re-prepare once before giving up.
        await recorder.prepareToRecordAsync();
        recorder.record();
      }

      setPhaseNow('recording');

      // Hard cap: Groq rejects files over 25 MB, long notes hurt accuracy, and
      // nobody should lose a five-minute recording to one failed upload.
      stopTimer.current = setTimeout(() => void finish(), maxSeconds * 1000);
    } catch (e) {
      setError(messageFor(e));
      setPhaseNow('idle');
    }
  }, [recorder, maxSeconds, finish]);

  useEffect(() => clearTimer, []);

  const recording = phase === 'recording';
  const paused = phase === 'paused';
  const busy = phase === 'working';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => void (recording || paused ? finish() : start())}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={recording || paused ? 'Finish recording' : label}
        accessibilityHint={
          recording || paused
            ? 'Finishes recording and writes down what you said'
            : 'Starts recording your voice'
        }
        accessibilityState={{ disabled: disabled || busy, busy }}
        style={({ pressed }) => [
          styles.mic,
          onDark && styles.micOnDark,
          (recording || paused) && styles.micActive,
          (disabled || busy) && styles.micDisabled,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={onDark ? colors.primary : colors.textInverse} />
        ) : (
          <Text style={styles.micIcon}>{recording || paused ? '⏹' : '🎤'}</Text>
        )}
      </Pressable>

      <Text style={[styles.label, onDark && styles.labelOnDark]}>
        {recording
          ? `Listening…  ${elapsed}s / ${maxSeconds}s`
          : paused
            ? `Paused  ${elapsed}s / ${maxSeconds}s`
          : busy
            ? 'Understanding…'
            : label}
      </Text>

      {showPauseDone && (recording || paused) ? (
        <View style={styles.controls}>
          <Pressable
            onPress={() => void (paused ? resume() : pause())}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume recording' : 'Pause recording'}
            style={styles.controlButton}
          >
            <Text style={styles.controlText}>{paused ? 'Resume' : 'Pause'}</Text>
          </Pressable>
          <Pressable
            onPress={() => void finish()}
            accessibilityRole="button"
            accessibilityLabel="Done recording"
            style={[styles.controlButton, styles.doneButton]}
          >
            <Text style={[styles.controlText, styles.doneText]}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm },
  mic: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micOnDark: { backgroundColor: colors.surface },
  micActive: { backgroundColor: colors.accent },
  micDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  micIcon: { fontSize: 36 },
  label: { ...typography.label, color: colors.textMuted, textAlign: 'center' },
  labelOnDark: { ...typography.body, color: colors.textInverse },
  controls: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  controlButton: {
    minWidth: 92,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  doneButton: { borderColor: colors.primary, backgroundColor: colors.primary },
  controlText: { ...typography.label, color: colors.text },
  doneText: { color: colors.textInverse },
  error: { ...typography.body, color: colors.error, textAlign: 'center' },
});
