/**
 * Listing endpoints. Types mirror apps/api/app/schemas/listing.py.
 */
import { api } from './client';
import type { MediaOut } from './media';

export type ListingStatus = 'draft' | 'ready' | 'published' | 'paused' | 'sold_out';

export type Listing = {
  id: string;
  artisan_id: string;
  status: ListingStatus;

  title_en: string | null;
  title_hi: string | null;
  description_en: string | null;
  description_hi: string | null;
  seo_keywords: string[] | null;
  facts: Record<string, unknown>;

  craft_class: string | null;
  gi_tag: string | null;
  heritage_note: string | null;

  price: string | null;
  price_p25: string | null;
  price_p50: string | null;
  price_p75: string | null;
  dignity_floor: string | null;
  material_cost: string | null;

  primary_media_id: string | null;
  primary_media_url: string | null;
  media_urls: string[];
  media_ids: string[];
  stock_qty: number;
  source: string;
  views_count: number;
  orders_count: number;

  created_at: string;
  updated_at: string;
};

export type ListingDetail = Listing & {
  media: MediaOut[];
};

export type ListingCreate = {
  title_en?: string | null;
  title_hi?: string | null;
  description_en?: string | null;
  description_hi?: string | null;
  seo_keywords?: string[] | null;
  facts?: Record<string, unknown> | null;
  craft_class?: string | null;
  price?: string | null;
  material_cost?: string | null;
  stock_qty?: number;
  status?: ListingStatus;
  primary_media_id?: string | null;
  media_ids?: string[];
};

export const listingsApi = {
  create: (body: ListingCreate) => api.post<Listing>('listings', body),

  list: (status?: ListingStatus, limit?: number) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (limit) q.set('limit', String(limit));
    const qs = q.toString();
    return api.get<Listing[]>(qs ? `listings?${qs}` : 'listings');
  },

  get: (id: string) => api.get<ListingDetail>(`listings/${id}`),

  update: (id: string, body: Partial<ListingCreate>) =>
    api.patch<Listing>(`listings/${id}`, body),
};