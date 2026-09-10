/** Coach endpoints. Types mirror apps/api/app/schemas/coach.py. */
import { api } from './client';

export type CoachCard = {
  kind: 'demand' | 'motif' | 'stale' | 'questions';
  title: string;
  action: string;
  focus: boolean;
  impact_rupees: number;
  body?: string | null;
  fromPrice?: string | null;
  toPrice?: string | null;
  product?: string | null;
  fix?: string | null;
  meta: Record<string, unknown>;
};

export type CoachCardsResponse = {
  cards: CoachCard[];
  generated_at: string;
};

export type CoachDigest = {
  date: string;
  live_listings: number;
  views_total: number;
  orders_today: number;
  revenue_today: number;
  message_en: string;
  message_hi: string;
};

export type MockupTemplate = {
  id: string;
  label: string;
  base_price: number;
};

export type MockupResult = {
  media_id: string;
  url: string;
  template: string;
  label: string;
  current_price: number;
  potential_price: number;
  multiplier: number;
  uplift: number;
};

export const coachApi = {
  /**
   * persist=false on a plain screen-open pull: writing a nudge stamps
   * last_coached_at on the listing it came from, which is what enforces the
   * 14-day quiet period server-side (services/coach.py) -- reopening the
   * Learn tab three times in a morning must not burn through that window.
   */
  getCards: (persist = false) =>
    api.get<CoachCardsResponse>(`coach/cards?persist=${persist}`),

  getDigest: () => api.get<CoachDigest>('coach/digest'),

  getTemplates: () => api.get<MockupTemplate[]>('coach/templates'),

  generateMockup: (template: string, mediaId: string) =>
    api.post<MockupResult>(`coach/mockup/${template}?media_id=${mediaId}`),

  actOnNudge: (nudgeId: string, actedOn = true) =>
    api.patch<{ ok: boolean }>(`coach/nudges/${nudgeId}`, { acted_on: actedOn }),
};
