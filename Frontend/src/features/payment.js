import api from "@/api";

export const createOrder = async (plan) => {
  const { data } = await api.post("/api/payment/create-order", { plan });
  return data;
};

export const verify = async (paymentDetails) => {
  const { data } = await api.post("/api/payment/verify", paymentDetails);
  return data;
};