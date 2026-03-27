import { configureStore } from '@reduxjs/toolkit';
import marketSlice from './marketSlice.js';

export const store = configureStore({
  reducer: {
    market: marketSlice,
  },
});