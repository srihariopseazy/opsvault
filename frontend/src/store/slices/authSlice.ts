import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AuthUser {
  uuid: string;
  email: string;
  name: string;
  totp_enabled?: boolean;
  is_superuser?: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  protectedSymmetricKey: string | null;
  kdfIterations: number;
}

// Load persisted auth state from localStorage
function loadAuthState(): Partial<AuthState> {
  try {
    const raw = localStorage.getItem('opsvault_auth');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Save auth state to localStorage
function saveAuthState(state: AuthState) {
  try {
    localStorage.setItem('opsvault_auth', JSON.stringify({
      isAuthenticated: state.isAuthenticated,
      user: state.user,
      protectedSymmetricKey: state.protectedSymmetricKey,
      kdfIterations: state.kdfIterations,
    }));
  } catch { /* ignore */ }
}

const persisted = loadAuthState();

const initialState: AuthState = {
  isAuthenticated: persisted.isAuthenticated ?? false,
  user: persisted.user ?? null,
  protectedSymmetricKey: persisted.protectedSymmetricKey ?? null,
  kdfIterations: persisted.kdfIterations ?? 600000,
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
      saveAuthState(state);
    },
    clearAuth(state) {
      state.isAuthenticated = false;
      state.user = null;
      state.protectedSymmetricKey = null;
      state.kdfIterations = 600000;
      localStorage.removeItem('opsvault_auth');
    },
    updateProtectedSymmetricKey(state, action: PayloadAction<string>) {
      state.protectedSymmetricKey = action.payload;
      saveAuthState(state);
    },
  },
});

export const { setAuth, clearAuth, updateProtectedSymmetricKey } = authSlice.actions;
export default authSlice.reducer;