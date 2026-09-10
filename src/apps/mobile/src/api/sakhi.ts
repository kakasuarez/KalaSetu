/** Coordinator endpoints. Types mirror apps/api/app/schemas/{admin,sakhi}.py. */
import { api } from './client';

export type ManagedArtisan = {
  id: string;
  name: string;
  village: string | null;
  primary_craft: string | null;
  phone: string | null;
  language: string;
  lat: number;
  lon: number;
  created_at: string;
};

export type Message = {
  id: string;
  artisan_id: string;
  sender: 'sakhi' | 'artisan';
  kind: 'text' | 'voice';
  body: string | null;
  translated_body: string | null;
  /** Relative path -- resolve with resolveMediaUrl() from ./client. */
  audio_path: string | null;
  created_at: string;
};

export const sakhiApi = {
  listArtisans: () => api.get<ManagedArtisan[]>('sakhi/artisans'),

  createArtisan: (body: {
    name: string;
    phone?: string | null;
    village?: string | null;
    primary_craft?: string | null;
    language?: string;
  }) => api.post<ManagedArtisan>('sakhi/artisans', body),

  /** Fills an empty account with a handful of varied dummy artisans. A
   *  no-op (returns the existing list) once she has any of her own. */
  seedDemoArtisans: () => api.post<ManagedArtisan[]>('sakhi/artisans/demo-seed'),

  listMessages: (artisanId: string) =>
    api.get<Message[]>(`sakhi/artisans/${artisanId}/messages`),

  sendText: (artisanId: string, body: string) =>
    api.post<Message>(`sakhi/artisans/${artisanId}/messages`, { body }),

  /**
   * `api.upload` is the shared client's multipart helper -- built for photo
   * uploads elsewhere in the project, reused as-is here for voice.
   * React Native's fetch accepts a FormData part shaped as
   * `{ uri, name, type }` in place of a real Blob; a plain object cast is the
   * normal way to satisfy FormData's TS types for that shape.
   */
  sendVoice: (artisanId: string, uri: string) => {
    const form = new FormData();
    form.append('file', {
      uri,
      name: 'voice.m4a',
      type: 'audio/m4a',
    } as unknown as Blob);
    return api.upload<Message>(`sakhi/artisans/${artisanId}/messages/voice`, form);
  },
};
