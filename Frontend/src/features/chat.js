import api from "@/api";

export const chat = async (message, threadId) => {
  try {
    const { data } = await api.post("/api/chat", { message, threadId });
    return data;
  } catch (error) {
    console.log(error);
    return error;
  }
};

export const agentChat = async (message, agent, threadId) => {
  try {
    const { data } = await api.post("/api/chat/agent", { message, agent, threadId });
    return data;
  } catch (error) {
    console.log(error);
    return error;
  }
};

export const generateImageCaption = async (imageDataUrl) => {
  const { data } = await api.post("/api/chat/caption", { imageDataUrl });
  return data;
};

export const analyzeUploadedImage = async (imageUrl, prompt) => {
  const { data } = await api.post("/api/chat/analyze-image", { imageUrl, prompt });
  return data;
};

export const decideAgentAction = async (approvalRequest, approved) => {
  const { data } = await api.post("/api/chat/agent/approval", {
    agentId: approvalRequest.agentId,
    threadId: approvalRequest.threadId,
    approvalId: approvalRequest.approvalId,
    approved,
  });
  return data;
};
