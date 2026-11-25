import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFile } from "node:fs/promises";

const loadServiceAccount = async () => {
  const credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credentialsJson) {
    try {
      return JSON.parse(credentialsJson);
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.",
      );
    }
  }

  try {
    const localCredentials = await readFile(
      new URL("../serviceAccountKey.json", import.meta.url),
      "utf8",
    );
    return JSON.parse(localCredentials);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or add Backend/serviceAccountKey.json for local development.",
      );
    }
    throw error;
  }
};

const serviceAccount = await loadServiceAccount();

export const app = initializeApp({
  credential: cert(serviceAccount),
});

export const auth = getAuth(app);
