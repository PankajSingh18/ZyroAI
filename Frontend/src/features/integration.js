import api from "@/api"

export const getIntegrations = async () => {
  const { data } = await api.get("/api/integration")
  return data
}

export const getAllIntegrations = async () => {
  const { data } = await api.get("/api/integration/all")
  return data
}

export const connectGoogle = async () => {
  const { data } = await api.get("/api/integration/google")
  return data
}

export const disconnectGoogle = async () => {
  const { data } = await api.delete("/api/integration/google")
  return data
}

export const connectInstagram = async () => {
  const { data } = await api.get("/api/integration/instagram/connect")
  return data
}

export const disconnectInstagram = async () => {
  const { data } = await api.get("/api/integration/instagram/disconnect")
  return data
}
