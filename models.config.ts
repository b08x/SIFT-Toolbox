
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
        description: 'Controls randomness.'
      },
      { 
        key: 'topP', 
        label: 'Top-P', 
        type: 'slider', 
        min: 0, 
        max: 1, 
        step: 0.01, 
        defaultValue: 1,
        description: 'Nucleus sampling.'
      },
      {
        key: 'max_tokens',
        label: 'Max Tokens',
        type: 'slider', 
        min: 50,
        max: 4096, 
        step: 50,
        defaultValue: 4096, 
        description: 'Maximum generation length.'
      }
];

export const getParametersForModel = (id: string, provider: AIProvider): ModelParameter[] => {
  if (provider === AIProvider.GOOGLE_GEMINI) {
    const isGemini3 = id.includes('gemini-3') || id.includes('gemini-2.5') || id.includes('gemini-2.0');
    const isThinkingSupported = isGemini3 || id.includes('thinking');
    return isThinkingSupported ? GEMINI_3_PARAMS : standardGeminiParameters;
  }

  // OpenAI / Mistral / OpenRouter
  const isHighCapacity = id.toLowerCase().includes('large') || 
                       id.toLowerCase().includes('pro') || 
                       id.toLowerCase().includes('gpt-4') || 
                       id.toLowerCase().includes('claude-3') ||
                       id.toLowerCase().includes('medium') ||
                       id.toLowerCase().includes('turbo') ||
                       id.toLowerCase().includes('o1') ||
                       id.toLowerCase().includes('o3');

  if (isHighCapacity) {
    return standardOpenAIParameters.map(p => {
      if (p.key === 'max_tokens') {
        return { 
          ...p, 
          max: 16384, 
          defaultValue: 4096,
          description: 'Maximum generation length (High capacity model).'
        };
      }
      return p;
    });
  }

  return [...standardOpenAIParameters];
};

const GEMINI_3_PARAMS: ModelParameter[] = [
  ...standardGeminiParameters,
  { 
    key: 'maxOutputTokens', 
    label: 'Max Output Tokens', 
    type: 'slider', 
    min: 256, 
    max: 65536, 
    step: 128, 
    defaultValue: 16384,
    description: 'Max tokens for response (Final Output).'
  },
  { 
    key: 'thinkingBudget', 
    label: 'Thinking Budget', 
    type: 'slider', 
    min: 0, 
    max: 32768, 
    step: 128, 
    defaultValue: 8192,
    description: 'Tokens for reasoning. Must be less than Max Output.'
  },
];

export const INITIAL_MODELS_CONFIG: AIModelConfig[] = [
  // Google Gemini Models - Optimized for Gemini 3
  {
    id: 'gemini-3-pro-preview',
    name: 'Google Deep Research',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsUrlContext: true,
    supportsThinking: true,
    parameters: getParametersForModel('gemini-3-pro-preview', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: true,
    parameters: getParametersForModel('gemini-3-flash-preview', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini Flash Lite',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    parameters: getParametersForModel('gemini-flash-lite-latest', AIProvider.GOOGLE_GEMINI),
  },

  // Mistral Models
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    parameters: getParametersForModel('mistral-large-latest', AIProvider.MISTRAL),
  },
  
  // OpenAI Models
  {
    id: 'gpt-4o',
    name: 'GPT-4o (via OpenAI)',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    parameters: getParametersForModel('gpt-4o', AIProvider.OPENAI),
  },
  {
    id: 'o1-preview',
    name: 'o1 Preview (via OpenAI)',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    parameters: getParametersForModel('o1-preview', AIProvider.OPENAI),
  },

  // OpenRouter Models
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    parameters: getParametersForModel('anthropic/claude-3.5-sonnet', AIProvider.OPENROUTER),
  },
];
