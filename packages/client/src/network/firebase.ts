// Firebase project init — the one shared backend both players' browsers connect to for
// online play. The apiKey etc. below are NOT secret (Firebase web config is meant to be
// public in client code; actual access control is enforced by Firestore security rules, not
// by hiding this object) — see console.firebase.google.com project settings if these ever
// need to be regenerated. Same pattern as every other project in the series.
//
// REPLACE_ME placeholders below — online play (creating/joining a room) won't work until
// these are filled in with a real Firebase project's config. See the README's "Deploying"
// section for the two-minute setup. Local (vs-bots) play works with zero setup either way.
import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.firebasestorage.app',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

const app = initializeApp(firebaseConfig);
// The engine's GameState has several optional fields (PlayerState.personality, Bid values,
// etc.) that come through as `undefined` rather than omitted for human players/mid-game —
// Firestore rejects `undefined` field values by default, so this tells it to silently drop
// them instead of throwing on every game-state write.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
