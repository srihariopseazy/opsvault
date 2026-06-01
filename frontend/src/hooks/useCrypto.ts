import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import {
  deriveMasterKey,
  deriveMasterPasswordHash,
  generateSymmetricKey,
  encryptWithKey,
  decryptWithKey,
  wrapSymmetricKey,
  unwrapSymmetricKey,
} from '../crypto/cryptoEngine';
import { setSymmetricKey, lockVault } from '../store/slices/vaultSlice';

// symmetricKey is a base64 string (crypto-js), not a Web Crypto CryptoKey.
export function useCrypto() {
  const dispatch = useDispatch<AppDispatch>();
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);
  const isUnlocked = useSelector((s: RootState) => s.vault.isUnlocked);

  const unlock = useCallback(
    async (
      masterPassword: string,
      email: string,
      protectedSymmetricKey: string,
      iterations: number
    ): Promise<string> => {
      const masterKey = await deriveMasterKey(masterPassword, email, iterations);
      const symKey = await unwrapSymmetricKey(protectedSymmetricKey, masterKey);
      dispatch(setSymmetricKey(symKey));
      return symKey;
    },
    [dispatch]
  );

  const lock = useCallback(() => {
    dispatch(lockVault());
  }, [dispatch]);

  const encryptItem = useCallback(
    async (plaintext: string): Promise<string> => {
      if (!symmetricKey) throw new Error('Vault is locked');
      return encryptWithKey(plaintext, symmetricKey);
    },
    [symmetricKey]
  );

  const decryptItem = useCallback(
    async (cipherString: string): Promise<string> => {
      if (!symmetricKey) throw new Error('Vault is locked');
      return decryptWithKey(cipherString, symmetricKey);
    },
    [symmetricKey]
  );

  return {
    isUnlocked,
    symmetricKey,
    unlock,
    lock,
    encryptItem,
    decryptItem,
    deriveMasterKey,
    deriveMasterPasswordHash,
    generateSymmetricKey,
    wrapSymmetricKey,
    unwrapSymmetricKey,
  };
}
