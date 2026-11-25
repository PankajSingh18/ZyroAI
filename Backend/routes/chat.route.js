import express from "express";

import protect from "../middleware/protect.js";
import {
  agentChat,
  analyzeUploadedImage,
  chat,
  decideAgentAction,
  generateImageCaption,
} from "../controllers/chat.controller.js";

const chatRouter = express.Router();

chatRouter.post("/", protect, chat);
chatRouter.post("/agent", protect, agentChat);
chatRouter.post("/analyze-image", protect, analyzeUploadedImage);
chatRouter.post("/agent/approval", protect, decideAgentAction);
chatRouter.post("/caption", protect, generateImageCaption);

export default chatRouter;
