// Paste the values from Firebase console > Project settings > Your apps > Web app > SDK setup and configuration.
// These values are NOT secrets. Security comes from firestore.rules, not from hiding this file.
export const FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// Optional line shown under the title, for example "Thursday 12 November, 6:30 PM, Venue name, Accra".
// Leave as "" to hide it.
export const EVENT_LINE = "";

// Set to true ONLY after the confirmation email function is deployed and a test email has arrived
// (see README, Part 5). While false, guests are told to save or print their reference.
export const EMAIL_ENABLED = false;

// The public address guests will see in invite links, for example "https://educata.yourdomain.com/".
// Leave "" until your custom domain works; then links use whatever address the admin page was opened from.
export const PUBLIC_BASE_URL = "";
