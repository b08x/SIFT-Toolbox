/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

// Standard cleanup function for config values
const val = (v: any) => (typeof v === 'string' && v.trim() !== '' && v.trim() !== 'sift-toolbox') ? v.trim() : undefined;

if (typeof window !== 'undefined') {
    console.log('[Firebase Debug] Env Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID);
    console.log('[Firebase Debug] Config Project ID:', firebaseConfig.projectId);
    console.log('[Firebase Debug] Current Origin:', window.location.origin);
}

const finalConfig = {
    apiKey: val(import.meta.env.VITE_FIREBASE_API_KEY) || val(firebaseConfig.apiKey),
    authDomain: val(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || val(firebaseConfig.authDomain),
    projectId: val(import.meta.env.VITE_FIREBASE_PROJECT_ID) || val(firebaseConfig.projectId),
    storageBucket: val(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || val(firebaseConfig.storageBucket),
    messagingSenderId: val(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || val(firebaseConfig.messagingSenderId),
    appId: val(import.meta.env.VITE_FIREBASE_APP_ID) || val(firebaseConfig.appId),
};

const databaseId = val(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID) || val(firebaseConfig.firestoreDatabaseId);

const app = initializeApp(finalConfig);

if (typeof window !== 'undefined') {
    console.log('[Firebase] Active Project:', finalConfig.projectId);
    console.log('[Firebase] Auth Domain:', finalConfig.authDomain);
}

export const auth = getAuth(app);
// Ensure persistence is set for the browser environment
if (typeof window !== 'undefined') {
    setPersistence(auth, browserLocalPersistence).catch(err => {
        console.warn("[Firebase] Could not set persistence:", err);
    });
}
export const db = getFirestore(app, databaseId);
export const googleProvider = new GoogleAuthProvider();

export const isFirebaseConfigured = () => !!finalConfig.apiKey;

/**
 * Standard Firestore error handler as per security instructions.
 */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
