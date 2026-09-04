import { ChatMessage, SavedSessionState, UploadedFile, SourceAssessment, RecentSessionItem } from '../types.ts';
import { db, isFirebaseConfigured } from '../services/firebase.ts';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

const SESSION_STORAGE_KEY = 'sift-toolbox-session';
const RECENT_SESSIONS_STORAGE_KEY = 'sift-toolbox-recent-sessions';
const MAX_RECENT_SESSIONS = 30;

export const generateSessionId = (): string => {
  return `sift_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
};

/**
 * Derives a human-readable title for a session
 */
export const deriveSessionTitle = (state: SavedSessionState): string => {
  if (state.sessionTopic && state.sessionTopic.trim().length > 0) {
    return state.sessionTopic.trim();
  }
  if (state.chatMessages && state.chatMessages.length > 0) {
    const firstUserMsg = state.chatMessages.find(m => m.sender === 'user' && m.text && m.text.trim().length > 0);
    if (firstUserMsg && firstUserMsg.text) {
      const trimmed = firstUserMsg.text.trim();
      return trimmed.length > 55 ? `${trimmed.slice(0, 52)}...` : trimmed;
    }
  }
  if (state.sessionUrls && state.sessionUrls.trim().length > 0) {
    const firstUrl = state.sessionUrls.trim().split('\n')[0].trim();
    if (firstUrl) return firstUrl.length > 50 ? `${firstUrl.slice(0, 47)}...` : firstUrl;
  }
  if (state.sessionFiles && state.sessionFiles.length > 0) {
    return `Analysis of ${state.sessionFiles[0].name}`;
  }
  const dateStr = new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `Investigation · ${dateStr}`;
};

/**
 * Derives a brief snippet preview of the session
 */
export const derivePreviewText = (state: SavedSessionState): string | undefined => {
  if (!state.chatMessages || state.chatMessages.length === 0) {
    if (state.sessionContext && state.sessionContext.trim()) {
      return state.sessionContext.trim().slice(0, 120);
    }
    return undefined;
  }
  // Try to find the first AI response or last message
  const aiMsg = state.chatMessages.find(m => m.sender === 'ai' && m.text && m.text.trim().length > 0);
  if (aiMsg && aiMsg.text) {
    return aiMsg.text.replace(/[#*`_]/g, '').trim().slice(0, 140);
  }
  const lastMsg = state.chatMessages[state.chatMessages.length - 1];
  if (lastMsg && lastMsg.text) {
    return lastMsg.text.trim().slice(0, 140);
  }
  return undefined;
};

/**
 * Creates a clean copy of the uploaded file without base64Data to avoid quota limits
 */
const sanitizeFile = (file: UploadedFile): UploadedFile => {
  return {
    name: String(file.name || ''),
    type: String(file.type || ''),
    size: Number(file.size || 0),
  };
};

/**
 * Creates a clean, safe copy of a chat message, stripping any circular references
 * or non-serializable objects.
 */
const sanitizeChatMessage = (msg: ChatMessage): ChatMessage => {
  return {
    id: String(msg.id || ''),
    sender: msg.sender === 'user' ? 'user' : 'ai',
    text: String(msg.text || ''),
    timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp || Date.now()),
    isLoading: false,
    isError: Boolean(msg.isError),
    groundingSources: Array.isArray(msg.groundingSources)
      ? msg.groundingSources
          .filter(s => s && s.web)
          .map(s => ({
            web: {
              uri: String(s.web?.uri || ''),
              title: s.web?.title ? String(s.web.title) : undefined
            }
          }))
      : undefined,
    uploadedFiles: Array.isArray(msg.uploadedFiles) ? msg.uploadedFiles.map(sanitizeFile) : undefined,
    modelId: msg.modelId ? String(msg.modelId) : undefined,
    isInitialSIFTReport: Boolean(msg.isInitialSIFTReport),
    originalQueryReportType: msg.originalQueryReportType,
    isFromCache: Boolean(msg.isFromCache),
    followUpQueries: Array.isArray(msg.followUpQueries) ? msg.followUpQueries.map(q => String(q)) : undefined,
    originalQuery: msg.originalQuery ? {
      text: String(msg.originalQuery.text || ''),
      reportType: msg.originalQuery.reportType,
      urls: Array.isArray(msg.originalQuery.urls) ? msg.originalQuery.urls.map(u => String(u)) : [],
      files: Array.isArray(msg.originalQuery.files) ? msg.originalQuery.files.map(sanitizeFile) : []
    } : undefined
  };
};

