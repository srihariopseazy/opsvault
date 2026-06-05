import { useEffect, useState, useCallback, useRef } from 'react';
import { offlineCache } from '../utils/offlineCache';
import { vaultApi } from '../api/vaultApi';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const isSyncing = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const mutations = await offlineCache.getPendingMutations();
      setPendingCount(mutations.length);
    } catch {
      /* IndexedDB unavailable */
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (isSyncing.current || !navigator.onLine) return;
    isSyncing.current = true;
    setSyncStatus('syncing');
    try {
      const mutations = await offlineCache.getPendingMutations();
      for (const m of mutations) {
        try {
          if (m.action === 'delete') {
            await vaultApi.deleteItem(m.uuid);
          } else if (m.action === 'create' && m.payload) {
            await vaultApi.createItem(m.payload as Parameters<typeof vaultApi.createItem>[0]);
          } else if (m.action === 'update' && m.payload) {
            await vaultApi.updateItem(m.uuid, m.payload as Parameters<typeof vaultApi.updateItem>[1]);
          }
          if (m.id != null) await offlineCache.clearPendingMutation(m.id);
        } catch {
          // Keep failed mutation in queue
        }
      }
      await refreshPendingCount();
      setSyncStatus('idle');
    } catch {
      setSyncStatus('error');
    } finally {
      isSyncing.current = false;
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_REQUIRED') syncNow();
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    refreshPendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, [syncNow, refreshPendingCount]);

  return { isOnline, pendingCount, syncStatus, syncNow, refreshPendingCount };
}
