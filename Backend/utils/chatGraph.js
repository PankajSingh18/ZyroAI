import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";

const getChatModel = () => {
  if (process.env.GROQ_API_KEY) {
    return new ChatGroq({
      model: "openai/gpt-oss-120b",
      temperature: 0,
      maxTokens: 1024,
      maxRetries: 2,
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("GROQ_API_KEY or OPENROUTER_API_KEY is not configured");
  }

  return new ChatOpenAI({
    model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    temperature: 0,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });
};

const chatNode = async (state) => {
  const model = getChatModel();
  const contextMessages = prepareChatContext(state.messages);
  const response = await model.invoke(contextMessages);
  return { messages: [response] };
};

const prepareChatContext = (messages) => {
  const recentMessages = [];
  let remainingChars = 6000;

  for (const message of [...messages].reverse()) {
    const type = message?._getType?.() || message?.type;
    if (!["human", "ai", "system"].includes(type)) continue;

    const content = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
          .map((item) => typeof item === "string" ? item : item?.text || "")
          .join("\n")
        : "";
    if (!content.trim() || remainingChars <= 0) continue;

    const limitedContent = content.slice(0, Math.min(1500, remainingChars));
    const MessageClass = type === "human"
      ? HumanMessage
      : type === "ai"
        ? AIMessage
        : SystemMessage;
    recentMessages.push(new MessageClass(limitedContent));
    remainingChars -= limitedContent.length;
  }

  return recentMessages.reverse();
};

const mongoClient = process.env.MONGO_URI
  ? new MongoClient(process.env.MONGO_URI)
  : null;

const checkpointer = mongoClient
  ? new MongoDBSaver({
      client: mongoClient,
      dbName: "langgraph",
      checkpointCollectionName: "checkpoints",
      checkpointWritesCollectionName: "checkpoint_writes",
    })
  : null;

let checkpointerSetup;

const setupCheckpointer = async () => {
  if (!checkpointer) return;
  if (!checkpointerSetup) {
    checkpointerSetup = checkpointer.setup();
  }
  const errors = await checkpointerSetup;
  if (errors.length) {
    throw new Error(errors[0].message);
  }
};

export const setupChatCheckpointer = setupCheckpointer;

export const chatGraph = new StateGraph(MessagesAnnotation)
  .addNode("chat", chatNode)
  .addEdge(START, "chat")
  .addEdge("chat", END)
  .compile({ checkpointer: checkpointer || undefined });

export const runAgentChat = async ({ agent, message, history = [] }) => {
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Message is required");
  }

  const systemText = [
    agent?.instructions ? `Instructions: ${agent.instructions}` : "",
    agent?.knowledgeBase ? `Knowledge base: ${agent.knowledgeBase}` : "",
  ].filter(Boolean).join("\n\n");

  const messages = [];
  if (systemText) messages.push(new SystemMessage(systemText));

  for (const item of history) {
    if (item?.role === "assistant") messages.push(new AIMessage(item.content));
    if (item?.role === "user") messages.push(new HumanMessage(item.content));
  }

  messages.push(new HumanMessage(message.trim()));

  await setupCheckpointer();

  const threadId = String(agent?._id || "anonymous");
  const result = await chatGraph.invoke(
    { messages },
    { configurable: { thread_id: threadId } }
  );
  const assistantMessage = result.messages.at(-1);

  return {
    content: typeof assistantMessage?.content === "string"
      ? assistantMessage.content
      : JSON.stringify(assistantMessage?.content ?? ""),
  };
};