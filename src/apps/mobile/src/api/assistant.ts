/**
 * The voice assistant. Mirrors apps/api/app/routers/assistant.py.
 *
 * It answers from her own profile and listings only. `action` is the app's
 * cue to navigate somewhere, and is null whenever the question was not a
 * request to go somewhere.
 */
import { api } from './client';

export type AssistantAction =
  | 'add_product'
  | 'open_catalog'
  | 'open_inbox'
  | 'open_profile';

export type AssistantAnswer = {
  answer: string;
  action: AssistantAction | null;
};

export const assistantApi = {
  ask: (question: string, lang = 'hi') =>
    api.post<AssistantAnswer>('assistant/ask', { question, lang }),
};
