import type { StoredCredentials, SessionData } from './types';

/** Credentials stored persistently (survive browser restart) */
export async function getCredentials(): Promise<StoredCredentials | null> {
  const result = await chrome.storage.local.get('credentials');
  return result.credentials ?? null;
}

export async function setCredentials(creds: StoredCredentials): Promise<void> {
  await chrome.storage.local.set({ credentials: creds });
}

export async function clearCredentials(): Promise<void> {
  await chrome.storage.local.remove('credentials');
}

/** Session data: symmetric key + decrypted items (cleared on browser close) */
export async function getSession(): Promise<SessionData | null> {
  try {
    const result = await chrome.storage.session.get('session');
    return result.session ?? null;
  } catch {
    // chrome.storage.session may not be available in older Chrome
    const result = await chrome.storage.local.get('_session');
    return result._session ?? null;
  }
}

export async function setSession(data: SessionData): Promise<void> {
  try {
    await chrome.storage.session.set({ session: data });
  } catch {
    await chrome.storage.local.set({ _session: data });
  }
}

export async function clearSession(): Promise<void> {
  try {
    await chrome.storage.session.remove('session');
  } catch {
    await chrome.storage.local.remove('_session');
  }
}

/** Auto-lock timeout in minutes (stored locally) */
export async function getAutoLockMinutes(): Promise<number> {
  const result = await chrome.storage.local.get('autoLockMinutes');
  return result.autoLockMinutes ?? 15;
}

export async function setAutoLockMinutes(minutes: number): Promise<void> {
  await chrome.storage.local.set({ autoLockMinutes: minutes });
}
