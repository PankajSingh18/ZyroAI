import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { google } from "googleapis";
import { HumanMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getGoogleOAuthClient } from "../controllers/integration.controller.js";
import axios from "axios";
import Integration from "../models/Integration.model.js";
import { decrypt } from "../config/encrypt-decrypt.js";
import { INSTAGRAM_GRAPH_VERSION } from "../config/instagramOAuth.js";

const _fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(_fileName);

dotenv.config({
  path: path.resolve(dirName, "../.env"),
});

if (process.env.MONGO_URI) {
  await mongoose.connect(process.env.MONGO_URI);
}

import { z } from "zod";
import { TavilySearch } from "@langchain/tavily";

const server = new McpServer({
  name: "automate-ai-mcp-server",
  version: "1.0.0",
});

const tavilySearch = process.env.TAVILY_API_KEY
  ? new TavilySearch({
      maxResults: 5,
      topic: "general",
    })
  : null;

const verifyAuthToken = (token) => {
  const payload = jwt.verify(token, process.env.MCP_AUTH_SECRET, {
    algorithms: ["HS256"],
    issuer: "automate-backend",
    audience: "automate-mcp",
  });

  return payload.sub;
};

const isAllowedImageUrl = (value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "res.cloudinary.com" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443")
  );
};

const loadCloudinaryImage = async (imageUrl) => {
  const response = await fetch(imageUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch image. Status: ${response.status}`);
  }

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  const maxImageBytes = 5 * 1024 * 1024;
  if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
    throw new Error("Image must be 5 MB or smaller");
  }

  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    .toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new Error("Image must be JPEG, PNG, or WebP");
  }

  if (!response.body) {
    throw new Error("Image response did not contain a body");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxImageBytes) {
        await reader.cancel();
        throw new Error("Image must be 5 MB or smaller");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return {
    contentType,
    base64Image: Buffer.concat(chunks, totalBytes).toString("base64"),
  };
};

if (tavilySearch) {
  server.registerTool(
    "web_search",
    {
      description: "Search the web for current information, tutorials, and news.",
      inputSchema: z.object({
        query: z.string(),
      }),
    },
    async ({ query }) => {
      try {
        const result = await tavilySearch.invoke({ query });
        return {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error?.message || "An error occurred during search",
            },
          ],
          isError: true,
        };
      }
    },
  );
} else {
  console.warn("TAVILY_API_KEY is not configured; web_search is disabled.");
}

server.registerTool(
  "send_email",
  {
    description:
      "Send an email through the authenticated user's connected Gmail account.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      to: z.string().email(),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(2000),
    }),
  },
  async ({ authToken, to, subject, body }) => {
    try {
      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOAuthClient(userId, "gmail");
      const gmail = google.gmail({ version: "v1", auth: oauthClient });

      const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
      const encodedBody = Buffer.from(body, "utf8").toString("base64");
      const emailLines = [
        `To: ${to}`,
        `Subject: =?UTF-8?B?${encodedSubject}?=`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        encodedBody,
      ];
      const raw = Buffer.from(emailLines.join("\r\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              messageId: result.data.id,
              threadId: result.data.threadId,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error?.message || "Failed to send email",
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_calendar_event",
  {
    description:
      "Create an event in the authenticated user's primary Google Calendar.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      summary: z.string().trim().min(1).max(200),
      description: z.string().trim().max(5000).optional(),
      startDateTime: z.string().datetime({ offset: true }),
      endDateTime: z.string().datetime({ offset: true }),
      timeZone: z.string().trim().min(1).default("Asia/Kolkata"),
    }),
  },
  async ({
    authToken,
    summary,
    description,
    startDateTime,
    endDateTime,
    timeZone,
  }) => {
    try {
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return {
          content: [
            {
              type: "text",
              text: "The event start and end times must be valid ISO 8601 date-times.",
            },
          ],
          isError: true,
        };
      }

      if (end <= start) {
        return {
          content: [
            {
              type: "text",
              text: "The event end time must be later than its start time.",
            },
          ],
          isError: true,
        };
      }

      if (start < new Date()) {
        return {
          content: [
            {
              type: "text",
              text: "The event start time cannot be in the past.",
            },
          ],
          isError: true,
        };
      }

      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOAuthClient(
        userId,
        "google_calendar"
      );
      const calendar = google.calendar({ version: "v3", auth: oauthClient });

      const event = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary,
          description,
          start: {
            dateTime: startDateTime,
            timeZone,
          },
          end: {
            dateTime: endDateTime,
            timeZone,
          },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Calendar event created successfully.",
              eventId: event.data.id,
              htmlLink: event.data.htmlLink,
              summary: event.data.summary,
              start: event.data.start,
              end: event.data.end,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error?.message || "Failed to create calendar event",
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "list_calendar_events",
  {
    description:
      "List events from the authenticated user's primary Google Calendar.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      timeMin: z.string().datetime({ offset: true }).optional(),
      timeMax: z.string().datetime({ offset: true }).optional(),
      maxResults: z.number().int().min(1).max(100).default(10),
    }),
  },
  async ({ authToken, timeMin, timeMax, maxResults }) => {
    try {
      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOAuthClient(
        userId,
        "google_calendar"
      );
      const calendar = google.calendar({ version: "v3", auth: oauthClient });

      const result = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (result.data.items || []).map((event) => ({
        id: event.id,
        summary: event.summary || "No event title",
        description: event.description || "",
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        htmlLink: event.htmlLink || null,
        status: event.status,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Calendar events fetched successfully.",
              count: events.length,
              events,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error?.message || "Failed to list calendar events",
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "list_emails",
  {
    description:
      "List or search emails in the authenticated user's Gmail account.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      query: z.string().trim().max(500).optional(),
      maxResults: z.number().int().min(1).max(100).default(5),
    }),
  },
  async ({ authToken, query, maxResults }) => {
    try {
      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOAuthClient(userId, "gmail");
      const gmail = google.gmail({ version: "v1", auth: oauthClient });

      const listResponse = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
      });
      const messages = listResponse.data.messages || [];

      const emails = await Promise.all(
        messages.map(async (ref) => {
          const message = await gmail.users.messages.get({
            userId: "me",
            id: ref.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });
          const headers = message.data.payload?.headers || [];
          const getHeader = (name) =>
            headers.find(
              (header) =>
                header.name?.toLowerCase() === name.toLowerCase()
            )?.value || "";

          return {
            id: message.data.id,
            from: getHeader("From"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: (message.data.snippet || "").slice(0, 120),
            unread: (message.data.labelIds || []).includes("UNREAD"),
          };
        })
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              count: emails.length,
              nextPageToken: listResponse.data.nextPageToken || null,
              messages: emails,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error?.message || "Failed to list Gmail messages",
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "read_email",
  {
    description:
      "Read the full content of one email in the authenticated user's Gmail account.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      messageId: z.string().trim().min(1),
    }),
  },
  async ({ authToken, messageId }) => {
    try {
      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOAuthClient(userId, "gmail");
      const gmail = google.gmail({ version: "v1", auth: oauthClient });

      const response = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const headers = response.data.payload?.headers || [];
      const getHeader = (name) =>
        headers.find(
          (header) =>
            header.name?.toLowerCase() === name.toLowerCase()
        )?.value || "";

      const findPartByMime = (part, mimeType) => {
        if (!part) return "";
        if (part.mimeType === mimeType && part.body?.data) {
          return Buffer.from(part.body.data, "base64url").toString("utf8");
        }
        return (part.parts || [])
          .map((child) => findPartByMime(child, mimeType))
          .filter(Boolean)
          .join("\n");
      };

      const plainText = findPartByMime(response.data.payload, "text/plain");
      const rawHtml = plainText
        ? ""
        : findPartByMime(response.data.payload, "text/html");
      const cleanedHtml = rawHtml
        ? rawHtml
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        : "";
      const bodyText = (plainText || cleanedHtml || response.data.snippet || "").trim();
      const maxBodyChars = 2500;
      const body =
        bodyText.length > maxBodyChars
          ? `${bodyText.slice(0, maxBodyChars)}\n[body truncated]`
          : bodyText;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              id: response.data.id,
              from: getHeader("From"),
              to: getHeader("To"),
              subject: getHeader("Subject"),
              date: getHeader("Date"),
              body,
              unread: (response.data.labelIds || []).includes("UNREAD"),
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error?.message || "Failed to read Gmail message",
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "publish_instagram_post",
  {
    description:
      "Publish an image to the authenticated user's connected Instagram account.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      imageUrl: z
        .string()
        .url()
        .refine((url) => url.startsWith("https://"), {
          message: "Instagram imageUrl must be a public HTTPS URL",
        }),
      caption: z.string().trim().max(2200).optional(),
    }),
  },
  async ({ authToken, imageUrl, caption }) => {
    try {
      const userId = verifyAuthToken(authToken);
      await mongoose.connection.asPromise();

      const integration = await Integration.findOne({
        userId,
        provider: "instagram",
        services: "instagram",
        status: "connected",
      }).select("+tokens.accessToken");

      if (!integration?.tokens?.accessToken) {
        return {
          content: [
            {
              type: "text",
              text: "Instagram is not connected. Please connect it from the Integrations page.",
            },
          ],
          isError: true,
        };
      }

      const accessToken = decrypt(integration.tokens.accessToken);
      const accountId = integration.providerAccountId;
      const graphBaseUrl = `https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}`;
      const finalImageUrl = new URL(imageUrl);
      if (
        finalImageUrl.hostname === "res.cloudinary.com" &&
        finalImageUrl.pathname.toLowerCase().endsWith(".webp")
      ) {
        finalImageUrl.pathname = finalImageUrl.pathname.replace(/\.webp$/i, ".jpg");
      }

      const mediaResponse = await axios.post(
        `${graphBaseUrl}/${accountId}/media`,
        null,
        {
          params: {
            image_url: finalImageUrl.toString(),
            ...(caption ? { caption } : {}),
            access_token: accessToken,
          },
          timeout: 30000,
        }
      );

      const creationId = mediaResponse.data?.id;
      if (!creationId) {
        throw new Error("Instagram did not return a media creation ID");
      }

      let isReady = false;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const statusResponse = await axios.get(
          `${graphBaseUrl}/${creationId}`,
          {
            params: {
              fields: "status_code",
              access_token: accessToken,
            },
            timeout: 15000,
          }
        );

        const statusCode = statusResponse.data?.status_code;
        if (statusCode === "FINISHED") {
          isReady = true;
          break;
        }
        if (statusCode === "ERROR") {
          throw new Error("Instagram media processing failed");
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (!isReady) {
        return {
          content: [
            {
              type: "text",
              text: "Instagram media processing timeout.",
            },
          ],
          isError: true,
        };
      }

      const publishResponse = await axios.post(
        `${graphBaseUrl}/${accountId}/media_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: accessToken,
          },
          timeout: 30000,
        }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Instagram post published successfully.",
              creationId,
              mediaId: publishResponse.data?.id || null,
            }),
          },
        ],
      };
    } catch (error) {
      const graphMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to publish Instagram post";

      return {
        content: [
          {
            type: "text",
            text: graphMessage,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "analyze_image",
  {
    description: `Analyze a user-provided Cloudinary image with Gemini and answer questions about its contents.
Use this tool when the user asks what an image contains, requests a description, asks to read visible text, or asks for an explanation of a screenshot or code image.
If the user provides no question, describe the important visible details.
This tool only analyzes images; it never publishes or shares them.`,
    inputSchema: z.object({
      authToken: z.string().min(1),
      imageUrl: z
        .string()
        .url()
        .max(2048)
        .refine(isAllowedImageUrl, {
          message: "imageUrl must be a public HTTPS Cloudinary image URL",
        }),
      prompt: z
        .string()
        .trim()
        .max(2200)
        .default("Describe this image clearly and accurately."),
    }),
  },
  async ({ authToken, imageUrl, prompt }) => {
    try {
      verifyAuthToken(authToken);
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY is not configured");
      }

      const { contentType, base64Image } = await loadCloudinaryImage(imageUrl);
      const imageAnalyzer = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        temperature: 0,
        maxRetries: 2,
        apiKey,
      });
      const response = await imageAnalyzer.invoke([
        new HumanMessage({
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: `data:${contentType};base64,${base64Image}`,
            },
          ],
        }),
      ]);

      const analysis =
        typeof response?.content === "string"
          ? response.content.trim()
          : Array.isArray(response?.content)
            ? response.content
                .map((part) =>
                  typeof part === "string" ? part : part?.text || "",
                )
                .join("")
                .trim()
            : "";
      if (!analysis) {
        throw new Error("Gemini returned an empty image analysis");
      }

      return {
        content: [{ type: "text", text: analysis }],
      };
    } catch (error) {
      console.error("Analyze image MCP error:", error);
      return {
        content: [
          {
            type: "text",
            text: error?.message || "Failed to analyze image",
          },
        ],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
