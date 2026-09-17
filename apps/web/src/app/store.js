import { configureStore, createSlice } from "@reduxjs/toolkit";
const authSlice = createSlice({
  name: "auth",
  initialState: { user: null, initialized: false },
  reducers: {
    session: (state, action) => {
      state.user = action.payload;
      state.initialized = true;
    },
    clear: (state) => {
      state.user = null;
      state.initialized = true;
    },
  },
});
const uiSlice = createSlice({
  name: "ui",
  initialState: { sidebar: false },
  reducers: {
    toggle: (state) => {
      state.sidebar = !state.sidebar;
    },
  },
});
export const { session, clear } = authSlice.actions;
export const { toggle } = uiSlice.actions;
export const store = configureStore({
  reducer: { auth: authSlice.reducer, ui: uiSlice.reducer },
});
