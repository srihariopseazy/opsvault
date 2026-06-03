import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface CustomField {
  type: 'text' | 'hidden' | 'boolean';
  name: string;
  value: string;
}

export interface DecryptedVaultItem {
  uuid: string;
  type: 'login' | 'note' | 'card' | 'identity';
  name: string;
  notes?: string;
  favorite: boolean;
  folderId?: string;
  itemData: Record<string, unknown>;
  customFields?: CustomField[] | null;
  totpSecret?: string;
  passwordHistory?: unknown;
  reprompt: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  revisionDate?: string;
}

// symmetricKey is now a base64 string (crypto-js), not a CryptoKey object.
// This is fully serializable so no Redux serializableCheck overrides are needed.
interface VaultState {
  isUnlocked: boolean;
  symmetricKey: string | null;
  items: DecryptedVaultItem[];
  loading: boolean;
  error: string | null;
}

const initialState: VaultState = {
  isUnlocked: false,
  symmetricKey: null,
  items: [],
  loading: false,
  error: null,
};

const vaultSlice = createSlice({
  name: 'vault',
  initialState,
  reducers: {
    setSymmetricKey(state, action: PayloadAction<string>) {
      state.symmetricKey = action.payload;
      state.isUnlocked = true;
    },
    setItems(state, action: PayloadAction<DecryptedVaultItem[]>) {
      state.items = action.payload;
    },
    addItem(state, action: PayloadAction<DecryptedVaultItem>) {
      state.items.push(action.payload);
    },
    updateItem(state, action: PayloadAction<DecryptedVaultItem>) {
      const idx = state.items.findIndex((i) => i.uuid === action.payload.uuid);
      if (idx !== -1) state.items[idx] = action.payload;
    },
    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => i.uuid !== action.payload);
    },
    lockVault(state) {
      state.isUnlocked = false;
      state.symmetricKey = null;
      state.items = [];
      state.error = null;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
});

export const {
  setSymmetricKey,
  setItems,
  addItem,
  updateItem,
  removeItem,
  lockVault,
  setLoading,
  setError,
} = vaultSlice.actions;

export default vaultSlice.reducer;