/**
 * Creates a clean source assessment object, stripping any D3 simulation properties
 */
const sanitizeSourceAssessment = (source: SourceAssessment): SourceAssessment => {
  return {
    name: String(source.name || ''),
    url: String(source.url || ''),
    assessment: String(source.assessment || ''),
    notes: String(source.notes || ''),
    rating: String(source.rating || ''),
    index: Number(source.index || 0),
    linkValidationStatus: source.linkValidationStatus
  };
};

/**
 * Selects only serializable data from the session state and removes base64 file data.
 */
const sanitizeStateForSaving = (state: SavedSessionState): SavedSessionState => {
  return {
    sessionId: state.sessionId ? String(state.sessionId) : undefined,
    chatMessages: Array.isArray(state.chatMessages) ? state.chatMessages.map(sanitizeChatMessage) : [],
    sessionTopic: String(state.sessionTopic || ''),
    sessionContext: String(state.sessionContext || ''),
    sessionFiles: Array.isArray(state.sessionFiles) ? state.sessionFiles.map(sanitizeFile) : [],
    sessionUrls: String(state.sessionUrls || ''),
    currentSiftQueryDetails: state.currentSiftQueryDetails ? {
      sessionTopic: String(state.currentSiftQueryDetails.sessionTopic || ''),
      sessionContext: String(state.currentSiftQueryDetails.sessionContext || ''),
      sessionFiles: Array.isArray(state.currentSiftQueryDetails.sessionFiles)
        ? state.currentSiftQueryDetails.sessionFiles.map(sanitizeFile)
        : [],
      sessionUrls: Array.isArray(state.currentSiftQueryDetails.sessionUrls)
        ? state.currentSiftQueryDetails.sessionUrls.map(u => String(u))
        : []
    } : null,
    originalQueryForRestart: state.originalQueryForRestart ? {
      text: String(state.originalQueryForRestart.text || ''),
      reportType: state.originalQueryForRestart.reportType,
      urls: Array.isArray(state.originalQueryForRestart.urls) ? state.originalQueryForRestart.urls.map(u => String(u)) : [],
      files: Array.isArray(state.originalQueryForRestart.files) ? state.originalQueryForRestart.files.map(sanitizeFile) : []
    } : null,
    sourceAssessments: Array.isArray(state.sourceAssessments) ? state.sourceAssessments.map(sanitizeSourceAssessment) : [],
    selectedProviderKey: state.selectedProviderKey,
    selectedModelId: String(state.selectedModelId || ''),
    modelConfigParams: state.modelConfigParams ? { ...state.modelConfigParams } : {},
    enableGeminiPreprocessing: Boolean(state.enableGeminiPreprocessing),
    userApiKeys: state.userApiKeys ? { ...state.userApiKeys } : {},
    apiKeyValidation: state.apiKeyValidation ? { ...state.apiKeyValidation } : {},
    customSystemPrompt: String(state.customSystemPrompt || ''),
    customCommands: Array.isArray(state.customCommands) ? state.customCommands.map(cmd => ({
      id: String(cmd.id),
      name: String(cmd.name),
      prompt: String(cmd.prompt),
      description: cmd.description ? String(cmd.description) : undefined,
      parameters: cmd.parameters ? { ...cmd.parameters } : undefined
    })) : []
  };
};

/**
 * Saves the session state to recent sessions in browser localStorage (and Firestore if logged in).
 * Returns the effective sessionId.
 */
