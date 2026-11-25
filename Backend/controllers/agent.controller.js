import Agent from "../models/agent.model.js"
import { runAgentWithTools } from "../utils/agentGraph.js"

export const createAgent = async (req, res) => {
  try {
    const { name, knowledgeBase, instructions, tools } = req.body

    if (
      typeof name !== "string" ||
      typeof knowledgeBase !== "string" ||
      typeof instructions !== "string" ||
      !name.trim() ||
      !knowledgeBase.trim() ||
      !instructions.trim()
    ) {
      return res.status(400).json({ message: "Name, knowledge base, and instructions are required" })
    }

    if (!Array.isArray(tools)) {
      return res.status(400).json({ message: "Tools must be an array" })
    }

    const userId = req.user?._id
    const existingAgentName = await Agent.findOne({
      userId,
      name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
    })

    if (existingAgentName) {
      return res.status(409).json({ message: "Agent name should be unique" })
    }

    const agent = await Agent.create({
      name: name.trim(),
      knowledgeBase: knowledgeBase.trim(),
      instructions: instructions.trim(),
      tools: [...new Set(tools.filter((tool) => typeof tool === "string" && tool.trim()).map((tool) => tool.trim()))],
      userId
    })

    return res.status(201).json(agent)
  } catch (error) {
    return res.status(500).json({ message: `create agent error ${error}` })
  }
}

export const getAllAgents = async (req, res) => {
  try {
    const userId = req.user?._id
    const agents = await Agent.find({ userId })
    return res.status(200).json(agents)
  } catch (error) {
    return res.status(500).json({ message: `get all agents error ${error}` })
  }
}

export const getAgentById = async (req, res) => {
  try {
    const userId = req.user?._id
    const agent = await Agent.findOne({
      _id: req.params.id,
      userId
    })

    if (!agent) {
      return res.status(404).json({ message: "agent not found" })
    }

    return res.status(200).json(agent)
  } catch (error) {
    return res.status(500).json({ message: `get agent by id error ${error.message}` })
  }
}

export const deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findOneAndDelete({
      _id: req.params.id,
      userId: req.user?._id
    })

    if (!agent) {
      return res.status(404).json({ message: "agent not found" })
    }

    return res.status(200).json({ message: "agent deleted successfully" })
  } catch (error) {
    return res.status(500).json({ message: `delete agent error ${error.message}` })
  }
}

export const chatWithAgent = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.id,
      userId: req.user?._id
    })

    if (!agent) {
      return res.status(404).json({ message: "agent not found" })
    }

    const { message, history } = req.body
    const hasClientHistory = Array.isArray(history)
    const result = await runAgentWithTools({
      agent,
      message,
      history,
      threadId: req.body.threadId || req.user?._id,
      userId: req.user?._id,
      useCheckpointer: !hasClientHistory || Boolean(req.body.threadId)
    })
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ message: `agent chat error ${error.message}` })
  }
}

