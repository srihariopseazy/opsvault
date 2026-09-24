import { authApi } from '../api/authApi';
import {
  deriveMasterKey,
  deriveMasterPasswordHash,
  unwrapSymmetricKey,
  wrapSymmetricKey,
  CURRENT_KDF_ITERATIONS,
} from './cryptoEngine';

export interface KdfMigrationResult {
  newProtectedSymmetricKey: string;
  newKdfIterations: number;
}

/**
 * Silently upgrade an account still below the current KDF floor, right
 * after a successful login/unlock. Best-effort: any failure is logged and
 * swallowed here, never surfaced to the user or allowed to block
 * login/unlock - the account simply stays on its current tier and gets
 * another chance the next time.
 */
export async function maybeUpgradeKdf(
  email: string,
  masterPassword: string,
  oldMasterKey: string,
  currentIterations: number,
  protectedSymmetricKey: string
): Promise<KdfMigrationResult | null> {
  if (currentIterations >= CURRENT_KDF_ITERATIONS) return null;

  try {
    const oldHash = await deriveMasterPasswordHash(oldMasterKey, masterPassword);
    const symmetricKey = await unwrapSymmetricKey(protectedSymmetricKey, oldMasterKey);

    const newMasterKey = await deriveMasterKey(masterPassword, email, CURRENT_KDF_ITERATIONS);
    const newHash = await deriveMasterPasswordHash(newMasterKey, masterPassword);
    const newProtectedSymmetricKey = await wrapSymmetricKey(symmetricKey, newMasterKey);

    await authApi.migrateKdf({
      oldMasterPasswordHash: oldHash,
      newMasterPasswordHash: newHash,
      newProtectedSymmetricKey,
      newKdfIterations: CURRENT_KDF_ITERATIONS,
    });

    return { newProtectedSymmetricKey, newKdfIterations: CURRENT_KDF_ITERATIONS };
  } catch (err) {
    console.error('[kdfMigration] silent upgrade failed (non-fatal):', err);
    return null;
  }
}
