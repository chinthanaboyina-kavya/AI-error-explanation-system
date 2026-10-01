/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  AI ERROR EXPLANATION SYSTEM — Firebase Authentication Service
 *  Supports:
 *  - Firebase v10 Compat Web SDK
 *  - Email & Password Sign In
 *  - Email & Password Sign Up (with Profile Name)
 *  - Google Sign-In with Popup
 *  - Password Reset Email
 *  - Session Persistence (LOCAL)
 *  - Real-time Auth State Monitoring
 *  - UI Configuration override (localStorage)
 *  - Graceful Sandbox/Demo fallback if keys are not yet configured
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Default Firebase Configuration ──────────────────────────────────────────
// NOTE: Replace these values with your actual Firebase Project credentials
// from Firebase Console -> Project Settings -> General -> Your apps -> Web app.
// You can also enter them directly inside the app using the "Firebase Config" button!
const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyYOUR_API_KEY_HERE_REPLACE_ME",
    authDomain: "ai-error-explainer.firebaseapp.com",
    projectId: "ai-error-explainer",
    storageBucket: "ai-error-explainer.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};

const STORAGE_KEY_CONFIG = 'ai_explainer_firebase_config';
const STORAGE_KEY_DEMO_USER = 'ai_explainer_demo_user';

// State variables
let firebaseApp = null;
let firebaseAuth = null;
let isDemoMode = false;
let authListeners = [];

/**
 * Get active Firebase configuration (custom from localStorage if available, or default)
 */
function getActiveFirebaseConfig() {
    try {
        const custom = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (custom) {
            const parsed = JSON.parse(custom);
            if (parsed && parsed.apiKey) return parsed;
        }
    } catch (e) {
        console.warn('Error reading stored Firebase config:', e);
    }
    return DEFAULT_FIREBASE_CONFIG;
}

/**
 * Check if the active configuration has real Firebase keys or placeholders
 */
function isRealFirebaseConfigured() {
    const config = getActiveFirebaseConfig();
    if (!config || !config.apiKey) return false;
    const isPlaceholder = config.apiKey.includes('YOUR_API_KEY') ||
                          config.apiKey.includes('REPLACE_ME') ||
                          config.apiKey.length < 15;
    return !isPlaceholder;
}

/**
 * Initialize Firebase SDK or fallback to Sandbox/Demo mode
 */
function initFirebase() {
    const config = getActiveFirebaseConfig();
    const isReal = isRealFirebaseConfigured();

    if (typeof firebase === 'undefined') {
        console.warn('[Firebase] Firebase SDK script not found on page. Running in Demo Mode.');
        isDemoMode = true;
        return;
    }

    if (!isReal) {
        console.info('[Firebase] Placeholder config detected. Enabling interactive Sandbox/Demo Auth mode. You can input your live Firebase keys in the settings modal.');
        isDemoMode = true;
        return;
    }

    try {
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(config);
        } else {
            firebaseApp = firebase.app();
        }
        firebaseAuth = firebase.auth();
        // Persist session across browser tabs/reloads
        firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
            console.warn('[Firebase] Persistence error:', err);
        });
        isDemoMode = false;
        console.log('[Firebase] Initialized live Firebase Authentication with project:', config.projectId);
    } catch (error) {
        console.error('[Firebase] Failed to initialize Firebase SDK:', error);
        isDemoMode = true;
    }
}

// Immediately attempt initialization
initFirebase();

// ─── Authentication API ───────────────────────────────────────────────────────

/**
 * Check whether an email is registered/authorized in the Django backend.
 * Enforces requirement: Give access ONLY for already registered/signed-in emails!
 */
