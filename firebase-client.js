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
  getDocFromServer,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const config = window.DAYLIGHT_FIREBASE_CONFIG;
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const stateDocument = user => doc(db, 'users', user.uid, 'app', 'state');

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

function readSnapshot(snapshot) {
  if (!snapshot.exists()) return {state: null, version: null};
  const {state, version, updatedAt} = snapshot.data();
  return {state, version: version || `legacy:${updatedAt?.seconds ?? 0}:${updatedAt?.nanoseconds ?? 0}`};
}

async function loadState(user) {
  return readSnapshot(await getDocFromServer(stateDocument(user)));
}

function writeState(user, state, base, version) {
  const ref = stateDocument(user);
  return runTransaction(db, async transaction => {
    const current = readSnapshot(await transaction.get(ref));
    if (auth.currentUser?.uid !== user.uid || (current.version !== base && current.version !== version)) return false;
    if (current.version !== version) transaction.set(ref, {state, version, updatedAt: serverTimestamp()});
    return true;
  });
}

window.DAYLIGHT_AUTH = {
  currentUser: null,
  errorMessage,
  loadState,
  writeState,
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  signUp: async (name, email, password) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await updateProfile(credential.user, {displayName: name});
      if (auth.currentUser?.uid === credential.user.uid) {
        window.dispatchEvent(new CustomEvent('daylight-auth-profile', {detail: {user: credential.user}}));
      }
    } catch (error) {
      console.error('Daylight could not save the account display name', error.code);
    }
    return credential;
  },
  signOut: () => signOut(auth)
};

onAuthStateChanged(auth, user => {
  window.DAYLIGHT_AUTH.currentUser = user;
  window.dispatchEvent(new CustomEvent('daylight-auth-state', {detail: {user}}));
});

window.dispatchEvent(new Event('daylight-auth-ready'));
