/**
 * PLACEHOLDER CONTENT. None of this is real artisan data.
 *
 * Three surfaces in the design have no backend behind them yet:
 *
 *   - Home's earnings and products-sold figures. The `orders` table exists but
 *     nothing writes to it; order ingestion arrives with the WhatsApp and ONDC
 *     channels (PRD phases 7-8) and the aggregates with the coach (phase 10).
 *   - The Inbox. Buyer questions land in `buyer_queries`, which no router
 *     touches; the RAG engine that answers them is phase 9.
 *   - The Learn feed. Coach nudges are phase 10.
 *
 * Everything here exists so those screens can be built and reviewed now. It is
 * deliberately quarantined in one module with no API surface, so the swap to
 * real data is one changed import per screen and nothing else. Nothing outside
 * these three screens may import it.
 *
 * Anything shown from this file must be visibly marked as sample data in the
 * UI. Presenting an invented number as her earnings would be the same failure
 * the cataloger exists to prevent, and a worse one -- she might act on it.
 */

export const SAMPLE_EARNINGS = {
  totalRupees: 48200,
  weekDeltaRupees: 1200,
  productsSold: 37,
  soldThisMonth: 6,
};

export type Channel = 'whatsapp' | 'ondc' | 'app';

export type SampleThread = {
  id: string;
  buyer: string;
  initial: string;
  channel: Channel;
  preview: string;
  time: string;
  unread: boolean;
  autoAnswered: boolean;
  product: { name: string; price: string };
  messages: { id: string; from: 'buyer' | 'artisan'; text: string; ai?: boolean }[];
  suggestions: string[];
};

export const SAMPLE_THREADS: SampleThread[] = [
  {
    id: 't1',
    buyer: 'Priya Sharma',
    initial: 'P',
    channel: 'whatsapp',
    preview: 'Can you make this in blue?',
    time: '10 min',
    unread: true,
    autoAnswered: false,
    product: { name: 'Mithila Fish Painting', price: '₹1,450' },
    messages: [
      { id: 'm1', from: 'buyer', text: 'Namaste. Is this painting available?' },
      { id: 'm2', from: 'artisan', text: 'Yes, it is ready.' },
      { id: 'm3', from: 'buyer', text: 'Can you make this in blue?' },
    ],
    suggestions: ['Yes, I can make it', 'Ready in 3 days', '₹50 extra for that'],
  },
  {
    id: 't2',
    buyer: '+91 98••• ••210',
    initial: 'B',
    channel: 'ondc',
    preview: 'What size is the basket?',
    time: '2 hours',
    unread: true,
    autoAnswered: true,
    product: { name: 'Sikki Grass Basket', price: '₹650' },
    messages: [
      { id: 'm1', from: 'buyer', text: 'What size is the basket?' },
      {
        id: 'm2',
        from: 'artisan',
        text: 'It is 25 cm across and 18 cm tall.',
        ai: true,
      },
    ],
    suggestions: ['Yes, that is correct', 'I can make a bigger one', 'Ready in 3 days'],
  },
  {
    id: 't3',
    buyer: 'Ananya Rao',
    initial: 'A',
    channel: 'app',
    preview: 'Thank you, it arrived safely!',
    time: 'Yesterday',
    unread: false,
    autoAnswered: false,
    product: { name: 'Terracotta Water Pot', price: '₹480' },
    messages: [
      { id: 'm1', from: 'buyer', text: 'Thank you, it arrived safely!' },
    ],
    suggestions: ['Thank you!', 'Please tell your friends', 'Come again'],
  },
];

export const SAMPLE_SAKHI = {
  name: 'Kamala Devi',
  role: 'Self-help group leader',
  village: 'Madhubani',
};

export type CoachCard =
  | { kind: 'demand'; title: string; body: string; action: string }
  | {
      kind: 'motif';
      title: string;
      fromPrice: string;
      toPrice: string;
      action: string;
      /** Which mockup template this card matched on -- pre-selects it on
       *  the Mockup screen. Absent on sample data, which has no real
       *  template behind it. */
      template?: string;
    }
  | { kind: 'stale'; title: string; product: string; fix: string; action: string }
  | { kind: 'questions'; title: string; action: string };

export const SAMPLE_COACH: CoachCard[] = [
  {
    kind: 'demand',
    title: 'Diwali is 40 days away',
    body: 'This time last year your diyas sold the most — 14 orders.',
    action: 'Start making now',
  },
  {
    kind: 'motif',
    title: 'Your design on a tote bag',
    fromPrice: '₹250',
    toPrice: '₹1,200',
    action: 'See mockup',
  },
  {
    kind: 'stale',
    title: 'Not sold in 30 days',
    product: 'Sikki Grass Basket',
    fix: 'Lower the price by ₹200 and add 5 more keywords',
    action: 'Fix it now',
  },
  { kind: 'questions', title: '2 buyers are waiting for a reply', action: 'Reply now' },
];

export const SAMPLE_MARKETS = [
  { abbr: 'ONDC', name: 'ONDC', benefit: 'Sell across many buyer apps', connected: false },
  { abbr: 'GeM', name: 'GeM', benefit: 'Government buyers, bulk orders', connected: false },
  { abbr: 'AK', name: 'Amazon Karigar', benefit: 'Handicraft buyers all over India', connected: false },
  { abbr: 'FS', name: 'Flipkart Samarth', benefit: 'Support for artisan sellers', connected: false },
];

export const SAMPLE_EVENTS = [
  { day: '12', month: 'OCT', name: 'Shilp Samagam', place: 'Patna', distance: '38 km' },
  { day: '02', month: 'NOV', name: 'Surajkund Mela', place: 'Faridabad', distance: '1,050 km' },
  { day: '20', month: 'NOV', name: 'Dilli Haat craft week', place: 'New Delhi', distance: '1,090 km' },
];

export const SAMPLE_LESSONS = [
  { glyph: '📷', title: 'How to take a good photo', minutes: 3, done: true },
  { glyph: '₹', title: 'How to decide a price', minutes: 4, done: false },
  { glyph: '💬', title: 'Answering buyer questions', minutes: 3, done: false },
  { glyph: '📦', title: 'Packing so nothing breaks', minutes: 5, done: false },
];
