import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import vaultReducer from './slices/vaultSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    vault: vaultReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // CryptoKey is not serializable — ignore it in vault slice
        ignoredPaths: ['vault.symmetricKey'],
        ignoredActions: ['vault/setSymmetricKey', 'vault/lockVault'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
