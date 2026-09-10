/**
 * Auth endpoints. Types mirror apps/api/app/schemas/auth.py.
 */
import { api } from './client';

export type Role = 'artisan' | 'sakhi' | 'admin';

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: Role;
  /** False right after the first OTP login -- prompt her to set a PIN. Only
   *  meaningful for artisan; coordinator and admin never set one. */
  pin_set: boolean;
  artisan_id: string | null;
  display_name: string | null;
};

export type OtpRequestResponse = {
  sent: boolean;
  /** Only present when the API runs with ENV=dev. There is no SMS provider. */
  debug_otp: string | null;
};

export const authApi = {
  requestOtp: (phone: string, role: Role = 'artisan') =>
    api.post<OtpRequestResponse>('auth/otp/request', { phone, role }),

  verifyOtp: (phone: string, otp: string, role: Role = 'artisan') =>
    api.post<TokenResponse>('auth/otp/verify', { phone, otp, role }),

  setPin: (pin: string) => api.post<{ ok: boolean }>('auth/pin/set', { pin }),

  pinLogin: (phone: string, pin: string) =>
    api.post<TokenResponse>('auth/pin/login', { phone, pin }),
};
