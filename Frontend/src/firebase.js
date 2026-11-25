import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "zyroai-afaec.firebaseapp.com",
  projectId: "zyroai-afaec",
  storageBucket: "zyroai-afaec.firebasestorage.app",
  messagingSenderId: "329023013957",
  appId: "1:329023013957:web:db5ec23e0962a7f8910f2c",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
