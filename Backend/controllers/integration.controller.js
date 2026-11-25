import { google } from "googleapis";
import axios from "axios";
import { googleOAuthClient, scopes } from "../config/googleOAuth.js";
import { decrypt, encrypt } from "../config/encrypt-decrypt.js";
import {
  INSTAGRAM_GRAPH_VERSION,
  INSTAGRAM_SCOPES,
} from "../config/instagramOAuth.js";
import Integration from "../models/Integration.model.js";
import jwt from "jsonwebtoken";

export const getGoogleOAuthClient = async (userId, requiredService) => {
  const integration = await Integration.findOne({
    userId,
    provider: "google",
    services: requiredService,
    status: "connected",
  }).select("+tokens.refreshToken");

  if (!integration?.tokens?.refreshToken) {
    throw new Error(
      `Google ${requiredService} is not connected or its refresh token is unavailable`
    );
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({
    refresh_token: decrypt(integration.tokens.refreshToken),
  });

  return client;
};

export const connectGoogle = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const state = jwt.sign(
      {
        userId: String(userId),
        purpose: "google-oauth",
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const url = googleOAuthClient.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state,
      prompt: "consent",
    });

    return res.status(200).json({ url });
  } catch (error) {
    return res.status(500).json({
      message: `connect Google error ${error.message}`,
    });
  }
};

export const getIntegrations = async (req, res) => {
  try {
    const integrations = await Integration.find({ userId: req.user._id })
      .select("-tokens.accessToken -tokens.refreshToken")
      .sort({ updatedAt: -1 });

    return res.status(200).json(integrations);
  } catch (error) {
    return res.status(500).json({
      message: `get integrations error ${error.message}`,
    });
  }
};

export const getAllIntegrations = async (req, res) => {
  try {
    const [integrations, googleConnection, instagramConnection] = await Promise.all([
      Integration.find({ userId: req.user._id })
        .select("-tokens")
        .sort({ updatedAt: -1 }),
      Integration.findOne({
        userId: req.user._id,
        provider: "google",
        status: "connected",
      }).select("services account"),
      Integration.findOne({
        userId: req.user._id,
        provider: "instagram",
        status: "connected",
      }).select("services account"),
    ]);

    return res.status(200).json({
      success: true,
      integrations,
      gmail: {
        connected: Boolean(googleConnection?.services?.includes("gmail")),
        email: googleConnection?.account?.email || null,
      },
      google_calendar: {
        connected: Boolean(googleConnection?.services?.includes("google_calendar")),
        email: googleConnection?.account?.email || null,
      },
      instagram: {
        connected: Boolean(instagramConnection),
        username: instagramConnection?.account?.username || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: `get all integrations error ${error.message}`,
    });
  }
};

export const connectInstagram = async (req, res) => {
  try {
    const userId = req.user?._id;
    const appId = process.env.INSTAGRAM_APP_ID;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!appId || !redirectUri) {
      return res.status(500).json({
        message: "Instagram OAuth environment variables are not configured",
      });
    }

    const state = jwt.sign(
      {
        userId: String(userId),
        purpose: "instagram-oauth",
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: INSTAGRAM_SCOPES.join(","),
      state,
    });
    const url = `https://www.facebook.com/${INSTAGRAM_GRAPH_VERSION}/dialog/oauth?${params}`;

    return res.status(200).json({ success: true, url });
  } catch (error) {
    return res.status(500).json({
      message: `connect Instagram error ${error.message}`,
    });
  }
};

