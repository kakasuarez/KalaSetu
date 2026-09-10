/**
 * Session state for the three-role app.
 *
 * Persists jwt, phone, role, artisan_id, and pin_set in tokenStorage.
 * Fixes the session restore bug where role was hardcoded to 'artisan'.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { authApi, Role, TokenResponse } from '../api/auth';
import { tokenStorage } from './tokenStorage';

const TOKEN_KEY = 'jwt';
const PHONE_KEY = 'phone';
const ROLE_KEY = 'role';
const ARTISAN_ID_KEY = 'artisan_id';
const PIN_SET_KEY = 'pin_set';

export type Session = {
  token: string;
  role: Role;
  artisanId: string | null;
  pinSet: boolean;
  displayName: string | null;
};

export type AuthState = {
  /** True until the stored session has been read back on launch. */
  restoring: boolean;
  session: Session | null;
  /** Remembered between launches so a login screen can pre-fill it. */
  lastPhone: string | null;
  requestOtp: (phone: string, role?: Role) => Promise<string | null>;
  verifyOtp: (phone: string, otp: string, role?: Role) => Promise<Session>;
  pinLogin: (phone: string, pin: string) => Promise<Session>;
  setPin: (pin: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function sessionFromToken(res: TokenResponse): Session {
  return {
    token: res.access_token,
    role: res.role,
    artisanId: res.artisan_id,
    pinSet: res.pin_set,
    displayName: res.display_name ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [restoring, setRestoring] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [lastPhone, setLastPhone] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [token, phone, role, artisanId, pinSet] = await Promise.all([
          tokenStorage.get(TOKEN_KEY),
          tokenStorage.get(PHONE_KEY),
          tokenStorage.get(ROLE_KEY),
          tokenStorage.get(ARTISAN_ID_KEY),
          tokenStorage.get(PIN_SET_KEY),
        ]);
        setLastPhone(phone);
        if (token) {
          // The token is long-lived and the API rejects an expired one with
          // 401, which screens surface as a re-login prompt.
          setSession({
            token,
            role: (role as Role) || 'artisan',
            artisanId: artisanId || null,
            pinSet: pinSet === '1',
            displayName: null,
          });
        }
      } catch {
        // A wiped keystore is a normal cold start, not an error.
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const persist = useCallback(async (phone: string, next: Session) => {
    await Promise.all([
      tokenStorage.set(TOKEN_KEY, next.token),
      tokenStorage.set(PHONE_KEY, phone),
      tokenStorage.set(ROLE_KEY, next.role),
      tokenStorage.set(ARTISAN_ID_KEY, next.artisanId ?? ''),
      tokenStorage.set(PIN_SET_KEY, next.pinSet ? '1' : '0'),
    ]);
  }, []);

  const requestOtp = useCallback(async (phone: string, role: Role = 'artisan') => {
    const res = await authApi.requestOtp(phone, role);
    return res.debug_otp;
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, otp: string, role: Role = 'artisan') => {
      const res = await authApi.verifyOtp(phone, otp, role);
      const next = sessionFromToken(res);
      await persist(phone, next);
      setLastPhone(phone);
      setSession(next);
      return next;
    },
    [persist]
  );

  const pinLogin = useCallback(
    async (phone: string, pin: string) => {
      const res = await authApi.pinLogin(phone, pin);
      const next = sessionFromToken(res);
      await persist(phone, next);
      setLastPhone(phone);
      setSession(next);
      return next;
    },
    [persist]
  );

  const setPin = useCallback(async (pin: string) => {
    await authApi.setPin(pin);
    await tokenStorage.set(PIN_SET_KEY, '1');
    setSession((s) => (s ? { ...s, pinSet: true } : s));
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all([
      tokenStorage.remove(TOKEN_KEY),
      tokenStorage.remove(ROLE_KEY),
      tokenStorage.remove(ARTISAN_ID_KEY),
      tokenStorage.remove(PIN_SET_KEY),
    ]);
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      restoring,
      session,
      lastPhone,
      requestOtp,
      verifyOtp,
      pinLogin,
      setPin,
      signOut,
    }),
    [restoring, session, lastPhone, requestOtp, verifyOtp, pinLogin, setPin, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
