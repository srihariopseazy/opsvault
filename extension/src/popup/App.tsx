import { useEffect, useState, useCallback } from 'react';
import LoginPage from './pages/Login';
import VaultPage from './pages/Vault';
import ItemDetailPage from './pages/ItemDetail';
import type { DecryptedVaultItem } from '../shared/types';

type Page = 'login' | 'vault' | 'detail';

interface AppState {
  page: Page;
  isLoading: boolean;
  isLocked: boolean;
  email?: string;
  server?: string;
  items: DecryptedVaultItem[];
  selectedItem: DecryptedVaultItem | null;
  currentTabUrl: string;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    page: 'vault',
    isLoading: true,
    isLocked: true,
    items: [],
    selectedItem: null,
    currentTabUrl: '',
  });

  const send = useCallback(<T,>(type: string, payload?: unknown): Promise<T> =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (res?.error) reject(new Error(res.error));
        else resolve(res as T);
      });
    }), []);

  const checkState = useCallback(async () => {
    try {
      const swState = await send<{ isLocked: boolean; email?: string; server?: string; itemCount: number }>('GET_STATE');

      // Get current tab URL
      let currentTabUrl = '';
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTabUrl = tab?.url ?? '';
      } catch { /* extension may not have tabs permission yet */ }

      if (!swState.isLocked) {
        const items = await send<DecryptedVaultItem[]>('GET_ITEMS');
        setState((s) => ({
          ...s,
          isLoading: false,
          isLocked: false,
          email: swState.email,
          server: swState.server,
          items,
          currentTabUrl,
          page: 'vault',
        }));
      } else {
        setState((s) => ({
          ...s,
          isLoading: false,
          isLocked: true,
          email: swState.email,
          server: swState.server,
          currentTabUrl,
          page: 'login',
        }));
      }
    } catch {
      setState((s) => ({ ...s, isLoading: false, isLocked: true, page: 'login' }));
    }
  }, [send]);

  useEffect(() => { checkState(); }, [checkState]);

  const handleLoggedIn = useCallback((items: DecryptedVaultItem[]) => {
    setState((s) => ({ ...s, isLocked: false, items, page: 'vault' }));
  }, []);

  const handleLock = useCallback(async () => {
    await send('LOCK');
    setState((s) => ({ ...s, isLocked: true, items: [], selectedItem: null, page: 'login' }));
  }, [send]);

  const handleSelectItem = useCallback((item: DecryptedVaultItem) => {
    setState((s) => ({ ...s, selectedItem: item, page: 'detail' }));
  }, []);

  const handleBack = useCallback(() => {
    setState((s) => ({ ...s, selectedItem: null, page: 'vault' }));
  }, []);

  if (state.isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div style={{ color: '#6b7280', fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  if (state.page === 'login') {
    return <LoginPage onLoggedIn={handleLoggedIn} savedEmail={state.email} savedServer={state.server} />;
  }

  if (state.page === 'detail' && state.selectedItem) {
    return (
      <ItemDetailPage
        item={state.selectedItem}
        currentTabUrl={state.currentTabUrl}
        onBack={handleBack}
        onLock={handleLock}
      />
    );
  }

  return (
    <VaultPage
      items={state.items}
      currentTabUrl={state.currentTabUrl}
      email={state.email ?? ''}
      onSelectItem={handleSelectItem}
      onLock={handleLock}
    />
  );
}
