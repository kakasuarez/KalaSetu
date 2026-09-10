/**
 * Maps API error codes to strings she can act on.
 *
 * The API's error envelope carries a stable `code`; screens should branch on
 * that rather than on HTTP status or on message text, both of which change.
 */
import { ApiError } from './client';
import { t } from '../i18n';

export function messageFor(error: unknown): string {
  const s = t();

  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_OTP':
        return s.errors.invalidOtp;
      case 'INVALID_CREDENTIALS':
        return s.errors.invalidPin;
      case 'TOO_MANY_ATTEMPTS':
        return s.errors.lockedOut;
      case 'FILE_TOO_LARGE':
        return s.errors.fileTooLarge;
      case 'VALIDATION_ERROR':
        // Generic: this code covers every field on every endpoint. The screen
        // that owns a field validates it locally and shows a specific message.
        return s.errors.invalidInput;
      case 'EMPTY_FILE':
      case 'STORAGE_ERROR':
        return s.errors.uploadFailed;
      default:
        return error.message || s.common.error;
    }
  }

  // fetch() rejects with a TypeError when the request never reached the
  // server: DNS, timeout, wrong LAN IP, blocked port. That -- and only that --
  // is a genuine connectivity problem.
  if (error instanceof TypeError) {
    return s.errors.network;
  }

  // Anything else is a local failure (a missing native module, a bad parse).
  // Reporting those as "check your internet" is how an unavailable
  // expo-secure-store on web masqueraded as an outage for an hour.
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return s.common.error;
}
