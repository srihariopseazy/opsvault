import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  personalVaultDisabled: boolean;
  sendDisabled: boolean;
}

const initialState: UIState = {
  personalVaultDisabled: false,
  sendDisabled: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setPersonalVaultDisabled(state, action: PayloadAction<boolean>) {
      state.personalVaultDisabled = action.payload;
    },
    setSendDisabled(state, action: PayloadAction<boolean>) {
      state.sendDisabled = action.payload;
    },
  },
});

export const { setPersonalVaultDisabled, setSendDisabled } = uiSlice.actions;
export default uiSlice.reducer;
