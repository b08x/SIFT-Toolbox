import { create } from 'zustand';
import { 
    SavedSessionState, 
    ChatMessage, 
    CurrentSiftQueryDetails, 
    OriginalQueryInfo, 
    SourceAssessment, 
    AIProvider, 
    ConfigurableParams, 
    ApiKeyValidationStates,
    UploadedFile
} from './types.ts';
import { INITIAL_MODELS_CONFIG } from './models.config.ts';

// FIX: Refactor AppState to separate state properties from actions to resolve a TypeScript error with spreading a complex Omit type.
// This makes the types clearer and easier for the compiler to understand.

// Define the shape of the state properties
interface AppStateProperties extends SavedSessionState {
  sessionTopic: string;
  sessionContext: string;
  sessionFiles: UploadedFile[];
  sessionUrls: string; // The textarea value
}

// Define the shape of the actions (functions)
interface AppStateActions {
  setInitialState: (state: Partial<AppStateProperties>) => void;
  addChatMessage: (message: ChatMessage) => void;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  setCurrentSiftQueryDetails: (details: CurrentSiftQueryDetails | null) => void;
  setOriginalQueryForRestart: (info: OriginalQueryInfo | null) => void;
  setSourceAssessments: (assessments: SourceAssessment[]) => void;
  updateSourceAssessments: (checkedAssessments: SourceAssessment[]) => void;
  setSelectedProviderKey: (provider: AIProvider) => void;
  setSelectedModelId: (modelId: string) => void;
  setModelConfigParams: (params: ConfigurableParams | ((prevState: ConfigurableParams) => ConfigurableParams)) => void;
  setEnableGeminiPreprocessing: (enabled: boolean) => void;
  setUserApiKeys: (keys: { [key in AIProvider]?: string }) => void;
  setApiKeyValidation: (validation: ApiKeyValidationStates | ((prevState: ApiKeyValidationStates) => ApiKeyValidationStates)) => void;
  setCustomSystemPrompt: (prompt: string) => void;
  
  // Actions for config screen state
  setSessionTopic: (topic: string) => void;
  setSessionContext: (context: string) => void;
  setSessionFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  setSessionUrls: (urls: string) => void;

  resetSession: () => void;
}

// Combine state and actions into the final AppState type
type AppState = AppStateProperties & AppStateActions;


const initialModel = INITIAL_MODELS_CONFIG.find(m => m.provider === AIProvider.GOOGLE_GEMINI) || INITIAL_MODELS_CONFIG[0];
const initialParams: ConfigurableParams = {};
initialModel.parameters.forEach(p => initialParams[p.key] = p.defaultValue);


const initialState: AppStateProperties = {
  chatMessages: [],
  currentSiftQueryDetails: null,
  originalQueryForRestart: null,
  sourceAssessments: [],
  selectedProviderKey: AIProvider.GOOGLE_GEMINI,
  selectedModelId: initialModel.id,
  modelConfigParams: initialParams,
  enableGeminiPreprocessing: false,
  userApiKeys: {},
  apiKeyValidation: {},
  customSystemPrompt: '',
  sessionTopic: '',
  sessionContext: '',
  sessionFiles: [],
  sessionUrls: '',
};


export const useAppStore = create<AppState>((set) => ({
  // FIX: Explicitly define initial state properties instead of spreading `initialState`.
  // This resolves a TypeScript error "Spread types may only be created from object types"
  // which can occur with complex intersection types in Zustand's `create` function.
  chatMessages: initialState.chatMessages,
  currentSiftQueryDetails: initialState.currentSiftQueryDetails,
  originalQueryForRestart: initialState.originalQueryForRestart,
  sourceAssessments: initialState.sourceAssessments,
  selectedProviderKey: initialState.selectedProviderKey,
  selectedModelId: initialState.selectedModelId,
  modelConfigParams: initialState.modelConfigParams,
  enableGeminiPreprocessing: initialState.enableGeminiPreprocessing,
  userApiKeys: initialState.userApiKeys,
  apiKeyValidation: initialState.apiKeyValidation,
  customSystemPrompt: initialState.customSystemPrompt,
  sessionTopic: initialState.sessionTopic,
  sessionContext: initialState.sessionContext,
  sessionFiles: initialState.sessionFiles,
  sessionUrls: initialState.sessionUrls,

  setInitialState: (state) => set(state),
  
  addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  
  updateChatMessage: (id, updates) => set((state) => ({
    chatMessages: state.chatMessages.map(msg => msg.id === id ? { ...msg, ...updates } : msg),
  })),

  setChatMessages: (messages) => set({ chatMessages: messages }),
  setCurrentSiftQueryDetails: (details) => set({ currentSiftQueryDetails: details }),
  setOriginalQueryForRestart: (info) => set({ originalQueryForRestart: info }),
  setSourceAssessments: (assessments) => set({ sourceAssessments: assessments }),
    
  updateSourceAssessments: (checkedAssessments) => set((state) => {
        const resultsMap = new Map(checkedAssessments.map(r => [r.url, r]));
        return {
            sourceAssessments: state.sourceAssessments.map(assessment => 
                resultsMap.has(assessment.url)
                    ? { ...assessment, ...resultsMap.get(assessment.url) }
                    : assessment
            )
        };
  }),

  setSelectedProviderKey: (provider) => set({ selectedProviderKey: provider }),
  setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
  setModelConfigParams: (params) => {
    if (typeof params === 'function') {
      set(state => ({ modelConfigParams: params(state.modelConfigParams) }));
    } else {
      set({ modelConfigParams: params });
    }
  },
  setEnableGeminiPreprocessing: (enabled) => set({ enableGeminiPreprocessing: enabled }),
  setUserApiKeys: (keys) => set({ userApiKeys: keys }),
  setApiKeyValidation: (validation) => {
    if (typeof validation === 'function') {
        set(state => ({ apiKeyValidation: validation(state.apiKeyValidation) }));
    } else {
        set({ apiKeyValidation: validation });
    }
  },
  setCustomSystemPrompt: (prompt) => set({ customSystemPrompt: prompt }),
  
  // Config screen actions
  setSessionTopic: (topic: string) => set({ sessionTopic: topic }),
  setSessionContext: (context: string) => set({ sessionContext: context }),
  setSessionFiles: (files) => {
      if (typeof files === 'function') {
          set(state => ({ sessionFiles: files(state.sessionFiles) }));
      } else {
          set({ sessionFiles: files });
      }
  },
  setSessionUrls: (urls: string) => set({ sessionUrls: urls }),
  
  // FIX: This now correctly resets only the session-specific state, preserving user settings.
  resetSession: () => set({
    chatMessages: [],
    originalQueryForRestart: null,
    currentSiftQueryDetails: null,
    sourceAssessments: [],
    // customSystemPrompt is preserved as a user setting.
    sessionTopic: '',
    sessionContext: '',
    sessionFiles: [],
    sessionUrls: '',
  }),
}));
