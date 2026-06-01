import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AuthUser {
  uuid: string;
  email: string;
  name: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  protectedSymmetricKey: string | null;
  kdfIterations: number;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  protectedSymmetricKey: null,
  kdfIterations: 600000,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth(
      state,
      action: PayloadAction<{
        user: AuthUser;
        protectedSymmetricKey: string;
        kdfIterations: number;
      }>
    ) {
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.protectedSymmetricKey = action.payload.protectedSymmetricKey;
      state.kdfIterations = action.payload.kdfIterations;
    },
    clearAuth(state) {
      state.isAuthenticated = false;
      state.user = null;
      state.protectedSymmetricKey = null;
      state.kdfIterations = 600000;
    },
    updateProtectedSymmetricKey(state, action: PayloadAction<string>) {
      state.protectedSymmetricKey = action.payload;
    },
  },
});

export const { setAuth, clearAuth, updateProtectedSymmetricKey } = authSlice.actions;
export default authSlice.reducer;
