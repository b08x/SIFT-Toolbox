
import { AIProvider, AIModelConfig, ModelParameter } from './types.ts';

export const standardGeminiParameters: AIModelConfig['parameters'] = [
  { 
    key: 'temperature', 
    label: 'Temperature', 
    type: 'slider', 
    min: 0, 
    max: 1, 
    step: 0.01, 
    defaultValue: 0.7,
    description: 'Controls randomness. Lower for more predictable, higher for more creative.'
  },
  { 
    key: 'topP', 
    label: 'Top-P', 
    type: 'slider', 
    min: 0, 
    max: 1, 
    step: 0.01, 
    defaultValue: 0.95,
    description: 'Nucleus sampling. Considers tokens with probability mass adding up to topP.'
  },
  { 
    key: 'topK', 
    label: 'Top-K', 
    type: 'slider', 
    min: 1, 
    max: 100, 
    step: 1, 
    defaultValue: 40,
    description: 'Considers the top K most probable tokens.'
  },
];

export const standardOpenAIParameters: AIModelConfig['parameters'] = [
      { 
        key: 'temperature', 
        label: 'Temperature', 
        type: 'slider', 
        min: 0, 
        max: 2, 
        step: 0.01, 
        defaultValue: 0.7,
        description: 'Controls randomness. Higher values like 0.8 will make the output more random.'
      },
      { 
        key: 'topP', 
        label: 'Top-P', 
        type: 'slider', 
        min: 0, 
        max: 1, 
        step: 0.01, 
        defaultValue: 1,
        description: 'Nucleus sampling. Model considers results of tokens with top_p probability mass.'
      },
      {
        key: 'max_tokens',
        label: 'Max Tokens',
        type: 'slider', 
        min: 50,
        max: 4096, 
        step: 50,
        defaultValue: 4096, 
        description: 'Maximum number of tokens to generate in the completion.'
      }
];

// Added ModelParameter[] type here to ensure 'type' properties are correctly inferred as literals ('slider')
// rather than broad strings, which was causing assignment errors in INITIAL_MODELS_CONFIG.
const GEMINI_3_PARAMS: ModelParameter[] = [
  ...standardGeminiParameters,
  { 
    key: 'maxOutputTokens', 
    label: 'Max Output Tokens', 
    type: 'slider', 
    min: 256, 
    max: 32768, 
    step: 128, 
    defaultValue: 4096,
    description: 'Max tokens for the response. Requires setting a Thinking Budget.'
  },
  { 
    key: 'thinkingBudget', 
    label: 'Thinking Budget', 
    type: 'slider', 
    min: 0, 
    max: 32768, 
    step: 128, 
    defaultValue: 1024,
    description: 'Tokens reserved for planning. Must be less than Max Output Tokens.'
  },
];

export const INITIAL_MODELS_CONFIG: AIModelConfig[] = [
  // Google Gemini Models
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsUrlContext: true,
    supportsThinking: true,
    parameters: GEMINI_3_PARAMS,
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: true,
    parameters: GEMINI_3_PARAMS,
  },
  {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini Flash Lite',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    parameters: standardGeminiParameters,
  },

  // Mistral Models
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    parameters: [...standardOpenAIParameters],
  },
  
  // OpenAI Models
  {
    id: 'gpt-4o',
    name: 'GPT-4o (via OpenAI)',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'o1-preview',
    name: 'o1 Preview (via OpenAI)',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    parameters: [...standardOpenAIParameters],
  },

  // OpenRouter Models
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    parameters: [...standardOpenAIParameters],
  },
];
