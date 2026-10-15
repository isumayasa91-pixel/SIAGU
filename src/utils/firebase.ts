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

/**
 * Save SIAGU state to Firebase Firestore for real-time cross-device sync
 */
export async function saveToFirestore(stateJson: string, updatedBy: string = 'Admin/Guru'): Promise<boolean> {
  try {
    const docRef = doc(db, SIAGU_COLLECTION, CENTRAL_DOC_PATH);
    await setDoc(docRef, {
      updatedAt: new Date().toISOString(),
      updatedBy,
      stateJson,
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('[Firebase Firestore] Failed to save state to Firestore:', error);
    return false;
  }
}

/**
 * Fetch SIAGU state from Firebase Firestore
 */
export async function fetchFromFirestore(): Promise<string | null> {
  try {
    const docRef = doc(db, SIAGU_COLLECTION, CENTRAL_DOC_PATH);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.stateJson === 'string') {
        return data.stateJson;
      }
    }
    return null;
  } catch (error) {
    console.error('[Firebase Firestore] Failed to fetch state from Firestore:', error);
    return null;
  }
}

/**
 * Listen to real-time changes from Firestore across all devices
 */
export function subscribeToFirestore(onDataReceived: (stateJson: string) => void): () => void {
  try {
    const docRef = doc(db, SIAGU_COLLECTION, CENTRAL_DOC_PATH);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && typeof data.stateJson === 'string') {
          onDataReceived(data.stateJson);
        }
      }
    }, (err) => {
      console.warn('[Firebase Firestore] Snapshot listener warning:', err.message);
    });
    return unsubscribe;
  } catch (err) {
    console.error('[Firebase Firestore] Failed to setup listener:', err);
    return () => {};
  }
}