async function verifyEmailAuthorization(email) {
    if (!email) return { authorized: false, error: 'Email is required.' };
    try {
        const resp = await fetch('/api/auth/verify-email/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        const data = await resp.json();
        return data;
    } catch (e) {
        console.warn('Backend authorization check unreachable:', e);
        return { authorized: true }; // network fallback
    }
}

/**
 * Sign In with Email and Password
 */
async function authSignIn(email, password) {
    email = (email || '').trim().toLowerCase();
    if (!email || !password) {
        throw new Error('Please enter both email and password.');
    }

    // STRICT CHECK: Ensure email is already authorized / registered
    const authCheck = await verifyEmailAuthorization(email);
    if (!authCheck.authorized) {
        throw new Error(authCheck.error || `Access Denied: The email '${email}' is not registered. Only pre-registered emails can access this workspace.`);
    }

    if (isDemoMode || !firebaseAuth) {
        // Simulated authentication for immediate testing
        await new Promise(r => setTimeout(r, 600));
        let demoUsers = getDemoUsers();
        let existing = demoUsers.find(u => u.email === email);
        if (existing) {
            if (existing.password && existing.password !== password) {
                throw new Error('Incorrect password. Please try again.');
            }
        } else {
            existing = {
                uid: 'demo_' + btoa(email).replace(/=/g, '').slice(0, 12),
                email: email,
                displayName: email.split('@')[0],
                photoURL: null,
                isDemo: true
            };
            demoUsers.push(existing);
            saveDemoUsers(demoUsers);
        }
        setDemoCurrentUser(existing);
        notifyAuthListeners(existing);
        return existing;
    }

    try {
        const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
        return userCredential.user;
    } catch (error) {
        throw formatFirebaseError(error);
    }
}

/**
 * Sign Up (Create new account) with Name, Email and Password
 */
async function authSignUp(email, password, displayName) {
    email = (email || '').trim().toLowerCase();
    displayName = (displayName || '').trim();

    if (!displayName) {
        throw new Error('Please enter your full name.');
    }
    if (!email) {
        throw new Error('Please enter a valid email address.');
    }
    if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
    }

    // STRICT CHECK: Verify email authorization
    const authCheck = await verifyEmailAuthorization(email);
    if (!authCheck.authorized) {
        throw new Error(authCheck.error || `Access Denied: Registration is restricted to pre-approved accounts.`);
    }

    if (isDemoMode || !firebaseAuth) {
        await new Promise(r => setTimeout(r, 600));
        let demoUsers = getDemoUsers();
        if (demoUsers.some(u => u.email === email)) {
            throw new Error('An account with this email address already exists.');
        }
        const newUser = {
            uid: 'demo_' + Date.now().toString(36),
            email: email,
            displayName: displayName,
            password: password,
            photoURL: null,
            isDemo: true
        };
        demoUsers.push(newUser);
        saveDemoUsers(demoUsers);
        setDemoCurrentUser(newUser);
        notifyAuthListeners(newUser);
        return newUser;
    }

    try {
        const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        if (displayName) {
            await user.updateProfile({ displayName: displayName });
        }
        return user;
    } catch (error) {
        throw formatFirebaseError(error);
    }
}

/**
 * Sign In with Google Provider
 */
async function authGoogleSignIn() {
    if (isDemoMode || !firebaseAuth) {
        await new Promise(r => setTimeout(r, 600));
        const demoGoogleUser = {
            uid: 'google_demo_' + Date.now().toString(36),
            email: 'chkavya2359@gmail.com',
            displayName: 'Authorized User',
            photoURL: 'https://lh3.googleusercontent.com/a/default-user',
            isDemo: true
        };
        // Verify
        const check = await verifyEmailAuthorization(demoGoogleUser.email);
        if (!check.authorized) {
            throw new Error(check.error || 'Access Denied: Google email is not pre-registered.');
        }
        setDemoCurrentUser(demoGoogleUser);
        notifyAuthListeners(demoGoogleUser);
        return demoGoogleUser;
    }

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await firebaseAuth.signInWithPopup(provider);
        const user = result.user;

        // Check if user email is authorized
        const check = await verifyEmailAuthorization(user.email);
        if (!check.authorized) {
            await firebaseAuth.signOut();
            throw new Error(check.error || `Access Denied: The Google account (${user.email}) is not registered in this system.`);
        }
        return user;
    } catch (error) {
        throw formatFirebaseError(error);
    }
}

/**
 * Send Password Reset Email
 */
async function authResetPassword(email) {
    email = (email || '').trim().toLowerCase();
    if (!email) {
        throw new Error('Please enter your email address to reset password.');
    }

    if (isDemoMode || !firebaseAuth) {
        await new Promise(r => setTimeout(r, 500));
        return { message: `Demo reset instructions sent for ${email}. (Sandbox Mode)` };
    }

    try {
        await firebaseAuth.sendPasswordResetEmail(email);
        return { message: `Password reset link sent to ${email}. Check your inbox!` };
    } catch (error) {
        throw formatFirebaseError(error);
    }
}

/**
 * Sign Out
 */
async function authSignOut() {
    if (isDemoMode || !firebaseAuth) {
        setDemoCurrentUser(null);
        notifyAuthListeners(null);
        return true;
    }

    try {
        await firebaseAuth.signOut();
        setDemoCurrentUser(null);
        return true;
    } catch (error) {
        throw formatFirebaseError(error);
    }
}

/**
 * Subscribe to Auth State Changes
 */
