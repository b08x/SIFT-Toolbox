
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
    CustomCommand,
    McpSearchConfig,
    TaskModelAssignments,
    LLMTaskKey,
    TaskModelSetting
} from './types.ts';
import { INITIAL_MODELS_CONFIG, DEFAULT_TASK_ASSIGNMENTS, isModelSIFTCompliant } from './models.config.ts';
import { DEFAULT_MCP_CONFIG } from './services/mcpSearchService.ts';

interface AppStateProperties extends SavedSessionState {
  availableModels: AIModelConfig[];
  mcpSearchConfig: McpSearchConfig;
  taskModelAssignments: TaskModelAssignments;
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
  setUserApiKeys: (keys: { [key in AIProvider]?: string } | ((prev: { [key in AIProvider]?: string }) => { [key in AIProvider]?: string })) => void;
  setApiKeyValidation: (validation: ApiKeyValidationStates | ((prevState: ApiKeyValidationStates) => ApiKeyValidationStates)) => void;
  setCustomSystemPrompt: (prompt: string) => void;
  setAvailableModels: (models: AIModelConfig[] | ((prev: AIModelConfig[]) => AIModelConfig[])) => void;
  setMcpSearchConfig: (config: McpSearchConfig | ((prev: McpSearchConfig) => McpSearchConfig)) => void;
  
  setTaskModelAssignments: (assignments: TaskModelAssignments | ((prev: TaskModelAssignments) => TaskModelAssignments)) => void;
  updateTaskAssignment: (taskKey: LLMTaskKey, updates: Partial<TaskModelSetting>) => void;
  updateTaskParameters: (taskKey: LLMTaskKey, params: ConfigurableParams) => void;
  applyModelToAllTasks: (provider: AIProvider, modelId: string) => void;

  setCustomCommands: (commands: CustomCommand[] | ((prev: CustomCommand[]) => CustomCommand[])) => void;
  addCustomCommand: (command: CustomCommand) => void;
  updateCustomCommand: (id: string, updates: Partial<CustomCommand>) => void;
  deleteCustomCommand: (id: string) => void;

  setSessionTopic: (topic: string) => void;
  setSessionContext: (context: string) => void;
  setSessionFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  setSessionUrls: (urls: string) => void;
  setSessionId: (id: string | undefined) => void;

  resetSession: () => void;
}

type AppState = AppStateProperties & AppStateActions;

const compliantInitialModels = INITIAL_MODELS_CONFIG;
const initialModel = compliantInitialModels.find(m => m.provider === AIProvider.GOOGLE_GEMINI && m.id === 'gemini-2.5-flash') 
  || compliantInitialModels.find(m => m.provider === AIProvider.GOOGLE_GEMINI) 
  || compliantInitialModels[0];
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
  sessionId: undefined,
  availableModels: compliantInitialModels,
  mcpSearchConfig: DEFAULT_MCP_CONFIG,
  taskModelAssignments: DEFAULT_TASK_ASSIGNMENTS,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setMcpSearchConfig: (config) => {
    if (typeof config === 'function') {
      set(state => ({ mcpSearchConfig: config(state.mcpSearchConfig || DEFAULT_MCP_CONFIG) }));
    } else {
      set({ mcpSearchConfig: config });
    }
  },

  setInitialState: (state) => {
    const sanitized = { ...state };
    if (sanitized.userApiKeys) {
      sanitized.userApiKeys = { ...sanitized.userApiKeys };
      if (sanitized.userApiKeys[AIProvider.OPENAI]?.startsWith('sk-or-v1')) {
        if (!sanitized.userApiKeys[AIProvider.OPENROUTER]) {
          sanitized.userApiKeys[AIProvider.OPENROUTER] = sanitized.userApiKeys[AIProvider.OPENAI];
        }
        delete sanitized.userApiKeys[AIProvider.OPENAI];
      }
    }
    set(sanitized);
  },
  
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
  setUserApiKeys: (keys) => {
    if (typeof keys === 'function') {
      set(state => ({ userApiKeys: keys(state.userApiKeys) }));
    } else {
      set({ userApiKeys: keys });
    }
  },
  setApiKeyValidation: (validation) => {
    if (typeof validation === 'function') {
        set(state => ({ apiKeyValidation: validation(state.apiKeyValidation) }));
    } else {
        set({ apiKeyValidation: validation });
    }
  },
  setCustomSystemPrompt: (prompt) => set({ customSystemPrompt: prompt }),

  setTaskModelAssignments: (assignments) => {
    if (typeof assignments === 'function') {
      set(state => ({ taskModelAssignments: assignments(state.taskModelAssignments || DEFAULT_TASK_ASSIGNMENTS) }));
    } else {
      set({ taskModelAssignments: assignments });
    }
  },

  updateTaskAssignment: (taskKey, updates) => set(state => {
    const current = state.taskModelAssignments || DEFAULT_TASK_ASSIGNMENTS;
    const taskCurrent = current[taskKey] || DEFAULT_TASK_ASSIGNMENTS[taskKey];
    return {
      taskModelAssignments: {
        ...current,
        [taskKey]: {
          ...taskCurrent,
          ...updates,
        }
      }
    };
  }),

  updateTaskParameters: (taskKey, params) => set(state => {
    const current = state.taskModelAssignments || DEFAULT_TASK_ASSIGNMENTS;
    const taskCurrent = current[taskKey] || DEFAULT_TASK_ASSIGNMENTS[taskKey];
    return {
      taskModelAssignments: {
        ...current,
        [taskKey]: {
          ...taskCurrent,
          parameters: {
            ...taskCurrent.parameters,
            ...params,
          }
        }
      }
    };
  }),

  applyModelToAllTasks: (provider, modelId) => set(state => {
    const current = state.taskModelAssignments || DEFAULT_TASK_ASSIGNMENTS;
    const updated = { ...current };
    (Object.keys(updated) as LLMTaskKey[]).forEach(k => {
      updated[k] = {
        ...updated[k],
        provider,
        modelId,
      };
    });
    return { taskModelAssignments: updated };
  }),
  
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
  setSessionId: (id: string | undefined) => set({ sessionId: id }),
  
  resetSession: () => set({
    sessionId: undefined,
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
