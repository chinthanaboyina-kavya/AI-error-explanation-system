# 🔥 Firebase Authentication Setup Guide

This project includes **Firebase Authentication** before accessing the AI Error Explanation System dashboard.

---

## 🚀 Quick Start (Instant Preview)

The application comes with an **interactive Sandbox/Demo Mode** enabled out of the box:
1. Open your browser and navigate to: **[http://localhost:5000](http://localhost:5000)** (or run `run.bat`).
2. You will automatically see the **Sign In / Create Account** page.
3. You can either:
   - Click **"⚡ Instant Test Account"** to log in immediately as Lead Engineer.
   - Enter your name, email, and password in **"Create Account"** to register a new user.
   - Click **"Sign In with Google"** for Google auth.
4. Once authenticated, you will be smoothly transitioned to the **AI Error Explainer** workbench.
5. In the top navbar, you'll see your **User Avatar**, email, and a **Sign Out** button.

---

## 🛠️ Connecting Your Real Firebase Project (3 Easy Steps)

To connect your live Google Firebase project:

### Step 1: Create a Firebase Web App
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a project (or select an existing one).
3. Under **Project Overview**, click the **Web icon (`</>`)** to register a web app.
4. Copy the `firebaseConfig` object provided by Firebase.

### Step 2: Enable Sign-In Methods in Firebase Console
1. In Firebase Console, go to **Build > Authentication > Sign-in method**.
2. Enable **Email/Password** provider (toggle *Email/Password* to enabled, click Save).
3. *(Optional)* Enable **Google** provider if you'd like one-click Google Sign-In.
4. In **Authentication > Settings > Authorized domains**, make sure `localhost` is listed (it is added by default).

### Step 3: Add Your Keys to the App

You have two convenient ways to set your credentials:

#### Option A: Directly from the Web UI (No code editing needed)
1. On the login page ([http://localhost:5000/login](http://localhost:5000/login)), click the **"Firebase Keys"** button in the top right.
2. Paste your Firebase configuration JSON or JavaScript object.
3. Click **"Save & Reload"**. The app will immediately switch to live Firebase authentication!

#### Option B: Edit `AI_Error_Explanation/static/firebase-config.js`
Open `AI_Error_Explanation/static/firebase-config.js` and replace the `DEFAULT_FIREBASE_CONFIG` object with your project credentials:

```javascript
const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyYourActualApiKeyHere",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};
```

---

## 🔒 Features Included

- **Dedicated Auth Page (`/login`)**: Sleek dark glassmorphic design matching the AI Explainer theme.
- **Tabbed Interface**: Seamless switching between **Sign In** and **Create Account**.
- **Password Security**: Show/hide password eye toggle, live password strength meter, and repeat-password validation.
- **Forgot Password Modal**: Instantly sends password reset emails via Firebase Auth.
- **Google Sign-In**: Integrated with Firebase `GoogleAuthProvider` popup.
- **Auth Guard**: Protects the main workbench (`/`). Unauthenticated requests are intercepted and redirected to `/login`.
- **Session Persistence**: Sessions are saved locally (`browserLocalPersistence`) so users stay logged in across page reloads.
- **Navbar Profile & Sign Out**: Displays authenticated user's avatar, email, auth badge, and sign-out button.
- **User-Associated History**: Queries and explanations are tagged with the logged-in user's email in SQLite database.
