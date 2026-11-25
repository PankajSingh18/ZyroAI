import express from "express";
import { chatWithAgent, createAgent, deleteAgent, getAllAgents, getAgentById } from "../controllers/agent.controller.js";
import protect from "../middleware/protect.js";

const agentRouter = express.Router();

agentRouter.post("/create", protect, createAgent);
agentRouter.get("/all", protect, getAllAgents);
agentRouter.post("/:id/chat", protect, chatWithAgent);
agentRouter.get("/:id", protect, getAgentById);
agentRouter.delete("/:id", protect, deleteAgent);

export default agentRouter;
