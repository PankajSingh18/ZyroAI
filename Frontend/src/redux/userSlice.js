import { createSlice } from '@reduxjs/toolkit'

export const usersSlice = createSlice({
  name: 'user',
  initialState: {
    userData: null
  },
  reducers: {
    setUserData: (state, action) => {
      state.userData = action.payload
    }
  }
})

// Action creators are generated for each case reducer function
export const { setUserData } = usersSlice.actions
export default usersSlice.reducer
