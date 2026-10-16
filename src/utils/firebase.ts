import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App instance
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore using the configured database ID
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const CENTRAL_DOC_PATH = 'central_database';
export const SIAGU_COLLECTION = 'siagu_data';

const QUOTA_STORAGE_KEY = 'siagu_firestore_quota_until';

export function isFirestoreQuotaExhausted(): boolean {
  try {
    const until = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (until) {
      const untilTime = parseInt(until, 10);
      if (Date.now() < untilTime) {
        return true;
      } else {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      }
    }
  } catch (e) {
    // Ignore storage errors
  }
  return false;
}

export function markFirestoreQuotaExhausted(hours: number = 6): void {
  try {
    const expireTime = Date.now() + hours * 60 * 60 * 1000;
    localStorage.setItem(QUOTA_STORAGE_KEY, expireTime.toString());
    console.warn(`[Firebase Firestore] Free tier quota reached. Using high-speed local & server container sync for the next ${hours} hours.`);
  } catch (e) {
    // Ignore storage errors
  }
}

let lastSavedPayload = '';
let saveDebounceTimer: any = null;

/**
 * Save SIAGU state to Firebase Firestore for real-time cross-device sync
 */
export async function saveToFirestore(stateJson: string, updatedBy: string = 'Admin/Guru'): Promise<boolean> {
  // 1. If payload hasn't changed, skip redundant write
  if (stateJson === lastSavedPayload) {
    return true;
  }

  // 2. If quota is known to be exhausted, skip writing to prevent errors & backoff loops
  if (isFirestoreQuotaExhausted()) {
    return false;
  }

  try {
    const docRef = doc(db, SIAGU_COLLECTION, CENTRAL_DOC_PATH);
    await setDoc(docRef, {
      updatedAt: new Date().toISOString(),
      updatedBy,
      stateJson,
    }, { merge: true });
    lastSavedPayload = stateJson;
    return true;
  } catch (error: any) {
    const errorStr = String(error?.message || error?.code || error);
    if (
      errorStr.includes('resource-exhausted') ||
      errorStr.includes('Quota limit exceeded') ||
      error?.code === 'resource-exhausted'
    ) {
      markFirestoreQuotaExhausted(8);
      return false;
    } else {
      console.warn('[Firebase Firestore] Save note:', errorStr);
    }
    return false;
  }
}

/**
 * Fetch SIAGU state from Firebase Firestore
 */
export async function fetchFromFirestore(): Promise<string | null> {
  if (isFirestoreQuotaExhausted()) {
    return null;
  }

  try {
    const docRef = doc(db, SIAGU_COLLECTION, CENTRAL_DOC_PATH);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.stateJson === 'string') {
        lastSavedPayload = data.stateJson;
        return data.stateJson;
      }
    }
    return null;
  } catch (error: any) {
    const errorStr = String(error?.message || error?.code || error);
    if (
      errorStr.includes('resource-exhausted') ||
      errorStr.includes('Quota limit exceeded') ||
      error?.code === 'resource-exhausted'
    ) {
      markFirestoreQuotaExhausted(8);
    }
    return null;
  }
}

/**
 * Listen to real-time changes from Firestore across all devices
 */
export function subscribeToFirestore(onDataReceived: (stateJson: string) => void): () => void {
  if (isFirestoreQuotaExhausted()) {
    return () => {};
  }

  try {
    const docRef = doc(db, SIAGU_COLLECTION, CENTRAL_DOC_PATH);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data && typeof data.stateJson === 'string') {
            lastSavedPayload = data.stateJson;
            onDataReceived(data.stateJson);
          }
        }
      },
      (err: any) => {
        const errorStr = String(err?.message || err?.code || err);
        if (
          errorStr.includes('resource-exhausted') ||
          errorStr.includes('Quota limit exceeded') ||
          err?.code === 'resource-exhausted'
        ) {
          markFirestoreQuotaExhausted(8);
        }
      }
    );
    return unsubscribe;
  } catch (err) {
    return () => {};
  }
}
