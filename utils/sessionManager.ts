import { ChatMessage, SavedSessionState } from '../types';

const SESSION_STORAGE_KEY = 'sift-toolbox-session';

/**
 * Saves the current session state to localStorage.
 * @param state - The complete state of the session to save.
 */
export const saveSession = (state: SavedSessionState): void => {
  try {
    const jsonState = JSON.stringify(state);
    localStorage.setItem(SESSION_STORAGE_KEY, jsonState);
  } catch (error) {
    console.error("Failed to save session to localStorage:", error);
    // Could implement a more robust error handling, e.g., notifying the user.
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