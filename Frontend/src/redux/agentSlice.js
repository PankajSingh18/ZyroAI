import { createSlice } from "@reduxjs/toolkit";

const agentSlice = createSlice({
  name: "agent",
  initialState: {
    agents: [],
    selectedAgent: null,
    agentsLoading: false,
  },
  reducers: {
    setAgents: (state, action) => {
      state.agents = action.payload;
    },
    setSelectedAgent: (state, action) => {
      state.selectedAgent = action.payload;
    },
    setAgentsLoading: (state, action) => {
      state.agentsLoading = action.payload;
    },
  },
});

export const { setAgents, setSelectedAgent, setAgentsLoading } = agentSlice.actions;
export default agentSlice.reducer;