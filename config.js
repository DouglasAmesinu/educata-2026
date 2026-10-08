// Paste the values from Firebase console > Project settings > Your apps > Web app > SDK setup and configuration.
// These values are NOT secrets. Security comes from firestore.rules, not from hiding this file.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBv1_XfkhHNfDyyCnGaxlttRLABL5JuqvY",
  authDomain: "educata-2026.firebaseapp.com",
  projectId: "educata-2026",
  storageBucket: "educata-2026.firebasestorage.app",
  messagingSenderId: "45136584240",
  appId: "1:45136584240:web:daef96c01671fad08857f5"
};

// Optional line shown under the title, for example "Thursday 12 November, 6:30 PM, Venue name, Accra".
// Leave as "" to hide it.
export const EVENT_LINE = "Thursday 08 November, 10:58 am, Venue, Accra";

// Set to true ONLY after the confirmation email function is deployed and a test email has arrived
// (see README, Part 5). While false, guests are told to save or print their reference.
export const EMAIL_ENABLED = false;

// The public address guests will see in invite links, for example "https://educata.yourdomain.com/".
// Leave "" until your custom domain works; then links use whatever address the admin page was opened from.
export const PUBLIC_BASE_URL = "https://educata.gabsconnect.com/";
