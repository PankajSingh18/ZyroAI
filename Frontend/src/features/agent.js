import api from "@/api"

export const createAgent = async (agent) => {
  const { data } = await api.post("/api/agent/create", agent)
  return data
}

export const getAllAgents = async () => {
  const { data } = await api.get("/api/agent/all")
  return data
}

export const deleteAgent = async (id) => {
  const { data } = await api.delete(`/api/agent/${id}`)
  return data
}

export const chatWithAgent = async (id, message, history = []) => {
  const { data } = await api.post(`/api/agent/${id}/chat`, { message, history })
  return data
}