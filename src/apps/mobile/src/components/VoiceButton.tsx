/**
 * A compact tap-to-record mic button sized for an inline chat composer.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Mic, Square } from 'lucide-react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import { colors, radius } from '../theme';

type Phase = 'idle' | 'recording' | 'working';

export function VoiceButton({
  onRecorded,
  disabled = false,
}: {
  onRecorded: (uri: string) => Promise<void> | void;
  disabled?: boolean;
}) {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');

  const setPhaseNow = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const finish = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    setPhaseNow('working');
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      uri = recorder.uri ?? null;
    }
    try {
      if (uri) await onRecorded(uri);
    } finally {
      setPhaseNow('idle');
    }
  }, [recorder, onRecorded]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch {
        /* platform does not need it */
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhaseNow('recording');
    } catch {
      setPhaseNow('idle');
    }
  }, [recorder]);

  const busy = phase === 'working';
  const recording = phase === 'recording';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Record a voice message'}
      onPress={() => void (recording ? finish() : start())}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn,
        recording && styles.btnRecording,
        (disabled || busy) && styles.btnDisabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : recording ? (
        <Square size={18} color={colors.textInverse} fill={colors.textInverse} />
      ) : (
        <Mic size={20} color={colors.primary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  btnRecording: { backgroundColor: colors.error },
  btnDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
