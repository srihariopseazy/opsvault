import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  generateShareKeyPair,
  exportPublicKey,
  storePrivateKey,
  loadPrivateKey,
} from '../utils/keyExchange';
import { sharingApi } from '../api/sharingApi';

const KEY_UPLOADED_FLAG = 'opsvault_share_key_uploaded';

export function useKeyPair() {
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);
  const isUnlocked   = useSelector((s: RootState) => s.vault.isUnlocked);

  useEffect(() => {
    if (!symmetricKey || !isUnlocked) return;

    (async () => {
      try {
        const existingKey = await loadPrivateKey(symmetricKey);

        if (!existingKey || !localStorage.getItem(KEY_UPLOADED_FLAG)) {
          const keyPair   = generateShareKeyPair();
          const publicKey = exportPublicKey(keyPair);

          await sharingApi.uploadPublicKey(publicKey);
          await storePrivateKey(keyPair, symmetricKey);
          localStorage.setItem(KEY_UPLOADED_FLAG, '1');
        }
      } catch {
        // Non-critical — user can still use the vault without share keys
      }
    })();
  }, [symmetricKey, isUnlocked]);
}
