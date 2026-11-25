import dotenv from "dotenv";
dotenv.config();
import { ChatGroq } from "@langchain/groq";
import {
  Command,
  interrupt,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  isAIMessage,
  isHumanMessage,
  isSystemMessage,
  isToolMessage,
} from "@langchain/core/messages";
import { getMcpTools } from "../mcp/langgraph-mcp.js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const REASONING_MODELS = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3-32b",
  "deepseek-r1-distill-llama-70b",
  "qwen-qwq-32b",
]);

const MODEL_CANDIDATES = [
  ...new Set(
    [
      process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "llama-3.3-70b-versatile",
      "openai/gpt-oss-20b",
    ].filter(Boolean),
  ),
];

const baseModels = new Map(
  MODEL_CANDIDATES.map((modelName) => [
    modelName,
    new ChatGroq({
      model: modelName,
      temperature: 0,
      maxTokens: 1536,
      maxRetries: 0,
      apiKey: process.env.GROQ_API_KEY,
      ...(REASONING_MODELS.has(modelName) ? { reasoningEffort: "low" } : {}),
    }),
  ]),
);

export const generateCaption = async (imageInput) => {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY is not configured");
  }

  let contentType;
  let base64Image;
  const dataUrlMatch = imageInput.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );

  if (dataUrlMatch) {
    [, contentType, base64Image] = dataUrlMatch;
  } else {
    const imageUrl = new URL(imageInput);
    if (imageUrl.protocol !== "https:") {
      throw new Error("Image URL must use HTTPS");
    }

    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image. Status: ${imageResponse.status}`);
    }

    const contentLength = Number(imageResponse.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024) {
      throw new Error("Image must be 5 MB or smaller");
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      throw new Error("Image must be 5 MB or smaller");
    }
    contentType = imageResponse.headers.get("content-type")?.split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      throw new Error("Image must be JPEG, PNG, or WebP");
    }
    base64Image = Buffer.from(arrayBuffer).toString("base64");
  }

  if (Buffer.from(base64Image, "base64").byteLength > 5 * 1024 * 1024) {
    throw new Error("Image must be 5 MB or smaller");
  }

  const imageAnalyzer = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: 0,
    maxRetries: 2,
    apiKey,
  });

  const message = new HumanMessage({
    content: [
      {
        type: "text",
        text: "Analyze this image and generate a catchy social media caption with relevant hashtags. STRICT RULE: Do not include greetings, introductory text, explanations, or conversational filler (like 'Sure', 'Here is a caption'). Output ONLY the caption and hashtags.",
      },
      {
        type: "image_url",
        image_url: `data:${contentType};base64,${base64Image}`,
      },
    ],
  });

  const response = await imageAnalyzer.invoke([message]);
  return extractTextContent(response?.content);
};

const isRateLimitError = (error) => {
  const status = error?.status ?? error?.response?.status;
  const msg = String(error?.message || "");
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("rate_limit_exceeded") ||
    msg.toLowerCase().includes("rate limit")
  );
};

const isToolSchemaOrCallError = (error) => {
  const status = error?.status ?? error?.response?.status;
  const msg = String(error?.message || "");
  return status === 400 && msg.includes("tool_use_failed");
};

const isModelUnavailableError = (error) => {
  const status = error?.status ?? error?.response?.status;
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || error?.response?.data?.error?.code || "").toLowerCase();
  return (
    status === 404 ||
    code.includes("model_not_found") ||
    msg.includes("model_not_found") ||
    msg.includes("does not exist") ||
    msg.includes("do not have access to it")
  );
};

const client = new MongoClient(
  process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017",
);
const checkpointer = new MongoDBSaver({ client, dbName: "langgraph" });

let cachedMcpTools = null;
let mcpToolsPromise = null;

const findTool = (tools, names) => {
  return tools.find((tool) =>
    names?.some((name) => tool.name === name || tool.name.endsWith(`_${name}`)),
  );
};

const getCachedMcpTools = async () => {
  if (cachedMcpTools) return cachedMcpTools;
  if (!mcpToolsPromise) {
    mcpToolsPromise = getMcpTools()
      .then((tools) => {
        cachedMcpTools = tools;
        return tools;
      })
      .catch((error) => {
        mcpToolsPromise = null;
        throw error;
      });
  }
  return mcpToolsPromise;
};

const makeAuthToken = (userId) => {
  if (!userId) {
    throw new Error("User ID is required for MCP authentication");
  }
  if (!process.env.MCP_AUTH_SECRET) {
    throw new Error("MCP_AUTH_SECRET is not configured");
  }

  return jwt.sign({}, process.env.MCP_AUTH_SECRET, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: "2m",
    issuer: "automate-backend",
    audience: "automate-mcp",
  });
};

const extractTextContent = (content) => {
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

export const analyzeImageWithMcp = async ({ userId, imageUrl, prompt }) => {
  const tool = findTool(await getCachedMcpTools(), ["analyze_image"]);
  if (!tool) {
    throw new Error("Image analysis MCP tool is unavailable");
  }

  const result = await tool.invoke({
    authToken: makeAuthToken(userId),
    imageUrl,
    prompt,
  });
  const analysis =
    typeof result === "string"
      ? result.trim()
      : extractTextContent(result?.content);

  if (!analysis) {
    throw new Error("Image analysis MCP tool returned an empty response");
  }
  return analysis;
};

const limitMessageContext = (message, maxChars = 6000) => {
  if (typeof message?.content !== "string" || message.content.length <= maxChars) {
    return message;
  }

  const truncated = `${message.content.slice(0, maxChars)}\n[content truncated]`;

  if (isToolMessage(message)) {
    return new ToolMessage({
      content: truncated,
      tool_call_id: message.tool_call_id,
      name: message.name,
      status: message.status,
      additional_kwargs: message.additional_kwargs,
      response_metadata: message.response_metadata,
      id: message.id,
    });
  }

  if (isAIMessage(message)) {
    return new AIMessage({
      content: truncated,
      tool_calls: message.tool_calls,
      invalid_tool_calls: message.invalid_tool_calls,
      additional_kwargs: message.additional_kwargs,
      response_metadata: message.response_metadata,
      name: message.name,
      id: message.id,
    });
  }

  if (isHumanMessage(message)) {
    return new HumanMessage({
      content: truncated,
      additional_kwargs: message.additional_kwargs,
      response_metadata: message.response_metadata,
      name: message.name,
      id: message.id,
    });
  }

  if (isSystemMessage(message)) {
    return new SystemMessage({
      content: truncated,
      additional_kwargs: message.additional_kwargs,
      response_metadata: message.response_metadata,
      name: message.name,
      id: message.id,
    });
  }

  return message;
};

const sanitizeToolSequences = (messages) => {
  const sanitized = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];
    if (isAIMessage(msg) && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const expectedIds = new Set(msg.tool_calls.map((tc) => tc.id).filter(Boolean));
      const collectedTools = [];
      let j = i + 1;

      while (j < messages.length && isToolMessage(messages[j])) {
        if (expectedIds.size === 0 || expectedIds.has(messages[j].tool_call_id)) {
          collectedTools.push(messages[j]);
        }
        j++;
      }

      const foundIds = new Set(collectedTools.map((t) => t.tool_call_id));
      const allMatched =
        collectedTools.length > 0 &&
        [...expectedIds].every((id) => foundIds.has(id));

      if (allMatched) {
        sanitized.push(msg, ...collectedTools);
      }
      i = j;
      continue;
    }

    if (isToolMessage(msg)) {
      i++;
      continue;
    }

    sanitized.push(msg);
    i++;
  }

  return sanitized;
};

const prepareMessagesForModel = (
  messages,
  maxHistoryMessages = 4,
  maxToolChars = 2500,
) => {
  const sanitized = sanitizeToolSequences(messages);
  if (sanitized.length === 0) return [];

  const lastHumanIndex = sanitized.findLastIndex((m) => isHumanMessage(m));
  if (lastHumanIndex < 0) {
    return sanitized
      .slice(-maxHistoryMessages)
      .map((message) => limitMessageContext(message, maxToolChars));
  }

  // Drop stale tool calls/outputs from earlier turns so prior payloads don't bloat TPM.
  const priorConversational = sanitized
    .slice(0, lastHumanIndex)
    .filter(
      (m) =>
        isHumanMessage(m) ||
        (isAIMessage(m) && (!m.tool_calls || m.tool_calls.length === 0)),
    )
    .slice(-maxHistoryMessages)
    .map((message) => limitMessageContext(message, 800));

  const currentTurn = sanitized
    .slice(lastHumanIndex)
    .map((message) => limitMessageContext(message, maxToolChars));

  return [...priorConversational, ...currentTurn];
};

const countCurrentTurnToolCalls = (messages) => {
  const lastHumanIndex = messages.findLastIndex((m) => isHumanMessage(m));
  const currentTurnMessages =
    lastHumanIndex >= 0 ? messages.slice(lastHumanIndex + 1) : messages;

  return currentTurnMessages.filter(
    (message) => Array.isArray(message?.tool_calls) && message.tool_calls.length > 0,
  ).length;
};

export const createAgentGraph = async (
  agent,
  userId,
  { useCheckpointer = true } = {},
) => {
  const mcpTools = await getCachedMcpTools();
  const enabledTools = new Set(
    Array.isArray(agent?.tools)
      ? agent.tools.filter((tool) => typeof tool === "string")
      : [],
  );
  const toolAliases = {
    web_search: ["web-search"],
    send_email: ["gmail"],
    email_manager: ["gmail"],
    create_calendar_event: ["google-calendar"],
    calendar_manager: ["google-calendar"],
  };
  const isToolEnabled = (toolName) =>
    enabledTools.has(toolName) ||
    (toolAliases[toolName] || []).some((alias) => enabledTools.has(alias));
  const webSearchMCPTool = findTool(mcpTools, ["web_search"]);
  const sendEmailMCPTool = findTool(mcpTools, ["send_email"]);
  const createCalendarEventMCPTool = findTool(mcpTools, [
    "create_calendar_event",
  ]);
  const listCalendarEventsMCPTool = findTool(mcpTools, [
    "list_calendar_events",
  ]);
  const listEmailsMCPTool = findTool(mcpTools, ["list_emails"]);
  const readEmailMCPTool = findTool(mcpTools, ["read_email"]);
  const publishInstagramPostMCPTool = findTool(mcpTools, [
    "publish_instagram_post",
  ]);
  const analyzeImageMCPTool = findTool(mcpTools, ["analyze_image"]);

  const finalTools = [];

  if (webSearchMCPTool && isToolEnabled("web_search")) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "web_search",
        description: `Search the web for current information, news, tutorials, documentation, and factual questions.`,
        schema: z.object({
          query: z.string().describe("The search query"),
        }),
        func: async ({ query }) => {
          try {
            const result = await webSearchMCPTool.invoke({ query });
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            return error?.message || "error while searching";
          }
        },
      }),
    );
  }

  if (sendEmailMCPTool && isToolEnabled("send_email")) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "send_email",
        description:
          "Send an email via the user's connected Gmail. Infer subject/body when clear; ask only for missing recipient.",
        schema: z.object({
          to: z.string().email().describe("Recipient email address"),
          subject: z.string().trim().min(1).max(200).describe("Email subject"),
          body: z.string().trim().min(1).max(2000).describe("Email body"),
        }),
        func: async ({ to, subject, body }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await sendEmailMCPTool.invoke({
              authToken,
              to,
              subject,
              body,
            });
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            console.error("Gmail MCP error:", error);
            return error?.message || "Failed to send email";
          }
        },
      }),
    );
  }

  if (
    createCalendarEventMCPTool &&
    isToolEnabled("create_calendar_event")
  ) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "create_calendar_event",
        description:
          "Create an event in the user's primary Google Calendar.",
        schema: z.object({
          summary: z.string().trim().min(1).max(200),
          description: z.string().trim().max(5000).nullish(),
          startDateTime: z.string().datetime({ offset: true }),
          endDateTime: z.string().datetime({ offset: true }),
          timeZone: z.string().trim().min(1).default("Asia/Kolkata"),
        }),
        func: async ({
          summary,
          description,
          startDateTime,
          endDateTime,
          timeZone,
        }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await createCalendarEventMCPTool.invoke({
              authToken,
              summary,
              ...(description ? { description } : {}),
              startDateTime,
              endDateTime,
              timeZone,
            });
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            return error?.message || "Failed to create calendar event";
          }
        },
      }),
    );
  }

  if (
    listCalendarEventsMCPTool &&
    isToolEnabled("calendar_manager")
  ) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "list_calendar_events",
        description:
          "List events from the user's primary Google Calendar.",
        schema: z.object({
          timeMin: z.string().datetime({ offset: true }).nullish(),
          timeMax: z.string().datetime({ offset: true }).nullish(),
          maxResults: z.coerce.number().int().min(1).max(100).default(10),
        }),
        func: async ({ timeMin, timeMax, maxResults }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await listCalendarEventsMCPTool.invoke({
              authToken,
              ...(timeMin ? { timeMin } : {}),
              ...(timeMax ? { timeMax } : {}),
              maxResults,
            });
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            return error?.message || "Failed to list calendar events";
          }
        },
      }),
    );
  }

  if (listEmailsMCPTool && isToolEnabled("email_manager")) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "list_emails",
        description:
          'List or search emails in Gmail (read-only). Use query like "in:inbox", "is:unread", or "from:..." when needed. Use maxResults=1 for the latest/last single email, otherwise default 5.',
        schema: z.object({
          query: z.string().trim().max(500).nullish(),
          maxResults: z.coerce.number().int().min(1).max(100).default(5),
        }),
        func: async ({ query, maxResults }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await listEmailsMCPTool.invoke({
              authToken,
              ...(query ? { query } : {}),
              maxResults,
            });
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            return error?.message || "Failed to list Gmail messages";
          }
        },
      }),
    );
  }

  if (readEmailMCPTool && isToolEnabled("email_manager")) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "read_email",
        description:
          "Read the full content of one email in the authenticated user's Gmail account.",
        schema: z.object({
          messageId: z.string().trim().min(1),
        }),
        func: async ({ messageId }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await readEmailMCPTool.invoke({
              authToken,
              messageId,
            });
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            return error?.message || "Failed to read Gmail message";
          }
        },
      }),
    );
  }

  if (analyzeImageMCPTool && isToolEnabled("analyze_image")) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "analyze_image",
        description:
          "Analyze a user-provided Cloudinary image to describe its contents, read visible text, or explain a screenshot or code image. Use only when the user asks about an image. This tool never publishes or shares images.",
        schema: z.object({
          imageUrl: z
            .string()
            .url()
            .max(2048)
            .refine((value) => {
              const url = new URL(value);
              return (
                url.protocol === "https:" &&
                url.hostname === "res.cloudinary.com" &&
                !url.username &&
                !url.password &&
                (!url.port || url.port === "443")
              );
            }, {
              message: "imageUrl must be a public HTTPS Cloudinary image URL",
            })
            .describe("Public HTTPS Cloudinary URL of the image"),
          prompt: z
            .string()
            .trim()
            .max(2200)
            .optional()
            .describe("What to inspect or explain in the image"),
        }),
        func: async ({ imageUrl, prompt }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await analyzeImageMCPTool.invoke({
              authToken,
              imageUrl,
              ...(prompt ? { prompt } : {}),
            });
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            return error?.message || "Failed to analyze image";
          }
        },
      }),
    );
  }

  if (
    publishInstagramPostMCPTool &&
    isToolEnabled("publish_instagram_post")
  ) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "publish_instagram_post",
        description:
          "Publish an image to the user's connected Instagram account.",
        schema: z.object({
          imageUrl: z
            .string()
            .url()
            .refine((url) => url.startsWith("https://"), {
              message: "imageUrl must be a public HTTPS URL",
            })
            .describe("Public HTTPS URL of the image"),
          caption: z
            .string()
            .trim()
            .max(2200)
            .optional()
            .describe("Optional Instagram post caption"),
        }),
        func: async ({ imageUrl, caption }) => {
          try {
            const authToken = makeAuthToken(userId);
            const finalCaption = caption
              ? caption
              : await generateCaption(imageUrl);
            const result = await publishInstagramPostMCPTool.invoke({
              authToken,
              imageUrl,
              caption: finalCaption,
            });
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            return error?.message || "Failed to publish Instagram post";
          }
        },
      }),
    );
  }

  for (const tool of mcpTools) {
    if (
      isToolEnabled(tool.name) &&
      tool.name !== "web_search" &&
      !tool.name.endsWith("_web_search") &&
      tool.name !== "send_email" &&
      !tool.name.endsWith("_send_email") &&
      tool.name !== "create_calendar_event" &&
      !tool.name.endsWith("_create_calendar_event") &&
      tool.name !== "list_calendar_events" &&
      !tool.name.endsWith("_list_calendar_events") &&
      tool.name !== "list_emails" &&
      !tool.name.endsWith("_list_emails") &&
      tool.name !== "read_email" &&
      !tool.name.endsWith("_read_email") &&
      tool.name !== "publish_instagram_post" &&
      !tool.name.endsWith("_publish_instagram_post") &&
      tool.name !== "analyze_image" &&
      !tool.name.endsWith("_analyze_image")
    ) {
      finalTools.push(tool);
    }
  }

  const modelCandidates = MODEL_CANDIDATES.map((name) => {
    const plain = baseModels.get(name);
    return {
      name,
      plain,
      withTools: finalTools.length > 0 ? plain.bindTools(finalTools) : plain,
    };
  });

  const invokeWithFallback = async (messages, allowTools) => {
    let lastError;
    for (const candidate of modelCandidates) {
      const model = allowTools ? candidate.withTools : candidate.plain;
      try {
        return await model.invoke(messages);
      } catch (error) {
        lastError = error;
        if (
          isRateLimitError(error) ||
          (allowTools && isToolSchemaOrCallError(error)) ||
          isModelUnavailableError(error)
        ) {
          console.warn(
            `Model ${candidate.name} failed (${error?.status || "error"}), trying fallback:`,
            String(error?.message || "").slice(0, 180),
          );
          continue;
        }
        throw error;
      }
    }

    if (isRateLimitError(lastError)) {
      throw new Error(
        "Rate limit reached on Groq right now. Please wait a few seconds and try again.",
      );
    }
    throw lastError;
  };

  const currentDateTime = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date());

  const instructionsText = String(
    agent?.instructions || "You are AutoMate AI, a helpful assistant.",
  ).slice(0, 1500);
  const knowledgeText = agent?.knowledgeBase
    ? `\nKnowledge base:\n${String(agent.knowledgeBase).slice(0, 2000)}`
    : "";
  const imageAnalysisInstruction = isToolEnabled("analyze_image")
    ? "When the user asks about an uploaded image, use analyze_image with its Cloudinary image URL instead of guessing from a generated caption. This tool only analyzes images and never publishes them."
    : "";

  const systemPrompt = `${instructionsText}
Date/time: ${currentDateTime}, Asia/Kolkata.
Use tools only when needed and never invent results or expose secrets.
${imageAnalysisInstruction}
Never publish an Instagram post unless the user explicitly asks you to publish it.
If the user rejects an action, do not repeat or recreate it unless they explicitly ask again.
Format every answer as clean, readable Markdown.
- Use short headings and bullet points or numbered lists for multiple items.
- For lists of events, emails, or search results, use numbered items with clear labels and dates.
- Use Markdown tables only when a table genuinely improves readability; never use raw pipe-separated text.
- Make useful URLs into Markdown links.
- Keep the answer concise, and do not expose tool arguments, auth tokens, IDs, or internal reasoning.
- When reporting no results, state that clearly instead of producing an empty table or list.${knowledgeText}`;

  const approvalTools = new Set([
    "send_email",
    "publish_instagram_image",
    "publish_instagram_post",
    "create_calendar_event",
  ]);

  const chatNode = async (state) => {
    const currentTurnToolCalls = countCurrentTurnToolCalls(state.messages);
    const allowTools = currentTurnToolCalls < 6 && finalTools.length > 0;

    const recentMessages = prepareMessagesForModel(state.messages, 4, 2500);
    const promptMessages = [new SystemMessage(systemPrompt), ...recentMessages];

    let response = await invokeWithFallback(promptMessages, allowTools);

    if (
      allowTools &&
      (!response?.tool_calls || response.tool_calls.length === 0) &&
      !extractTextContent(response?.content)
    ) {
      console.warn(
        "Empty response from tool-bound model, retrying without tools:",
        response?.response_metadata,
      );
      response = await invokeWithFallback(promptMessages, false);
    }

    return {
      messages: [response],
    };
  };

  const toolNode = new ToolNode(finalTools);

  const actionApprovalNode = async (state) => {
    const lastMessage = state.messages.at(-1);
    const toolCalls = lastMessage?.tool_calls || [];
    return {
      messages: toolCalls.map(
        (toolCall) =>
          new ToolMessage({
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({
              success: false,
              message: "Please request one approval-protected action at a time.",
            }),
            status: "error",
          }),
      ),
    };
  };

  const actionApprovalNodeWithInterrupt = async (state) => {
    const lastMessage = state.messages.at(-1);
    const toolCalls = lastMessage?.tool_calls || [];
    if (toolCalls.length !== 1 || !approvalTools.has(toolCalls[0].name)) {
      return actionApprovalNode(state);
    }

    const actionCall = toolCalls[0];
    const args = actionCall.args || {};
    let approvalRequest;

    if (actionCall.name === "send_email") {
      const { to, subject, body } = args;
      if (
        !z.string().email().safeParse(to).success ||
        typeof subject !== "string" ||
        !subject.trim() ||
        typeof body !== "string" ||
        !body.trim()
      ) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                message: "The email draft is incomplete. Please clarify the recipient, subject, or message.",
              }),
              status: "error",
            }),
          ],
        };
      }

      approvalRequest = {
        type: "email_approval",
        email: { to, subject, body },
        message: "Review the email and approve or reject sending it.",
      };
    } else if (actionCall.name === "create_calendar_event") {
      const { summary, description, startDateTime, endDateTime, timeZone } = args;
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);
      if (
        typeof summary !== "string" ||
        !summary.trim() ||
        !z.string().datetime({ offset: true }).safeParse(startDateTime).success ||
        !z.string().datetime({ offset: true }).safeParse(endDateTime).success ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                message: "Calendar event details are invalid. Please clarify the title, date, or time.",
              }),
              status: "error",
            }),
          ],
        };
      }

      approvalRequest = {
        type: "calendar_event_approval",
        event: {
          summary,
          description: description || "",
          startDateTime,
          endDateTime,
          timeZone: timeZone || "Asia/Kolkata",
        },
        message: "Review the calendar event and approve or reject its creation.",
      };
    } else {
      const { imageUrl, caption } = args;
      let isPublicHttpsUrl = false;
      try {
        isPublicHttpsUrl =
          typeof imageUrl === "string" &&
          imageUrl.trim().length > 0 &&
          new URL(imageUrl).protocol === "https:";
      } catch {
        isPublicHttpsUrl = false;
      }
      if (
        !isPublicHttpsUrl ||
        typeof caption !== "string" ||
        !caption.trim()
      ) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                message: "Invalid Instagram post details. Provide a public HTTPS image URL and a non-empty caption.",
              }),
              status: "error",
            }),
          ],
        };
      }

      approvalRequest = {
        type: "instagram_post_approval",
        tool_call_id: actionCall.id,
        imageUrl,
        caption,
        message: "Review the Instagram image and caption, then approve or reject publishing.",
      };
    }

    const decision = interrupt({
      ...approvalRequest,
      approvalId: actionCall.id,
      toolName: actionCall.name,
    });

    if (decision?.approved !== true) {
      const rejectedMessages = {
        send_email: "Email rejected. No email was sent.",
        create_calendar_event: "Calendar event rejected. No event was created.",
        publish_instagram_post: "Instagram post rejected. Nothing was published.",
        publish_instagram_image: "Instagram post rejected. Nothing was published.",
      };
      return {
        messages: [
          new ToolMessage({
            tool_call_id: actionCall.id,
            content: JSON.stringify({
              success: false,
              rejected: true,
              message: rejectedMessages[actionCall.name],
            }),
            status: "error",
          }),
        ],
      };
    }

    return {};
  };

  const routeAfterChat = (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
      return "__end__";
    }
    const needsApproval = lastMessage.tool_calls.some((tool) =>
      approvalTools.has(tool.name),
    );
    if (needsApproval) {
      return "actionApprovalNode";
    }
    const toolCallCount = countCurrentTurnToolCalls(state.messages);
    if (toolCallCount > 6) {
      return "__end__";
    }
    return "tools";
  };

  const routeAfterApproval = (state) => {
    const lastMessage = state.messages.at(-1);
    return isToolMessage(lastMessage)
      ? "chatNode"
      : "tools";
  };

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("chatNode", chatNode)
    .addNode("tools", toolNode)
    .addNode("actionApprovalNode", actionApprovalNodeWithInterrupt)
    .addEdge("__start__", "chatNode")
    .addConditionalEdges("chatNode", routeAfterChat)
    .addEdge("tools", "chatNode")
    .addConditionalEdges("actionApprovalNode", routeAfterApproval);

  const chatAgentGraph = workflow.compile(
    useCheckpointer ? { checkpointer } : undefined,
  );
  return chatAgentGraph;
};

export const agentGraph = createAgentGraph;

const makeAgentThreadId = (userId, agent, threadId) =>
  `${String(userId)}:${String(agent?._id || "agent")}:${String(threadId)}`;

const getAgentRunResult = (result, threadId) => {
  const interrupts = (result.__interrupt__ || []).map(({ id, value }) => ({
    id,
    value,
  }));
  const pendingInterrupt = interrupts[0];
  const assistantMessage = result.messages.at(-1);
  return {
    content: pendingInterrupt
      ? ""
      : extractTextContent(assistantMessage?.content),
    interrupted: interrupts.length > 0,
    interrupts,
    ...(pendingInterrupt ? { approvalRequest: pendingInterrupt.value } : {}),
    threadId,
  };
};

export const runAgentWithTools = async ({
  agent,
  message,
  history = [],
  threadId,
  userId,
  useCheckpointer = true,
}) => {
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Message is required");
  }

  const effectiveUserId = userId || agent?.userId;
  const app = await createAgentGraph(agent, effectiveUserId, {
    useCheckpointer,
  });
  const messages = [];

  if (Array.isArray(history)) {
    for (const h of history) {
      const text = typeof h?.content === "string" ? h.content : h?.message;
      if (typeof text !== "string" || !text.trim()) continue;
      if (h.role === "user" || h.sender === "user") {
        messages.push(new HumanMessage(text));
      } else if (
        h.role === "assistant" ||
        h.sender === "assistant" ||
        h.sender === "agent"
      ) {
        messages.push(new AIMessage(text));
      }
    }
  }

  messages.push(new HumanMessage(message.trim()));

  const invokeConfig = useCheckpointer
    ? {
        configurable: {
          thread_id: makeAgentThreadId(
            effectiveUserId,
            agent,
            threadId || agent?._id || "anonymous",
          ),
        },
        recursionLimit: 25,
      }
    : { recursionLimit: 25 };

  const result = await app.invoke({ messages }, invokeConfig);
  return getAgentRunResult(result, threadId);
};

export const resumeAgentWithApproval = async ({
  agent,
  userId,
  threadId,
  approvalId,
  approved,
  claimApproval,
}) => {
  if (!threadId) {
    throw new Error("threadId is required.");
  }
  if (!userId) {
    throw new Error("Authenticated userId is required.");
  }
  if (typeof approved !== "boolean") {
    throw new Error("approved must be true or false.");
  }

  const app = await createAgentGraph(agent, userId, { useCheckpointer: true });
  const config = {
    configurable: {
      thread_id: makeAgentThreadId(userId, agent, threadId),
    },
    recursionLimit: 25,
  };
  const snapshot = await app.getState(config);
  const isPending = snapshot.tasks
    ?.flatMap((task) => task.interrupts || [])
    .some((pendingInterrupt) =>
      pendingInterrupt.value?.approvalId === approvalId ||
      pendingInterrupt.value?.tool_call_id === approvalId
    );
  if (!isPending) {
    const error = new Error("This action is no longer pending or does not belong to this conversation.");
    error.statusCode = 409;
    throw error;
  }
  await claimApproval?.();

  const result = await app.invoke(
    new Command({ resume: { approved } }),
    config,
  );
  return getAgentRunResult(result, threadId);
};
