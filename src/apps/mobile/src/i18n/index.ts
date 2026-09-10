/**
 * Minimal i18n.
 *
 * Deliberately dependency-free: the artisan flow has a handful of strings and
 * a full i18n library would be more surface than the app needs. Hindi is the
 * default because the primary user is a Hindi-belt artisan (PRD: users.preferred_lang
 * defaults to 'hi'); Phase 11 switches this from her profile.
 *
 * `hi` is typed as `typeof en`, so adding a key to en.ts without translating it
 * is a compile error rather than a silently missing string at runtime.
 */
import en from './en';
import hi from './hi';

export const translations = { en, hi } as const;
export type Lang = keyof typeof translations;
export type Strings = typeof en;

// UI text is English-only by product decision. What the artisan *speaks*
// and *hears* is separate and lives in src/store/voice.tsx.
let current: Lang = 'en';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Current string table. Call at render time so a language switch re-reads it. */
export function t(): Strings {
  return translations[current];
}
