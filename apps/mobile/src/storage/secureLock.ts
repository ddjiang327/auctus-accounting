import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const LOCK_ENABLED_KEY = 'auctus_lock_enabled';
const LOCK_PIN_KEY = 'auctus_lock_pin';

export async function loadLockEnabled() {
  return (await SecureStore.getItemAsync(LOCK_ENABLED_KEY)) === 'true';
}

export async function enableLock(pin: string) {
  await SecureStore.setItemAsync(LOCK_ENABLED_KEY, 'true');
  await SecureStore.setItemAsync(LOCK_PIN_KEY, pin);
}

export async function disableLock() {
  await SecureStore.deleteItemAsync(LOCK_ENABLED_KEY);
  await SecureStore.deleteItemAsync(LOCK_PIN_KEY);
}

export async function verifyPin(pin: string) {
  return pin === await SecureStore.getItemAsync(LOCK_PIN_KEY);
}

export async function tryBiometricUnlock() {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!compatible || !enrolled) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Auctus',
    fallbackLabel: 'Use PIN',
  });
  return result.success;
}
