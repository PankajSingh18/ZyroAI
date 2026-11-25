import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectDB from "./config/db.js";

import authRouter from "./routes/auth.route.js";
import agentRouter from "./routes/agent.route.js";
import chatRouter from "./routes/chat.route.js";
import integrationRouter from "./routes/integration.route.js";
import paymentRouter from "./routes/payment.route.js";

const app = express();
const port = process.env.PORT || 5000;

const frontendOrigin = process.env.FRONTEND_URL
  ? new URL(process.env.FRONTEND_URL).origin
  : null;

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://zyroai-2.onrender.com",
  frontendOrigin,
].filter(Boolean));

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without origin (server-to-server, health checks)
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    console.error("Blocked by CORS:", origin);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: ["Content-Type", "Authorization"],
};

// Middleware
app.use(cors(corsOptions));

app.use(express.json({ limit: "8mb" }));

app.use(cookieParser());

// Basic test route
app.get("/", (req, res) => {
  res.status(200).send("ZyroAI API is running!");
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});

// Authentication routes
app.use("/api/auth", authRouter);

// Agent routes
app.use("/api/agent", agentRouter);

// Chat routes
app.use("/api/chat", chatRouter);

// Integration routes
app.use("/api/integration", integrationRouter);

// Payment routes
app.use("/api/payment", paymentRouter);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);

  if (err.message.startsWith("CORS blocked")) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`Server started on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
