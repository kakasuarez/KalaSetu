import { api } from './client';

export type PricingReason = {
  factor: string;
  impact: string;
  message: string;
};

export type PricingSuggestion = {
  currency: 'INR';
  low: string;
  recommended: string;
  high: string;
  dignity_floor: string;
  floor_breached: boolean;
  confidence: number;
  extracted_facts: Record<string, unknown>;
  reasons: PricingReason[];
  missing_facts: string[];
  engine: string;
};

export type PricingSuggestInput = {
  image_media_id: string;
  audio_media_id?: string;
  transcript?: string;
  language?: string;
  state?: string;
  facts?: Record<string, unknown>;
};

export const pricingApi = {
  suggest: (body: PricingSuggestInput) =>
    api.post<PricingSuggestion>('pricing/suggest', body),
};
