import { ChatMessage, SavedSessionState, UploadedFile } from '../types.ts';
import { db } from '../services/firebase.ts';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

const SESSION_STORAGE_KEY = 'sift-toolbox-session';

/**
 * Creates a deep copy of the state and removes the 'base64Data' from any UploadedFile objects
 * to prevent localStorage quota errors.
 * @param state The original session state.
 * @returns A new state object without large file data.
 */
const sanitizeStateForSaving = (state: SavedSessionState): SavedSessionState => {
  // Deep copy to avoid mutating the live app state.
  const stateToSave = JSON.parse(JSON.stringify(state));

  const stripBase64 = (files?: UploadedFile[]): UploadedFile[] | undefined => {
    if (!files) return undefined;
    // Create new file objects without the base64Data property
    return files.map(file => {
        const { base64Data, ...rest } = file;
        return rest as UploadedFile;
    });
  };

  // 1. Sanitize chatMessages
  if (stateToSave.chatMessages) {
    stateToSave.chatMessages.forEach((msg: ChatMessage) => {
      if (msg.uploadedFiles) {
        msg.uploadedFiles = stripBase64(msg.uploadedFiles);
      }
      if (msg.originalQuery?.files) {
        msg.originalQuery.files = stripBase64(msg.originalQuery.files);
      }
    });
  }

  // 2. Sanitize currentSiftQueryDetails
  if (stateToSave.currentSiftQueryDetails?.sessionFiles) {
    stateToSave.currentSiftQueryDetails.sessionFiles = stripBase64(stateToSave.currentSiftQueryDetails.sessionFiles) || [];
  }

  // 3. Sanitize originalQueryForRestart
  if (stateToSave.originalQueryForRestart?.files) {
    stateToSave.originalQueryForRestart.files = stripBase64(stateToSave.originalQueryForRestart.files);
  }

  return stateToSave;
};


/**
 * Saves the current session state to localStorage or Firestore if userId is provided.
 * @param state - The complete state of the session to save.
 * @param userId - Optional user ID for Firestore saving.
 */
export const saveSession = async (state: SavedSessionState, userId?: string): Promise<void> => {
  try {
    const sanitizedState = sanitizeStateForSaving(state);
    
    if (userId && db) {
      await setDoc(doc(db, 'users', userId, 'sessions', 'current'), sanitizedState);
    } else {
      const jsonState = JSON.stringify(sanitizedState);
      localStorage.setItem(SESSION_STORAGE_KEY, jsonState);
    }
  } catch (error) {
    console.error("Failed to save session:", error);
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        alert("Could not save session: Storage quota exceeded. The session data is too large even after optimization (e.g., from a very long chat history). Please consider starting a new session to ensure progress is saved.");
    }
  }
};

/**
 * Loads the session state from localStorage or Firestore.
 * Handles reviving Date objects from their string representations.
 * @param userId - Optional user ID for Firestore loading.
 * @returns The parsed session state object, or null if not found or invalid.
 */
export const loadSession = async (userId?: string): Promise<SavedSessionState | null> => {
  try {
    let savedState: SavedSessionState | null = null;

    if (userId && db) {
      const docRef = doc(db, 'users', userId, 'sessions', 'current');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        savedState = docSnap.data() as SavedSessionState;
      }
    } else {
      const jsonState = localStorage.getItem(SESSION_STORAGE_KEY);
      if (jsonState) {
        savedState = JSON.parse(jsonState);
      }
    }

    if (!savedState) return null;

    // Revive Date objects which are stored as strings in JSON.
    if (savedState.chatMessages) {
      savedState.chatMessages = savedState.chatMessages.map((msg: ChatMessage) => ({
        ...msg,
        timestamp: new Date(msg.timestamp), // Convert string back to Date object
      }));
    }

    return savedState;
  } catch (error) {
    console.error("Failed to load or parse session:", error);
    // If parsing fails, it's good practice to clear the corrupted data.
    await clearSession(userId);
    return null;
  }
};

/**
 * Checks if a saved session exists without loading it.
 * @param userId - Optional user ID for Firestore checking.
 * @returns True if a session exists, false otherwise.
 */
export const hasSavedSession = async (userId?: string): Promise<boolean> => {
  if (userId && db) {
    const docRef = doc(db, 'users', userId, 'sessions', 'current');
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  }
  return localStorage.getItem(SESSION_STORAGE_KEY) !== null;
};

/**
 * Clears the saved session.
 * @param userId - Optional user ID for Firestore clearing.
 */
export const clearSession = async (userId?: string): Promise<void> => {
  try {
    if (userId && db) {
      await deleteDoc(doc(db, 'users', userId, 'sessions', 'current'));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
};