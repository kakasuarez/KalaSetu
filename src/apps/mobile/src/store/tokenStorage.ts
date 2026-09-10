/**
 * Where the session token lives, per platform.
 *
 * expo-secure-store has NO web implementation -- its web build is literally
 * `export default {}` -- so calling it in a browser throws and takes down every
 * request that reads the token first. Hence this shim.
 *
 * The artisan's real device is Android, where the token sits in the Keystore.
 * The localStorage branch exists so the app is runnable in a browser for
 * development and demos; it is not the security posture of the product.
 */
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

async function nativeGet(key: string): Promise<string | null> {
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(key);
}

async function nativeSet(key: string, value: string): Promise<void> {
  const SecureStore = await import('expo-secure-store');
  await SecureStore.setItemAsync(key, value);
}

async function nativeRemove(key: string): Promise<void> {
  const SecureStore = await import('expo-secure-store');
  await SecureStore.deleteItemAsync(key);
}

/** localStorage throws in private-browsing mode, so every access is guarded. */
function webGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function webSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // A session that cannot be persisted still works for this launch.
  }
}

function webRemove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Nothing to do -- there was nothing stored.
  }
}

export const tokenStorage = {
  async get(key: string): Promise<string | null> {
    return isWeb ? webGet(key) : nativeGet(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (isWeb) return webSet(key, value);
    return nativeSet(key, value);
  },

  async remove(key: string): Promise<void> {
    if (isWeb) return webRemove(key);
    return nativeRemove(key);
  },
};
