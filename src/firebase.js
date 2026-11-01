import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDh8h9v8-c_Q2p2fl8HqqGKDbpyUejEBUs",
  authDomain: "smart-parking-d99b9.firebaseapp.com",
  // Realtime Database URL: copy the exact one from Firebase console > Realtime Database
  // (it may end in .europe-west1.firebasedatabase.app instead)
  databaseURL: "https://smart-parking-d99b9-default-rtdb.firebaseio.com",
  projectId: "smart-parking-d99b9",
  storageBucket: "smart-parking-d99b9.firebasestorage.app",
  messagingSenderId: "599722196616",
  appId: "1:599722196616:web:e549c955e2bfef2c39693d",
  measurementId: "G-GVG1KN0XQE",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
isSupported().then((ok) => ok && getAnalytics(app)).catch(() => {});
