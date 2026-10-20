import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  doc,
  getFirestore,
  getDoc,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const config = window.DAYLIGHT_FIREBASE_CONFIG;
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const stateDocument = user => doc(db, 'users', user.uid, 'app', 'state');
let syncTimer;
let syncVersion = 0;

const errorMessage = error => {
  const messages = {
    'auth/email-already-in-use': 'That email already has an account. Try signing in.',
    'auth/invalid-credential': 'That email or password is not correct.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a password with at least six characters.',
    'auth/network-request-failed': 'Connection trouble. Check your network and try again.'
  };
  return messages[error?.code] || 'Firebase could not complete that request. Try again.';
};

async function loadState(user) {
  const snapshot = await getDoc(stateDocument(user));
  return snapshot.exists() ? snapshot.data().state : null;
}

function queueSync(user, state) {
  const version = ++syncVersion;
  const snapshot = JSON.parse(JSON.stringify(state));
  clearTimeout(syncTimer);
  window.dispatchEvent(new CustomEvent('daylight-sync-status', {detail: {status: 'pending'}}));
  syncTimer = setTimeout(async () => {
    try {
      await setDoc(stateDocument(user), {state: snapshot, updatedAt: serverTimestamp()});
      if (version !== syncVersion) return;
      window.dispatchEvent(new CustomEvent('daylight-sync-status', {detail: {status: 'saved'}}));
    } catch (error) {
      console.error('Daylight cloud sync failed', error);
      if (version !== syncVersion) return;
      window.dispatchEvent(new CustomEvent('daylight-sync-status', {detail: {status: 'error'}}));
    }
  }, 500);
}

window.DAYLIGHT_AUTH = {
  currentUser: null,
  errorMessage,
  loadState,
  queueSync: state => {
    if (window.DAYLIGHT_AUTH.currentUser) queueSync(window.DAYLIGHT_AUTH.currentUser, state);
  },
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  signUp: async (name, email, password) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, {displayName: name});
    return credential;
  },
  signOut: () => signOut(auth)
};

onAuthStateChanged(auth, user => {
  syncVersion++;
  clearTimeout(syncTimer);
  window.DAYLIGHT_AUTH.currentUser = user;
  window.dispatchEvent(new CustomEvent('daylight-auth-state', {detail: {user}}));
});

window.dispatchEvent(new Event('daylight-auth-ready'));
