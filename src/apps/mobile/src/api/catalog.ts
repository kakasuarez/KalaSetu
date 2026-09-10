/**
 * Auto-cataloger API. Types mirror apps/api/app/schemas/catalog.py.
 */
import { Platform } from 'react-native';

import { api } from './client';

/** How a fact came to be known. Drives the provenance panel on the review step. */
export type FactSource = 'answered' | 'spoken' | 'unspecified';

export type QuestionType = 'chips' | 'chips_multi' | 'number' | 'text';

export type CraftQuestion = {
  id: string;
  /** Must match a ProductFacts field, or the answer is dropped on merge. */
  field: string;
  label: string;
  type: QuestionType;
  hint?: string | null;
  options?: string[] | null;
  unit?: string | null;
};

export type Craft = {
  id: string;
  label: string;
  icon: string;
  product_type: string;
  required: string[];
  questions: CraftQuestion[];
};

/** Every field optional by design — absent means "not specified", never guessed. */
export type ProductFacts = {
  product_type?: string | null;
  material?: string | null;
  technique?: string | null;
  colors?: string[];
  dimensions_cm?: string | null;
  weight_g?: number | null;
  piece_count?: number | null;
  care_instructions?: string | null;
  work_hours?: number | null;
  is_handmade?: boolean | null;
  customizations?: string[];
  occasion?: string | null;
};

export type TranscribeResult = {
  text: string;
  engine: string;
  language: string | null;
};

export type FollowUpQuestion = {
  field: string;
  question_en: string;
  question_native: string;
  audio_url: string | null;
};

export type ExtractFactsResult = {
  facts: ProductFacts;
  missing: string[];
  follow_ups: FollowUpQuestion[];
  sources: Record<string, FactSource>;
};

export type GeneratedListing = {
  title_en: string;
  title_hi: string;
  description_en: string;
  description_hi: string;
  seo_keywords: string[];
  bullet_points_en: string[];
  unspecified_fields: string[];
};

export type Violation = { claim: string; reason: string };

export type GenerateResult = {
  listing: GeneratedListing;
  /** Empty means the compliance pass found no unsourced claim. */
  violations: Violation[];
  /** True only when a check actually ran AND passed. */
  verified: boolean;
  /** False when no LLM was reachable, so no audit happened at all. */
  verification_ran: boolean;
};

/**
 * Extension for a recording's actual MIME type.
 *
 * This matters more than it looks: Whisper (both Groq's and the local one)
 * selects a decoder from the FILE EXTENSION, not the Content-Type. expo-audio
 * records webm/opus on web but m4a on native, so hardcoding ".m4a" hands the
 * decoder webm bytes under an m4a name and transcription silently returns
 * nothing usable.
 */
const AUDIO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/3gpp': '3gp',
};

function extFor(mime: string, fallback: string): string {
  // Browsers report 'audio/webm;codecs=opus' — match on the base type.
  const base = mime.split(';')[0].trim().toLowerCase();
  return AUDIO_EXT[base] ?? fallback;
}

/**
 * Turn a local recording URI into something FormData will actually send,
 * named after what it actually is.
 *
 * Same platform split as mediaApi: React Native streams a {uri,name,type}
 * descriptor, the browser needs a real Blob or it posts "[object Object]".
 */
export async function toAudioFormValue(uri: string) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const type = blob.type || 'audio/webm';
    return {
      value: new File([blob], `note.${extFor(type, 'webm')}`, { type }),
      name: `note.${extFor(type, 'webm')}`,
    };
  }
  // expo-audio writes .m4a on iOS and .3gp on Android with LOW_QUALITY;
  // trust the URI's own extension rather than assuming.
  const uriExt = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const ext = uriExt && uriExt.length <= 4 ? uriExt : 'm4a';
  const name = `note.${ext}`;
  const type = Object.entries(AUDIO_EXT).find(([, e]) => e === ext)?.[0] ?? 'audio/m4a';
  return { value: { uri, name, type } as unknown as Blob, name };
}

export const catalogApi = {
  crafts: () => api.get<Craft[]>('catalog/crafts'),

  /** `lang` may be 'auto' to let Whisper detect the language itself. */
  transcribe: async (uri: string, lang = 'hi') => {
    const { value } = await toAudioFormValue(uri);
    const form = new FormData();
    form.append('file', value);
    form.append('lang', lang);
    return api.upload<TranscribeResult>('catalog/transcribe', form);
  },

  extractFacts: (body: {
    transcript: string;
    lang?: string;
    craft_id?: string | null;
    existing_facts?: ProductFacts;
  }) => api.post<ExtractFactsResult>('catalog/extract-facts', body),

  generate: (body: {
    facts: ProductFacts;
    craft_id?: string | null;
    craft_class?: string | null;
    artisan_words?: string | null;
    title_override?: string | null;
    tone?: 'marketplace' | 'premium' | 'b2b';
  }) => api.post<GenerateResult>('catalog/generate', body),
};
