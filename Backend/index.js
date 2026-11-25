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

app.use(express.json({ limit: "8mb" }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"));
    },
    credentials: true,
  })
);
app.use(cookieParser());

// Basic test route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Auth routes
app.use("/api/auth", authRouter);
app.use("/api/agent", agentRouter);
app.use("/api/chat", chatRouter);
app.use("/api/integration", integrationRouter);
app.use("/api/payment", paymentRouter);

// Start server and connect DB
app.listen(port, () => {
  connectDB();
  console.log("server started at ", port);
});
