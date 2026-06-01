import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import vaultReducer from './slices/vaultSlice';

// symmetricKey is now a plain base64 string (crypto-js), so no serializable
// check overrides are needed — Redux can handle it without special configuration.
export const store = configureStore({
  reducer: {
    auth: authReducer,
    vault: vaultReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