export const instagramCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).json({ message: "Instagram authorization failed" });
    }
    if (typeof code !== "string" || typeof state !== "string") {
      return res.status(400).json({
        message: "Instagram authorization code and state are required",
      });
    }

    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      decoded.purpose !== "instagram-oauth" ||
      typeof decoded.userId !== "string"
    ) {
      return res.status(400).json({ message: "Invalid OAuth state" });
    }

    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
    if (!appId || !appSecret || !redirectUri) {
      return res.status(500).json({
        message: "Instagram OAuth environment variables are not configured",
      });
    }

    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    let tokenData;
    try {
      const tokenResponse = await axios.get(
        `https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/oauth/access_token`,
        {
          params: Object.fromEntries(tokenParams),
          timeout: 15000,
        }
      );
      tokenData = tokenResponse.data;
    } catch (requestError) {
      throw new Error(
        requestError.response?.data?.error?.message ||
        "Unable to exchange Instagram code"
      );
    }
    if (!tokenData.access_token) {
      throw new Error("Unable to exchange Instagram code");
    }

    let accountsData;
    try {
      const accountsResponse = await axios.get(
        `https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/me/accounts`,
        {
          params: {
            fields: "instagram_business_account,id,name,access_token",
            access_token: tokenData.access_token,
          },
          timeout: 15000,
        }
      );
      accountsData = accountsResponse.data;
    } catch (requestError) {
      throw new Error(
        requestError.response?.data?.error?.message ||
        "Unable to load Facebook Pages"
      );
    }

    const account = (accountsData.data || []).find(
      (item) => item.instagram_business_account?.id
    );
    if (!account?.instagram_business_account?.id) {
      return res.status(400).json({
        message: "No Instagram business account found for this Facebook account",
      });
    }

    const instagramAccountId = account.instagram_business_account?.id;
    if (!instagramAccountId) {
      return res.status(400).json({
        message: "Target account payload lacks a valid unique object ID",
      });
    }

    let profile;
    try {
      const profileResponse = await axios.get(
        `https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/${instagramAccountId}`,
        {
          params: {
            fields: "id,username,name",
            access_token: account.access_token || tokenData.access_token,
          },
          timeout: 15000,
        }
      );
      profile = profileResponse.data;
    } catch (requestError) {
      throw new Error(
        requestError.response?.data?.error?.message ||
        "Unable to load Instagram profile"
      );
    }

    const filter = {
      userId: decoded.userId,
      provider: "instagram",
      providerAccountId: instagramAccountId,
    };
    const existingIntegration = await Integration.findOne(filter)
      .select("+tokens.accessToken");

    const userAccessToken =
      account.access_token || tokenData.access_token;
    const integration = existingIntegration || new Integration({
      ...filter,
      services: [],
      tokens: {},
    });

    integration.services = [
      ...new Set([
        ...(integration.services || []),
        "instagram",
      ]),
    ];
    integration.account = {
      ...(integration.account?.toObject?.() || integration.account || {}),
      username: profile.username || "",
      displayName: profile.name || profile.username || "",
    };
    integration.scopes = INSTAGRAM_SCOPES;
    integration.tokens.accessToken = encrypt(userAccessToken);
    integration.tokens.expiresAt = null;
    integration.status = "connected";
    integration.connectedAt = new Date();
    await integration.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/integration?instagram=connected`);
  } catch (error) {
    return res.status(500).json({
      message: `Instagram callback error ${error.message}`,
    });
  }
};

export const disconnectInstagram = async (req, res) => {
  try {
    await Integration.deleteMany({
      userId: req.user._id,
      provider: "instagram",
    });

    return res.status(200).json({
      message: "Instagram disconnected successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: `disconnect Instagram error ${error.message}`,
    });
  }
};

export const disconnectGoogle = async (req, res) => {
  try {
    await Integration.deleteMany({
      userId: req.user._id,
      provider: "google",
    });

    return res.status(200).json({
      message: "Google disconnected successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: `disconnect Google error ${error.message}`,
    });
  }
};

export const googleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).json({ message: "Google authorization failed" });
    }

    if (typeof code !== "string" || typeof state !== "string") {
      return res.status(400).json({ message: "Google authorization code and state are required" });
    }

    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      decoded.purpose !== "google-oauth" ||
      typeof decoded.userId !== "string"
    ) {
      return res.status(400).json({ message: "Invalid OAuth state" });
    }

    const { tokens } = await googleOAuthClient.getToken(code);
    googleOAuthClient.setCredentials(tokens);

    const oauth2 = google.oauth2({
      version: "v2",
      auth: googleOAuthClient,
    });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.id || !profile.email) {
      return res.status(400).json({ message: "Unable to identify Google account" });
    }

    const filter = {
      userId: decoded.userId,
      provider: "google",
      providerAccountId: profile.id,
    };
    const existingIntegration = await Integration.findOne(filter)
      .select("+tokens.accessToken +tokens.refreshToken");

    const grantedScopes = typeof tokens.scope === "string"
      ? tokens.scope.split(" ").filter(Boolean)
      : scopes;
    const grantedServices = [];
    if (grantedScopes.some((scope) => scope.includes("gmail"))) {
      grantedServices.push("gmail");
    }
    if (grantedScopes.some((scope) => scope.includes("calendar"))) {
      grantedServices.push("google_calendar");
    }
    const services = [
      ...new Set([
        ...(existingIntegration?.services || []),
        ...grantedServices,
      ]),
    ];

    const update = {
      services,
      "account.email": profile.email,
      "account.displayName": profile.name || "",
      scopes: grantedScopes,
      status: "connected",
      connectedAt: new Date(),
    };

    if (tokens.access_token) {
      update["tokens.accessToken"] = encrypt(tokens.access_token);
    }

    if (tokens.expiry_date) {
      update["tokens.expiresAt"] = new Date(tokens.expiry_date);
    }

    if (tokens.refresh_token || existingIntegration?.tokens?.refreshToken) {
      update["tokens.refreshToken"] =
        tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : existingIntegration.tokens.refreshToken;
    }

    await Integration.findOneAndUpdate(
      filter,
      {
        $set: update,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/integration?google=connected`);
  } catch (error) {
    return res.status(500).json({
      message: `Google callback error ${error.message}`,
    });
  }
};