export const saveSession = async (
  state: SavedSessionState, 
  userId?: string, 
  sessionId?: string
): Promise<{ sessionId: string }> => {
  const effectiveSessionId = sessionId || state.sessionId || generateSessionId();
  
  try {
    const stateWithId: SavedSessionState = {
      ...state,
      sessionId: effectiveSessionId
    };
    const sanitizedState = sanitizeStateForSaving(stateWithId);

    // Save to Recent Sessions list in localStorage
    try {
      let recentList: RecentSessionItem[] = [];
      const storedRecent = localStorage.getItem(RECENT_SESSIONS_STORAGE_KEY);
      if (storedRecent) {
        try {
          const parsed = JSON.parse(storedRecent);
          if (Array.isArray(parsed)) recentList = parsed;
        } catch {
          recentList = [];
        }
      }

      const existingIndex = recentList.findIndex(item => item.id === effectiveSessionId);
      const now = Date.now();
      const title = deriveSessionTitle(sanitizedState);
      const previewText = derivePreviewText(sanitizedState);
      const messageCount = sanitizedState.chatMessages.length;
      const sourceCount = sanitizedState.sourceAssessments.length;

      if (existingIndex >= 0) {
        recentList[existingIndex] = {
          ...recentList[existingIndex],
          title,
          updatedAt: now,
          messageCount,
          sourceCount,
          previewText,
          state: sanitizedState
        };
      } else {
        recentList.unshift({
          id: effectiveSessionId,
          title,
          createdAt: now,
          updatedAt: now,
          messageCount,
          sourceCount,
          previewText,
          state: sanitizedState
        });
      }

      // Sort by most recently updated and limit
      recentList.sort((a, b) => b.updatedAt - a.updatedAt);
      if (recentList.length > MAX_RECENT_SESSIONS) {
        recentList = recentList.slice(0, MAX_RECENT_SESSIONS);
      }

      localStorage.setItem(RECENT_SESSIONS_STORAGE_KEY, JSON.stringify(recentList));
    } catch (recentErr) {
      console.warn("Could not update recent sessions in localStorage:", recentErr);
    }

    // Always update current active session in localStorage
    const jsonState = JSON.stringify(sanitizedState);
    localStorage.setItem(SESSION_STORAGE_KEY, jsonState);

    // Firestore sync if configured and user logged in
    if (userId && isFirebaseConfigured() && db) {
      try {
        await Promise.all([
          setDoc(doc(db, 'users', userId, 'sessions', 'current'), sanitizedState),
          setDoc(doc(db, 'users', userId, 'sessions', effectiveSessionId), sanitizedState)
        ]);
      } catch (firestoreError) {
        console.warn("Firestore session save failed, using localStorage:", firestoreError);
      }
    }
  } catch (error) {
    console.error("Failed to save session:", error);
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      alert("Could not save session: Storage quota exceeded. Please consider deleting some older sessions.");
    }
  }

  return { sessionId: effectiveSessionId };
};

/**
 * Retrieves the list of recent sessions from localStorage (with legacy migration support).
 */
export const getRecentSessions = async (userId?: string): Promise<RecentSessionItem[]> => {
  try {
    let recentList: RecentSessionItem[] = [];
    const storedRecent = localStorage.getItem(RECENT_SESSIONS_STORAGE_KEY);
    if (storedRecent) {
      try {
        const parsed = JSON.parse(storedRecent);
        if (Array.isArray(parsed)) recentList = parsed;
      } catch (e) {
        console.warn("Error parsing recent sessions from localStorage:", e);
      }
    }

    // Migration: If no recent sessions exist yet, check if there's a legacy active session to preserve
    if (recentList.length === 0) {
      const singleSessionStr = localStorage.getItem(SESSION_STORAGE_KEY);
      if (singleSessionStr) {
        try {
          const single = JSON.parse(singleSessionStr) as SavedSessionState;
          if (single && (single.chatMessages?.length > 0 || single.sessionTopic?.trim())) {
            const id = single.sessionId || generateSessionId();
            single.sessionId = id;
            const now = Date.now();
            const migratedItem: RecentSessionItem = {
              id,
              title: deriveSessionTitle(single),
              createdAt: now,
              updatedAt: now,
              messageCount: single.chatMessages?.length || 0,
              sourceCount: single.sourceAssessments?.length || 0,
              previewText: derivePreviewText(single),
              state: single
            };
            recentList = [migratedItem];
            localStorage.setItem(RECENT_SESSIONS_STORAGE_KEY, JSON.stringify(recentList));
          }
        } catch (migErr) {
          console.warn("Migration of single session to recent sessions failed:", migErr);
        }
      }
    }

    // Revive Date timestamps in all messages
    return recentList.map(item => {
      if (item.state && Array.isArray(item.state.chatMessages)) {
        item.state.chatMessages = item.state.chatMessages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp || Date.now())
        }));
      }
      return item;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error("Failed to get recent sessions:", err);
    return [];
  }
};

/**
 * Loads a specific session by its ID.
 */
