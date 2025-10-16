import { Part } from "@google/genai";

export enum ReportType {
  FULL_CHECK = 'Full Check',
  CONTEXT_REPORT = 'Context Report',
  COMMUNITY_NOTE = 'Community Note',
}

export interface GroundingChunkWeb {
  uri: string;
  title: string;
}

export interface GroundingChunk {
  web?: GroundingChunkWeb;
  // Other types of grounding chunks can be added here if needed
}

export type UserOrAi = 'user' | 'ai';

export interface UploadedFile {
    name: string;
    type: string; // MIME type
    size: number; // in bytes
    base64Data: string; // data:mime/type;base64,...
}


export interface ChatMessage {
  id: string;
  sender: UserOrAi;
  text: string;
  timestamp: Date;
  isLoading?: boolean;
  isError?: boolean;
  groundingSources?: GroundingChunk[];
  uploadedFiles?: UploadedFile[];
  originalQuery?: { 
    text?: string;
    reportType?: ReportType;
    files?: UploadedFile[];
    urls?: string[];
  };
  modelId?: string; 
  isInitialSIFTReport?: boolean;
  originalQueryReportType?: ReportType;
  isFromCache?: boolean;
  structuredData?: any;
}

// For the new left query panel
export interface CurrentSiftQueryDetails {
    sessionTopic: string;
    sessionContext: string;
    sessionFiles: UploadedFile[];
    sessionUrls: string[];
}

export interface OriginalQueryInfo {
  text?: string;
  files?: UploadedFile[];
  urls?: string[];
  reportType: ReportType;
}

export type LinkValidationStatus = 'unchecked' | 'valid' | 'invalid' | 'error_checking' | 'checking';

export interface SourceAssessment {
  index: number;
  name: string;
  url: string;
  assessment: string;
  notes: string;
  rating: string;
  linkValidationStatus?: LinkValidationStatus;
}

// New types for model selection and parameters
export enum AIProvider {
  GOOGLE_GEMINI = 'GOOGLE_GEMINI',
  OPENAI = 'OPENAI',
  OPENROUTER = 'OPENROUTER',
  MISTRAL = 'MISTRAL',
}

export type ModelParameterType = 'slider' | 'number' | 'text' | 'select';

export interface ModelParameterOption {
  value: string | number;
  label: string;
}
export interface ModelParameter {
  key: string; 
  label: string;
  type: ModelParameterType;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | string;
  options?: ModelParameterOption[]; 
  description?: string;
  unit?: string;
}

export interface AIModelConfig {
  id: string; 
  name: string; 
  provider: AIProvider;
  parameters: ModelParameter[];
  supportsGoogleSearch?: boolean; // Specific to Gemini for now
  supportsVision?: boolean; // General flag for image input capability
  supportsUrlContext?: boolean; // Flag for URL context tool
  supportsThinking?: boolean; // Flag for models that use <think> tags
  defaultSystemPrompt?: string; 
}

export type ConfigurableParams = {
  [key: string]: number | string | boolean;
};

// For sectioned display
export interface ParsedReportSection {
  title: string;
  rawTitle: string; // The original header line, e.g., "## 1. Verified Facts"
  content: string;
  level: number; // 0 for preamble, 2 for H2, 3 for H3
}

// For API Key Management
export type ApiKeyValidationStatus = 'valid' | 'invalid' | 'pending' | 'unchecked';
export type ApiKeyValidationStates = {
  [key in AIProvider]?: ApiKeyValidationStatus;
};

// For Caching
export interface CacheableQueryDetails {
  text?: string;
  imageBase64?: string | null; // Image data for hashing
  imageMimeType?: string | null;
  reportType: ReportType;
  provider: AIProvider;
  modelId: string;
  modelConfigParams: ConfigurableParams;
  siftPromptVersion: string; // To invalidate cache if prompts change
}

export interface CachedSiftReport {
  text: string;
  groundingSources?: GroundingChunk[];
  modelId: string;
  originalQueryReportType: ReportType;
  cachedAt: number; // Timestamp of when it was cached
}

// For Session Saving
export interface SavedSessionState {
  chatMessages: ChatMessage[];
  currentSiftQueryDetails: CurrentSiftQueryDetails | null;
  originalQueryForRestart: OriginalQueryInfo | null;
  sourceAssessments: SourceAssessment[];
  selectedProviderKey: AIProvider;
  selectedModelId: string;
  modelConfigParams: ConfigurableParams;
  enableGeminiPreprocessing: boolean;
  userApiKeys: { [key in AIProvider]?: string };
  apiKeyValidation: ApiKeyValidationStates;
  customSystemPrompt: string;
}


// Types for AgenticApiService streaming
export type AgentStatusUpdate = {
  type: 'status';
  message: string;
};

export type TextChunk = {
  type: 'chunk';
  text: string;
};

export type GroundingSourcesUpdate = {
  type: 'sources';
  sources: GroundingChunk[];
};

export type ErrorUpdate = {
  type: 'error';
  error: string;
};

export type FinalReport = {
    type: 'final';
    fullText: string;
    modelId: string;
    groundingSources?: GroundingChunk[];
    isInitialSIFTReport: boolean;
    originalQueryReportType?: ReportType;
    cacheKey?: string; // Include cacheKey in the final event for caching
};

export type StreamEvent = AgentStatusUpdate | TextChunk | GroundingSourcesUpdate | ErrorUpdate | FinalReport;