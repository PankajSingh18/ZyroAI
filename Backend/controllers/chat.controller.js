import { HumanMessage } from "@langchain/core/messages";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { chatGraph, setupChatCheckpointer } from "../utils/chatGraph.js";
import Agent from "../models/agent.model.js";
import {
  analyzeImageWithMcp,
  generateCaption,
  resumeAgentWithApproval,
  runAgentWithTools,
} from "../utils/agentGraph.js";
import { deductCredits } from "../utils/deductCredits.js";

const CHAT_CREDIT_COST = 2;
const APPROVAL_CREDIT_COST = 10;

const isValidThreadId = (threadId) =>
  typeof threadId === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(threadId);

const normalizeMessageContent = (content) => {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (item?.type === "text" && typeof item.text === "string") return item.text;
      return "";
    })
    .join("")
    .trim();
};

export const chat = async (req, res) => {
  try {
    const { message, threadId: requestedThreadId } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    const threadId = String(requestedThreadId || req.user?._id || "");
    if (!threadId) {
      return res.status(400).json({ message: "Thread ID is required" });
    }

    await setupChatCheckpointer();

    const result = await chatGraph.invoke(
      { messages: [new HumanMessage(message.trim())] },
      { configurable: { thread_id: threadId } }
    );

    const assistantMessage = result.messages?.at(-1);
    const content = typeof assistantMessage?.content === "string"
      ? assistantMessage.content
      : Array.isArray(assistantMessage?.content)
        ? assistantMessage.content
          .filter((item) => item?.type === "text" || typeof item === "string")
          .map((item) => typeof item === "string" ? item : item.text)
          .join("")
        : "";

    if (!content) {
      throw new Error("AI returned an empty response");
    }

    await deductCredits({ userId: req.user._id, credits: CHAT_CREDIT_COST });

    return res.status(200).json({
      content,
      threadId,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      message: `chat error ${error.message}`,
    });
  }
};

export const generateImageCaption = async (req, res) => {
  try {
    const { imageDataUrl } = req.body;
    if (
      typeof imageDataUrl !== "string" ||
      imageDataUrl.length > 7 * 1024 * 1024 ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        imageDataUrl,
      )
    ) {
      return res.status(400).json({
        message: "Please upload a JPEG, PNG, or WebP image up to 5 MB.",
      });
    }

    const caption = await generateCaption(imageDataUrl);
    if (!caption) {
      throw new Error("Gemini returned an empty caption");
    }
    await deductCredits({ userId: req.user._id, credits: CHAT_CREDIT_COST });
    return res.status(200).json({ caption });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      message: `Image caption generation failed: ${error.message}`,
    });
  }
};

export const analyzeUploadedImage = async (req, res) => {
  const { imageUrl, prompt } = req.body || {};
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return res.status(400).json({ message: "Image URL is required" });
  }
  if (
    prompt !== undefined &&
    (typeof prompt !== "string" || prompt.length > 2200)
  ) {
    return res
      .status(400)
      .json({ message: "Image prompt must be 2200 characters or fewer" });
  }

  try {
    const analysis = await analyzeImageWithMcp({
      userId: req.user._id,
      imageUrl: imageUrl.trim(),
      prompt: prompt?.trim() || "Describe this image clearly and accurately.",
    });
    await deductCredits({ userId: req.user._id, credits: CHAT_CREDIT_COST });
    return res.status(200).json({ analysis });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      message: `Image analysis failed: ${error.message}`,
    });
  }
};

