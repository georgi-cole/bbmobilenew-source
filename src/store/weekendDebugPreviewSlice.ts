import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
  captureWeekendDebugSnapshot,
  restoreWeekendDebugSnapshot,
  type WeekendDebugSnapshot,
} from '../features/weekend/weekendDebugActions'

interface WeekendDebugPreviewState {
  snapshot: WeekendDebugSnapshot | null
}

const initialState: WeekendDebugPreviewState = { snapshot: null }

const weekendDebugPreviewSlice = createSlice({
  name: 'weekendDebugPreview',
  initialState,
  reducers: {
    clearWeekendDebugSnapshot(state) {
      state.snapshot = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(
        captureWeekendDebugSnapshot,
        (state, action: PayloadAction<WeekendDebugSnapshot>) => {
          state.snapshot = action.payload
        }
      )
      .addCase(restoreWeekendDebugSnapshot, (state) => {
        state.snapshot = null
      })
  },
})

export const { clearWeekendDebugSnapshot } = weekendDebugPreviewSlice.actions
export default weekendDebugPreviewSlice.reducer