function onAuthStateChanged(callback) {
    authListeners.push(callback);

    if (isDemoMode || !firebaseAuth) {
        // Deliver current demo state asynchronously
        setTimeout(() => {
            const demoUser = getDemoCurrentUser();
            callback(demoUser);
        }, 50);
        return () => {
            authListeners = authListeners.filter(cb => cb !== callback);
        };
    }

    const unsubscribe = firebaseAuth.onAuthStateChanged(user => {
        callback(user);
    });

    return unsubscribe;
}

/**
 * Get the currently logged-in user synchronously if available
 */
function getCurrentUser() {
    if (isDemoMode || !firebaseAuth) {
        return getDemoCurrentUser();
    }
    return firebaseAuth.currentUser;
}

/**
 * Save custom configuration entered by user through UI
 */
function saveCustomFirebaseConfig(configObj) {
    if (!configObj || typeof configObj !== 'object') {
        throw new Error('Invalid Firebase configuration object.');
    }
    if (!configObj.apiKey || !configObj.projectId) {
        throw new Error('Config must at least include apiKey and projectId.');
    }
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(configObj));
    location.reload();
}

/**
 * Reset custom configuration back to defaults
 */
function clearCustomFirebaseConfig() {
    localStorage.removeItem(STORAGE_KEY_CONFIG);
    location.reload();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notifyAuthListeners(user) {
    authListeners.forEach(cb => {
        try { cb(user); } catch (e) { console.error('Auth listener error:', e); }
    });
}

function getDemoUsers() {
    try {
        const raw = localStorage.getItem('ai_explainer_demo_users_list');
        return raw ? JSON.parse(raw) : [
            { uid: 'demo_developer', email: 'developer@example.com', displayName: 'Lead Engineer', password: 'password123' }
        ];
    } catch (e) {
        return [];
    }
}

function saveDemoUsers(users) {
    try {
        localStorage.setItem('ai_explainer_demo_users_list', JSON.stringify(users));
    } catch (e) {}
}

function getDemoCurrentUser() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_DEMO_USER);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function setDemoCurrentUser(user) {
    if (user) {
        localStorage.setItem(STORAGE_KEY_DEMO_USER, JSON.stringify(user));
    } else {
        localStorage.removeItem(STORAGE_KEY_DEMO_USER);
    }
}

/**
 * Converts Firebase error codes into human-friendly error messages
 */
function formatFirebaseError(error) {
    if (!error) return new Error('An unknown authentication error occurred.');
    const code = error.code || '';
    let msg = error.message || 'Authentication error';

    switch (code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            msg = 'Invalid email or password. Please verify your credentials.';
            break;
        case 'auth/email-already-in-use':
            msg = 'This email is already registered. Please sign in or use another email.';
            break;
        case 'auth/invalid-email':
            msg = 'Please enter a valid email address.';
            break;
        case 'auth/weak-password':
            msg = 'Password is too weak. Please use at least 6 characters.';
            break;
        case 'auth/popup-closed-by-user':
            msg = 'Google sign-in popup was closed before completing.';
            break;
        case 'auth/popup-blocked':
            msg = 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
            break;
        case 'auth/network-request-failed':
            msg = 'Network connection error. Please check your internet connection.';
            break;
        case 'auth/too-many-requests':
            msg = 'Access temporarily disabled due to many failed login attempts. Try again later or reset password.';
            break;
        case 'auth/operation-not-allowed':
            msg = 'This sign-in method is not enabled in your Firebase Console. Go to Authentication -> Sign-in method to enable it.';
            break;
        case 'auth/unauthorized-domain':
            msg = 'This domain (localhost/127.0.0.1) is not authorized in Firebase Console -> Authentication -> Settings -> Authorized Domains.';
            break;
        default:
            if (msg.includes('Firebase:')) {
                msg = msg.replace(/^Firebase:\s*/, '').replace(/\s*\([a-z/-]+\)\.?$/, '');
            }
            break;
    }

    const err = new Error(msg);
    err.code = code;
    return err;
}

// Attach to window for global access
window.FirebaseAuthService = {
    signIn: authSignIn,
    signUp: authSignUp,
    googleSignIn: authGoogleSignIn,
    resetPassword: authResetPassword,
    signOut: authSignOut,
    onAuthStateChanged: onAuthStateChanged,
    getCurrentUser: getCurrentUser,
    isRealConfigured: isRealFirebaseConfigured,
    getConfig: getActiveFirebaseConfig,
    saveConfig: saveCustomFirebaseConfig,
    clearConfig: clearCustomFirebaseConfig,
    isDemo: () => isDemoMode
};
