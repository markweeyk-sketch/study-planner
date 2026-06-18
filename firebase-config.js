// ──────────────────────────────────────────────────────────────
// Firebase configuration
// ──────────────────────────────────────────────────────────────
// To enable real authentication:
//   1. Create a Firebase project at https://console.firebase.google.com/
//   2. Enable Authentication → Sign-in providers:
//        - Email/Password
//        - Google
//   3. In Project Settings → General → "Your apps", add a Web app and
//      copy the config values below.
//   4. Add your app's domain to Authentication → Settings → Authorized domains.
//
// Until you fill this in, the app runs in "local-only" mode: a single
// implicit user, all data in localStorage, sign-in screen skipped.
// ──────────────────────────────────────────────────────────────

window.STUDY_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAVCBVZ285_ywnDv_5bNAhtrPCPa8Ycu2g",
  authDomain:        "study-planner-d474b.firebaseapp.com",
  projectId:         "study-planner-d474b",
  storageBucket:     "study-planner-d474b.firebasestorage.app",
  messagingSenderId: "469485146767",
  appId:             "1:469485146767:web:59a9c374a884f013c2d6fa"
};

// True when the config above is real (not the placeholder)
window.STUDY_FIREBASE_ENABLED =
  window.STUDY_FIREBASE_CONFIG &&
  window.STUDY_FIREBASE_CONFIG.apiKey &&
  window.STUDY_FIREBASE_CONFIG.apiKey !== "REPLACE_ME";

// Initialize Firebase if configured
if (window.STUDY_FIREBASE_ENABLED && window.firebase) {
  try {
    window.firebase.initializeApp(window.STUDY_FIREBASE_CONFIG);
  } catch (e) {
    console.warn('Firebase init failed:', e);
    window.STUDY_FIREBASE_ENABLED = false;
  }
}
