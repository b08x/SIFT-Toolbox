
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
    UploadedFile,
    AIModelConfig,
    CustomCommand
} from './types.ts';
import { INITIAL_MODELS_CONFIG } from './models.config.ts';

interface AppStateProperties extends SavedSessionState {
  sessionTopic: string;
  sessionContext: string;
  sessionFiles: UploadedFile[];
  sessionUrls: string;
  availableModels: AIModelConfig[];
}

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
  setAvailableModels: (models: AIModelConfig[] | ((prev: AIModelConfig[]) => AIModelConfig[])) => void;
  
  setCustomCommands: (commands: CustomCommand[] | ((prev: CustomCommand[]) => CustomCommand[])) => void;
  addCustomCommand: (command: CustomCommand) => void;
  updateCustomCommand: (id: string, updates: Partial<CustomCommand>) => void;
  deleteCustomCommand: (id: string) => void;

  setSessionTopic: (topic: string) => void;
  setSessionContext: (context: string) => void;
  setSessionFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  setSessionUrls: (urls: string) => void;

  resetSession: () => void;
}

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
  customCommands: [],
  sessionTopic: '',
  sessionContext: '',
  sessionFiles: [],
  sessionUrls: '',
  availableModels: INITIAL_MODELS_CONFIG,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setInitialState: (state) => set(state),
  
  addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  
  updateChatMessage: (id, updates) => set((state) => ({
    chatMessages: state.chatMessages.map(msg => msg.id === id ? Object.assign({}, msg, updates) : msg),
  })),

  setChatMessages: (messages) => set({ chatMessages: messages }),
  setCurrentSiftQueryDetails: (details) => set({ currentSiftQueryDetails: details }),
  setOriginalQueryForRestart: (info) => set({ originalQueryForRestart: info }),
  setSourceAssessments: (assessments) => set({ sourceAssessments: assessments }),
    
  updateSourceAssessments: (checkedAssessments) => set((state) => {
        const resultsMap = new Map(checkedAssessments.map(r => [r.url, r]));
        return {
            sourceAssessments: state.sourceAssessments.map(assessment => {
                const updated = resultsMap.get(assessment.url);
                return updated ? Object.assign({}, assessment, updated) : assessment;
            })
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
  
  setAvailableModels: (models) => {
    if (typeof models === 'function') {
      set(state => ({ availableModels: models(state.availableModels) }));
    } else {
      set({ availableModels: models });
    }
  },

  setCustomCommands: (commands) => {
    if (typeof commands === 'function') {
      set(state => ({ customCommands: commands(state.customCommands) }));
    } else {
      set({ customCommands: commands });
    }
  },
  addCustomCommand: (command) => set(state => ({ customCommands: [...state.customCommands, command] })),
  updateCustomCommand: (id, updates) => set(state => ({
    customCommands: state.customCommands.map(cmd => cmd.id === id ? Object.assign({}, cmd, updates) : cmd)
  })),
  deleteCustomCommand: (id) => set(state => ({
    customCommands: state.customCommands.filter(cmd => cmd.id !== id)
  })),

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
  
  resetSession: () => set({
    chatMessages: [],
    originalQueryForRestart: null,
    currentSiftQueryDetails: null,
    sourceAssessments: [],
    sessionTopic: '',
    sessionContext: '',
    sessionFiles: [],
    sessionUrls: '',
  }),
}));
