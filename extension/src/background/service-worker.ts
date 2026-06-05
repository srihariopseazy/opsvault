import { getCredentials, getSession, setSession, clearSession, getAutoLockMinutes } from '../shared/storage';
import { deriveMasterKey, unwrapSymmetricKey, decryptWithKey } from '../shared/crypto';
import { syncVault } from '../shared/api';
import type { DecryptedVaultItem, LoginItemData, SessionData } from '../shared/types';

const SYNC_ALARM   = 'vault-sync';
const LOCK_ALARM   = 'auto-lock';
const SYNC_PERIOD  = 5; // minutes

// ── Alarm setup ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) {
    await backgroundSync();
  } else if (alarm.name === LOCK_ALARM) {
    await clearSession();
  }
});

// ── Background sync ───────────────────────────────────────────────────────────

async function backgroundSync(): Promise<void> {
  const session = await getSession();
  if (!session) return; // locked — nothing to sync

  const creds = await getCredentials();
  if (!creds) return;

  try {
    const rawItems = await syncVault(creds);
    const items = await decryptItems(rawItems, session.symmetricKey);
    await setSession({ ...session, items, lastSync: Date.now() });
  } catch {
    // Silently fail — next popup open will trigger full re-sync
  }
}

async function decryptItems(
  rawItems: Array<{ uuid: string; name: string; item_data: unknown; type: string; notes?: string; favorite: boolean; deleted_at?: string; updated_at?: string }>,
  symKey: string,
): Promise<DecryptedVaultItem[]> {
  const result: DecryptedVaultItem[] = [];
  for (const raw of rawItems) {
    if (raw.deleted_at) continue;
    try {
      const name    = decryptWithKey(raw.name as string, symKey);
      const dataStr = decryptWithKey(raw.item_data as string, symKey);
      const notes   = raw.notes ? decryptWithKey(raw.notes, symKey) : undefined;
      result.push({
        uuid: raw.uuid,
        type: raw.type as DecryptedVaultItem['type'],
        name,
        notes,
        favorite: raw.favorite,
        itemData: JSON.parse(dataStr) as LoginItemData,
        updated_at: raw.updated_at,
      });
    } catch {
      // Skip undecryptable items
    }
  }
  return result;
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    sendResponse({ error: err instanceof Error ? err.message : String(err) });
  });
  return true; // keep channel open for async
});

async function handleMessage(msg: { type: string; payload?: unknown }): Promise<unknown> {
  switch (msg.type) {
    case 'GET_STATE': {
      const session = await getSession();
      const creds   = await getCredentials();
      return {
        isLocked: !session,
        email: creds?.email,
        server: creds?.server,
        itemCount: session?.items.length ?? 0,
      };
    }

    case 'LOGIN': {
      const { symmetricKey, rawItems, credentials } = msg.payload as {
        symmetricKey: string;
        rawItems: Parameters<typeof decryptItems>[0];
        credentials: Awaited<ReturnType<typeof getCredentials>>;
      };
      const items = await decryptItems(rawItems, symmetricKey);
      const session: SessionData = { symmetricKey, items, lastSync: Date.now() };
      await setSession(session);

      // Reset auto-lock alarm
      const lockMins = await getAutoLockMinutes();
      await chrome.alarms.create(LOCK_ALARM, { delayInMinutes: lockMins });

      return { success: true, itemCount: items.length };
    }

    case 'LOCK':
      await clearSession();
      await chrome.alarms.clear(LOCK_ALARM);
      return { success: true };

    case 'LOGOUT':
      await clearSession();
      await chrome.alarms.clear(LOCK_ALARM);
      const { clearCredentials } = await import('../shared/storage');
      await clearCredentials();
      return { success: true };

    case 'GET_ITEMS': {
      const session = await getSession();
      return session?.items ?? [];
    }

    case 'SYNC_VAULT': {
      await backgroundSync();
      const session = await getSession();
      return { itemCount: session?.items.length ?? 0 };
    }

    default:
      return { error: 'Unknown message type' };
  }
}
