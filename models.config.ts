import { AIProvider, AIModelConfig } from './types';

const standardGeminiParameters: AIModelConfig['parameters'] = [
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

const standardOpenAIParameters: AIModelConfig['parameters'] = [
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


export const AVAILABLE_PROVIDERS_MODELS: AIModelConfig[] = [
  // Google Gemini Models
   {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsUrlContext: true,
    supportsThinking: true,
    parameters: [
      ...standardGeminiParameters,
      { 
        key: 'maxOutputTokens', 
        label: 'Max Output Tokens', 
        type: 'slider', 
        min: 256, 
        max: 8192, 
        step: 128, 
        defaultValue: 2048,
        description: 'Max tokens for the response. Requires setting a Thinking Budget.'
      },
      { 
        key: 'thinkingBudget', 
        label: 'Thinking Budget', 
        type: 'slider', 
        min: 0, 
        max: 4096, 
        step: 128, 
        defaultValue: 1024,
        description: 'Tokens reserved for planning. Must be less than Max Output Tokens.'
      },
    ],
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: true,
    parameters: [...standardGeminiParameters],
  },
  {
    id: 'aqa',
    name: 'AQA (Attributed Q&A)',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true, // AQA is grounded by nature
    supportsVision: false, 
    parameters: [
        { 
            key: 'temperature', 
            label: 'Temperature', 
            type: 'slider', 
            min: 0, 
            max: 1, 
            step: 0.01, 
            defaultValue: 0.7,
            description: 'Controls randomness. AQA is designed for factual answers.'
        }
    ],
    defaultSystemPrompt: "You are a question-answering agent. Your answer must be based on the provided context."
  },

  // Mistral Models
  {
    id: 'mistral-large-2411',
    name: 'Mistral Large 2411',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'magistral-medium-2506',
    name: 'Mistral Medium 2506',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    parameters: [...standardOpenAIParameters],
  },
   {
    id: 'mistral-small-2506',
    name: 'Mistral Small 2506',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'open-mistral-nemo',
    name: 'Mistral Nemo 12B',
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
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo (via OpenAI)',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo (via OpenAI)',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: false, 
    parameters: [...standardOpenAIParameters],
  },

  // OpenRouter Models - Example list
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false, // Relies on Gemini pre-processing for search
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
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek: DeepSeek V3 0324 (free) (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'google/gemini-2.5-flash-preview-05-20:thinking',
    name: 'Gemini 2.5 Flash Preview Thinking (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'google/gemini-2.5-flash-preview-05-20',
    name: 'Gemini 2.5 Flash Preview (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    parameters: [...standardOpenAIParameters],
  },
  {
    id: 'google/gemini-2.5-flash-lite-preview-06-17',
    name: 'Gemini 2.5 Flash Lite Preview (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    parameters: [...standardOpenAIParameters],
  },
];