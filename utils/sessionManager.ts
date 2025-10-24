import { ChatMessage, SavedSessionState, UploadedFile } from '../types';

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
 * Saves the current session state to localStorage.
 * @param state - The complete state of the session to save.
 */
export const saveSession = (state: SavedSessionState): void => {
  try {
    const sanitizedState = sanitizeStateForSaving(state);
    const jsonState = JSON.stringify(sanitizedState);
    localStorage.setItem(SESSION_STORAGE_KEY, jsonState);
  } catch (error) {
    console.error("Failed to save session to localStorage:", error);
    // Add a user-facing alert for this critical error, as it means progress is not being saved.
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        alert("Could not save session: Storage quota exceeded. The session data is too large even after optimization (e.g., from a very long chat history). Please consider starting a new session to ensure progress is saved.");
    }
  }
};

/**
 * Loads the session state from localStorage.
 * Handles reviving Date objects from their string representations.
 * @returns The parsed session state object, or null if not found or invalid.
 */
export const loadSession = (): SavedSessionState | null => {
  try {
    const jsonState = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!jsonState) {
      return null;
    }
    
    const savedState: SavedSessionState = JSON.parse(jsonState);

    // Revive Date objects which are stored as strings in JSON.
    if (savedState.chatMessages) {
      savedState.chatMessages = savedState.chatMessages.map((msg: ChatMessage) => ({
        ...msg,
        timestamp: new Date(msg.timestamp), // Convert string back to Date object
      }));
    }

    return savedState;
  } catch (error) {
    console.error("Failed to load or parse session from localStorage:", error);
    // If parsing fails, it's good practice to clear the corrupted data.
    clearSession();
    return null;
  }
};

/**
 * Checks if a saved session exists in localStorage without loading it.
 * @returns True if a session exists, false otherwise.
 */
export const hasSavedSession = (): boolean => {
  return localStorage.getItem(SESSION_STORAGE_KEY) !== null;
};

/**
 * Clears the saved session from localStorage.
 */
export const clearSession = (): void => {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear session from localStorage:", error);
  }
};