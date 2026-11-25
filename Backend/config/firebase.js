import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFile } from "node:fs/promises";

const loadServiceAccount = async () => {
  const credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (credentialsJson) {
    return JSON.parse(credentialsJson);
  }

  const paths = [
    "/etc/secrets/serviceAccountKey.json",
    new URL("../serviceAccountKey.json", import.meta.url),
  ];

  for (const path of paths) {
    try {
      const content = await readFile(path, "utf8");
      return JSON.parse(content);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  throw new Error("Firebase credentials not found.");
};

const serviceAccount = await loadServiceAccount();

export const app = initializeApp({
  credential: cert(serviceAccount),
});

export const auth = getAuth(app);