export const loadSessionById = async (sessionId: string, userId?: string): Promise<SavedSessionState | null> => {
  try {
    const list = await getRecentSessions(userId);
    const target = list.find(s => s.id === sessionId);
    if (target && target.state) {
      // Set as active session
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(target.state));
      return target.state;
    }

    // Try Firestore if user is authenticated
    if (userId && isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, 'users', userId, 'sessions', sessionId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const state = snap.data() as SavedSessionState;
          if (state.chatMessages && Array.isArray(state.chatMessages)) {
            state.chatMessages = state.chatMessages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
          }
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
          return state;
        }
      } catch (fsErr) {
        console.warn("Failed to load session by ID from Firestore:", fsErr);
      }
    }

    return null;
  } catch (err) {
    console.error(`Failed to load session ${sessionId}:`, err);
    return null;
  }
};

/**
 * Deletes a session from the recent list and storage.
 */
export const deleteRecentSession = async (sessionId: string, userId?: string): Promise<void> => {
  try {
    const storedRecent = localStorage.getItem(RECENT_SESSIONS_STORAGE_KEY);
    if (storedRecent) {
      try {
        const list = JSON.parse(storedRecent) as RecentSessionItem[];
        const filtered = list.filter(item => item.id !== sessionId);
        localStorage.setItem(RECENT_SESSIONS_STORAGE_KEY, JSON.stringify(filtered));
      } catch (e) {
        console.warn("Failed to filter recent sessions:", e);
      }
    }

    // Check if the deleted session was the current one
    const currentRaw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (currentRaw) {
      try {
        const current = JSON.parse(currentRaw);
        if (current.sessionId === sessionId) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch {
        // Ignore
      }
    }

    // Delete from Firestore
    if (userId && isFirebaseConfigured() && db) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'sessions', sessionId));
      } catch (e) {
        console.warn("Failed to delete session from Firestore:", e);
      }
    }
  } catch (err) {
    console.error("Failed to delete recent session:", err);
  }
};

/**
 * Clears all recent sessions and the current session.
 */
export const clearAllRecentSessions = async (userId?: string): Promise<void> => {
  try {
    localStorage.removeItem(RECENT_SESSIONS_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);

    if (userId && isFirebaseConfigured() && db) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'sessions', 'current'));
      } catch (e) {
        console.warn("Failed to delete current session from Firestore:", e);
      }
    }
  } catch (err) {
    console.error("Failed to clear all recent sessions:", err);
  }
};

/**
 * Loads the current active session state from Firestore or localStorage.
 */
export const loadSession = async (userId?: string): Promise<SavedSessionState | null> => {
  try {
    let savedState: SavedSessionState | null = null;

    if (userId && isFirebaseConfigured() && db) {
      try {
        const docRef = doc(db, 'users', userId, 'sessions', 'current');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          savedState = docSnap.data() as SavedSessionState;
        }
      } catch (firestoreError) {
        console.warn("Firestore session load failed, attempting localStorage fallback:", firestoreError);
      }
    }

    if (!savedState) {
      const jsonState = localStorage.getItem(SESSION_STORAGE_KEY);
      if (jsonState) {
        savedState = JSON.parse(jsonState);
      }
    }

    if (!savedState) return null;

    if (savedState.chatMessages && Array.isArray(savedState.chatMessages)) {
      savedState.chatMessages = savedState.chatMessages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
    }

    return savedState;
  } catch (error) {
    console.error("Failed to load or parse session:", error);
    await clearSession(userId);
    return null;
  }
};

/**
 * Checks if a saved session or recent sessions exist without loading full details.
 */
export const hasSavedSession = async (userId?: string): Promise<boolean> => {
  try {
    const recent = localStorage.getItem(RECENT_SESSIONS_STORAGE_KEY);
    if (recent) {
      try {
        const parsed = JSON.parse(recent);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
      } catch {
        // Ignore
      }
    }

    if (localStorage.getItem(SESSION_STORAGE_KEY) !== null) {
      return true;
    }

    if (userId && isFirebaseConfigured() && db) {
      const docRef = doc(db, 'users', userId, 'sessions', 'current');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) return true;
    }
  } catch (e) {
    console.warn("Error checking for saved session:", e);
  }
  return false;
};

/**
 * Clears the active session.
 */
export const clearSession = async (userId?: string): Promise<void> => {
  try {
    if (userId && isFirebaseConfigured() && db) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'sessions', 'current'));
      } catch (firestoreError) {
        console.warn("Firestore session delete failed:", firestoreError);
      }
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
};