/**
 * Artisan profile endpoints. Types mirror apps/api/app/schemas/artisan.py.
 *
 * Almost every field is nullable, and the app must render that honestly: a
 * blank village is shown as blank, never as a guess or a placeholder that
 * looks like data.
 */
import { api } from './client';
import { toAudioFormValue } from './catalog';

export type Artisan = {
  id: string;
  name: string;
  village: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  primary_craft: string | null;
  years_experience: number | null;
  shg_cluster: string | null;
  artisan_card_no: string | null;
  story_native: string | null;
  story_en: string | null;
  photo_key: string | null;
  photo_url: string | null;
  story_card_url: string | null;
  monthly_capacity: number | null;
  listings_completed: number;
  assist_level: number;
  created_at: string;
};

export type ArtisanUpdate = {
  name?: string;
  village?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  primary_craft?: string | null;
  years_experience?: number | null;
  story_native?: string | null;
  story_en?: string | null;
  photo_media_id?: string | null;
};

export type StoryResult = {
  transcript: string;
  story_native: string | null;
  story_en: string | null;
  story_card_url: string | null;
};

/**
 * Signup names every artisan "Artisan 8200" from the last digits of her phone,
 * because the phone-and-PIN flow never asks for one. Screens use this to
 * prompt for a real name instead of greeting her by a serial number.
 */
export function isPlaceholderName(name: string | null | undefined): boolean {
  return /^Artisan \d{3,4}$/.test((name ?? '').trim());
}

export const artisansApi = {
  me: () => api.get<Artisan>('artisans/me'),

  update: (body: ArtisanUpdate) => api.patch<Artisan>('artisans/me', body),

  /** Voice note in; two lines of profile story, and a fresh card, out. */
  story: async (uri: string, lang = 'hi') => {
    // Same descriptor-vs-Blob split as every other upload in the app; the
    // helper lives in catalog.ts because transcription needed it first.
    const { value } = await toAudioFormValue(uri);
    const form = new FormData();
    form.append('file', value);
    form.append('lang', lang);
    return api.upload<StoryResult>('artisans/me/story', form);
  },
};
