/**
 * Media upload. Types mirror apps/api/app/schemas/media.py.
 */
import { Platform } from 'react-native';

import { api } from './client';

export type MediaKind =
  | 'image_raw'
  | 'image_enhanced'
  | 'audio'
  | 'video'
  | 'glb'
  | 'mockup'
  | 'card';

export type MediaOut = {
  id: string;
  kind: MediaKind;
  parent_id: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
};

export type Backdrop = 'white' | 'warm' | 'sage' | 'charcoal';

export type MediaUploadResult = {
  id: string;
  kind: MediaKind;
  url: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number;
};

export type Generate3DResult = {
  id: string;
  location: string;
  url?: string;
};

async function toFormValue(uri: string, name: string, type: string) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return new File([blob], name, { type: blob.type || type });
  }
  return { uri, name, type } as unknown as Blob;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  m4a: 'audio/m4a',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'audio/mp4',
};

function mimeFor(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export const mediaApi = {
  upload: async (uri: string, kind: MediaKind = 'image_raw', name = 'photo.jpg') => {
    const type = mimeFor(name);
    const form = new FormData();
    form.append('file', await toFormValue(uri, name, type));
    form.append('kind', kind);
    return api.upload<MediaUploadResult>('media/upload', form);
  },

  url: (id: string) => api.get<{ id: string; url: string }>(`media/${id}/url`),

  enhance: (id: string, backdrop: Backdrop = 'white') =>
    api.post<MediaUploadResult>(`media/${id}/enhance?backdrop=${backdrop}`),

  generate3d: async (id: string, hfToken?: string): Promise<Generate3DResult> => {
    const res = await api.post<MediaUploadResult>(
      `media/${id}/generate3d`,
      hfToken ? { hf_token: hfToken } : {}
    );
    return {
      id: res.id,
      location: res.url,
      url: res.url,
    };
  },

  generate3dFromListing: async (listingId: string): Promise<Generate3DResult> => {
    const res = await api.post<MediaUploadResult>(
      `media/listing/${listingId}/generate3d`
    );
    return {
      id: res.id,
      location: res.url,
      url: res.url,
    };
  },

  remove3dFromListing: (listingId: string) =>
    api.delete<{ status: string; removed: number }>(`media/listing/${listingId}/3d`),
};