export const agentChat = async (req, res) => {
  try {
    const { message, agent: agentInput } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    let existingAgent;
    if (agentInput && typeof agentInput === "object" && agentInput._id) {
      existingAgent = await Agent.findOne({ _id: agentInput._id, userId: req.user._id });
    } else if (agentInput && typeof agentInput === "object" && agentInput.name) {
      existingAgent = await Agent.findOne({ name: agentInput.name, userId: req.user._id });
    } else if (typeof agentInput === "string") {
      existingAgent = await Agent.findOne({ name: agentInput, userId: req.user._id });
    }

    if (!existingAgent) {
      return res.status(400).json({ message: "Agent not found" });
    }

    const threadId = req.body.threadId || randomUUID();
    if (!isValidThreadId(threadId)) {
      return res.status(400).json({ message: "Invalid agent conversation ID." });
    }
    const result = await runAgentWithTools({
      agent: existingAgent,
      message: message.trim(),
      history: [],
      threadId,
      userId: req.user._id,
      useCheckpointer: true,
    });

    if (!result.approvalRequest && !result.content) {
      return res.status(500).json({ message: "The agent returned an empty reply" });
    }

    await deductCredits({ userId: req.user._id, credits: CHAT_CREDIT_COST });

    if (result.approvalRequest) {
      return res.status(200).json({
        aiResponse: "Please review this action and approve or reject it.",
        approvalRequest: {
          ...result.approvalRequest,
          threadId,
          agentId: String(existingAgent._id),
        },
        interrupted: result.interrupted,
        interrupts: result.interrupts,
        agentId: String(existingAgent._id),
        threadId,
      });
    }

    return res.status(200).json({
      aiResponse: result.content,
      interrupted: result.interrupted,
      interrupts: result.interrupts,
      agentId: String(existingAgent._id),
      threadId,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.toLowerCase().includes("model_not_found") ||
      message.toLowerCase().includes("does not exist") ||
      message.toLowerCase().includes("do not have access")
    ) {
      return res.status(503).json({
        message: "Configured Groq model is unavailable. Please update GROQ_MODEL or select an enabled model.",
      });
    }
    return res.status(error?.statusCode || 500).json({
      message: `agent chat controller error ${error.message}`,
    });
  }
};

export const decideAgentAction = async (req, res) => {
  try {
    const { agentId, threadId, approvalId, approved } = req.body;
    if (
      typeof agentId !== "string" ||
      !mongoose.isValidObjectId(agentId) ||
      !isValidThreadId(threadId) ||
      typeof approvalId !== "string" ||
      approvalId.length === 0 ||
      approvalId.length > 256 ||
      typeof approved !== "boolean"
    ) {
      return res.status(400).json({
        message: "A valid pending action and approve/reject decision are required.",
      });
    }

    const existingAgent = await Agent.findOne({
      _id: agentId,
      userId: req.user._id,
    });
    if (!existingAgent) {
      return res.status(404).json({ message: "Agent not found." });
    }

    const result = await resumeAgentWithApproval({
      agent: existingAgent,
      userId: req.user._id,
      threadId,
      approvalId,
      approved,
      claimApproval: async () => {
        await mongoose.connection.asPromise();
        const approvals = mongoose.connection.db.collection("consumed_action_approvals");
        await approvals.createIndex(
          { expiresAt: 1 },
          { expireAfterSeconds: 0 },
        );
        try {
          await approvals.insertOne({
            _id: `${String(req.user._id)}:${agentId}:${approvalId}`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
        } catch (error) {
          if (error?.code === 11000) {
            const duplicateError = new Error("This approval request has already been used.");
            duplicateError.statusCode = 409;
            throw duplicateError;
          }
          throw error;
        }
      },
    });

    if (approved) {
      await deductCredits({
        userId: req.user._id,
        credits: APPROVAL_CREDIT_COST,
      });
    }

    const nextApprovalRequest = result.approvalRequest
      ? {
          ...result.approvalRequest,
          threadId,
          agentId,
        }
      : undefined;
    return res.status(200).json({
      aiResponse: nextApprovalRequest
        ? "Please review this action and approve or reject it."
        : result.content || (approved ? "Action completed." : "Action rejected."),
      decision: approved ? "approved" : "rejected",
      interrupted: result.interrupted,
      interrupts: result.interrupts,
      agentId,
      ...(nextApprovalRequest ? { approvalRequest: nextApprovalRequest } : {}),
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      message: `Unable to process action approval: ${error.message}`,
    });
  }
};
