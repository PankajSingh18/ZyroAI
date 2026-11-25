import express from "express";
import {
  connectGoogle,
  disconnectGoogle,
  getIntegrations,
  getAllIntegrations,
  googleCallback,
  connectInstagram,
  instagramCallback,
  disconnectInstagram,
} from "../controllers/integration.controller.js";
import protect from "../middleware/protect.js";

const integrationRouter = express.Router();

integrationRouter.get("/google", protect, connectGoogle);
integrationRouter.get("/google/connect", protect, connectGoogle);
integrationRouter.get("/google/callback", googleCallback);
integrationRouter.delete("/google", protect, disconnectGoogle);
integrationRouter.get("/google/disconnect", protect, disconnectGoogle);
integrationRouter.get("/instagram/connect", protect, connectInstagram);
integrationRouter.get("/instagram/callback", instagramCallback);
integrationRouter.get("/instagram/disconnect", protect, disconnectInstagram);
integrationRouter.get("/all", protect, getAllIntegrations);
integrationRouter.get("/", protect, getIntegrations);

export default integrationRouter;
