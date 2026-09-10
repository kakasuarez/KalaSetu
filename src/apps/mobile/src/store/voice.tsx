/**
 * The artisan's spoken language.
 *
 * Deliberately NOT routed through src/i18n. That module's `current` is a plain
 * module-level `let` with no React state behind it, so changing it re-renders
 * nothing — and UI text is English-only by product decision anyway. These are
 * two different concerns: what the screen *reads* (English) versus what the
 * artisan *speaks and hears* (her own language). Coupling them would force an
 * i18n refactor this feature does not need.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';

export type VoiceLang = {
  /** Whisper language code sent to /catalog/transcribe. */
  code: string;
  /** BCP-47 tag handed to expo-speech for the spoken guidance. */
  speech: string;
  /** Shown in the picker, in the language itself. */
  label: string;
};

/**
 * Whisper transcribes all of these. `auto` lets it detect the language, which
 * is the right default for code-mixed speech — "cotton ki saree hai" is how
 * people actually talk, and forcing a single language makes it worse.
 */
export const VOICE_LANGS: VoiceLang[] = [
  { code: 'auto', speech: 'en-IN', label: 'Detect automatically' },
  { code: 'hi', speech: 'hi-IN', label: 'हिन्दी' },
  { code: 'en', speech: 'en-IN', label: 'English' },
  { code: 'bn', speech: 'bn-IN', label: 'বাংলা' },
  { code: 'ta', speech: 'ta-IN', label: 'தமிழ்' },
  { code: 'te', speech: 'te-IN', label: 'తెలుగు' },
  { code: 'mr', speech: 'mr-IN', label: 'मराठी' },
  { code: 'gu', speech: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'kn', speech: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'ml', speech: 'ml-IN', label: 'മലയാളം' },
  { code: 'pa', speech: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
  { code: 'ur', speech: 'ur-IN', label: 'اردو' },
];

type Ctx = {
  lang: VoiceLang;
  setLang: (l: VoiceLang) => void;
  /** Whether spoken guidance plays automatically on entering a step. */
  speakGuidance: boolean;
  setSpeakGuidance: (on: boolean) => void;
};

const VoiceContext = createContext<Ctx | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<VoiceLang>(VOICE_LANGS[0]);
  const [speakGuidance, setSpeakGuidance] = useState(true);

  const value = useMemo(
    () => ({ lang, setLang, speakGuidance, setSpeakGuidance }),
    [lang, speakGuidance],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): Ctx {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside a VoiceProvider');
  return ctx;
}
