
import { AIProvider, AIModelConfig, ModelParameter, TaskModelAssignments } from './types.ts';

export interface ProviderMeta {
  name: string;
  desc: string;
  keyName: string;
  defaultUrl?: string;
  isLocal?: boolean;
}

export const PROVIDER_METADATA: Record<AIProvider, ProviderMeta> = {
  [AIProvider.GOOGLE_GEMINI]: { 
    name: 'Google Gemini', 
    desc: 'Native provider with Google Search grounding, 1M-2M context, and Multimodal Live support.',
    keyName: 'GEMINI_API_KEY'
  },
  [AIProvider.OPENAI]: { 
    name: 'OpenAI', 
    desc: 'GPT-4o, GPT-4o Mini, and o1/o3-mini reasoning models for deep analytical verification.',
    keyName: 'OPENAI_API_KEY'
  },
  [AIProvider.ANTHROPIC]: { 
    name: 'Anthropic Claude', 
    desc: 'Direct Anthropic API integration for Claude 3.7 Sonnet, 3.5 Sonnet, and Haiku.',
    keyName: 'ANTHROPIC_API_KEY'
  },
  [AIProvider.OPENROUTER]: { 
    name: 'OpenRouter', 
    desc: 'Unified gateway to Claude 3.7 Sonnet, DeepSeek R1, Llama 3.3, and 200+ models.',
    keyName: 'OPENROUTER_API_KEY'
  },
  [AIProvider.MISTRAL]: { 
    name: 'Mistral AI', 
    desc: 'Mistral Large, Codestral, and specialized European multilingual reasoning models.',
    keyName: 'MISTRAL_API_KEY'
  },
  [AIProvider.GROQ]: { 
    name: 'Groq Cloud', 
    desc: 'Ultra low-latency LPU inference for real-time fact extraction and query parsing.',
    keyName: 'GROQ_API_KEY'
  },
  [AIProvider.OLLAMA]: { 
    name: 'Ollama (Local)', 
    desc: 'Self-hosted private LLM instance for fully air-gapped local fact verification.',
    keyName: 'Ollama Base URL',
    defaultUrl: 'http://localhost:11434',
    isLocal: true
  },
};

/**
 * Model check predicate - all functional generative models are supported without restrictive gating.
 */
export const isModelSIFTCompliant = (_model?: AIModelConfig): boolean => {
  return true;
};

export const standardGeminiParameters: AIModelConfig['parameters'] = [
  { 
    key: 'temperature', 
    label: 'Temperature', 
    type: 'slider', 
    min: 0, 
    max: 2, 
    step: 0.01, 
    defaultValue: 0.7,
    description: 'Controls randomness. Lower for deterministic/analytical, higher for creative.'
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
    description: 'Considers the top K most probable tokens at each generation step.'
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
    key: 'topK', 
    label: 'Top-K', 
    type: 'slider', 
    min: 1, 
    max: 100, 
    step: 1, 
    defaultValue: 40,
    description: 'Limits token pool to K most likely candidate tokens.'
  },
  {
    key: 'max_tokens',
    label: 'Max Tokens',
    type: 'slider', 
    min: 50,
    max: 16384, 
    step: 50,
    defaultValue: 4096, 
    description: 'Maximum generation length.'
  },
  {
    key: 'frequencyPenalty',
    label: 'Frequency Penalty',
    type: 'slider',
    min: -2,
    max: 2,
    step: 0.1,
    defaultValue: 0,
    description: 'Penalizes tokens based on their frequency in text so far.'
  },
  {
    key: 'presencePenalty',
    label: 'Presence Penalty',
    type: 'slider',
    min: -2,
    max: 2,
    step: 0.1,
    defaultValue: 0,
    description: 'Penalizes tokens based on whether they have appeared in text.'
  }
];

export const getParametersForModel = (id: string, provider: AIProvider): ModelParameter[] => {
  if (provider === AIProvider.GOOGLE_GEMINI) {
    return GEMINI_3_PARAMS;
  }

  // OpenAI / Mistral / Anthropic / Groq / OpenRouter
  const isHighCapacity = id.toLowerCase().includes('large') || 
                       id.toLowerCase().includes('pro') || 
                       id.toLowerCase().includes('gpt-4') || 
                       id.toLowerCase().includes('claude-3') ||
                       id.toLowerCase().includes('medium') ||
                       id.toLowerCase().includes('turbo') ||
                       id.toLowerCase().includes('o1') ||
                       id.toLowerCase().includes('o3') ||
                       id.toLowerCase().includes('deepseek-r1');

  if (isHighCapacity) {
    return standardOpenAIParameters.map(p => {
      if (p.key === 'max_tokens') {
        return { 
          ...p, 
          max: 32768, 
          defaultValue: 8192,
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
    min: 1024, 
    max: 32768, 
    step: 128, 
    defaultValue: 8192,
    description: 'Tokens for reasoning. Must be less than Max Output.'
  },
];

/**
 * INITIAL_MODELS_CONFIG:
 * Complete, diverse registry of standard and state-of-the-art models across all supported providers.
 */
export const INITIAL_MODELS_CONFIG: AIModelConfig[] = [
  // Google Gemini Models
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (Recommended)',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '1M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: true },
    parameters: getParametersForModel('gemini-2.5-flash', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '1M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: false },
    parameters: getParametersForModel('gemini-2.0-flash', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '1M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: false },
    parameters: getParametersForModel('gemini-2.0-flash-lite', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-2.0-flash-thinking-exp-01-21',
    name: 'Gemini 2.0 Flash Thinking',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '1M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: true },
    parameters: getParametersForModel('gemini-2.0-flash-thinking-exp-01-21', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '1M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: false },
    parameters: getParametersForModel('gemini-1.5-flash', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '2M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: false },
    parameters: getParametersForModel('gemini-1.5-pro', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '1M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: true },
    parameters: getParametersForModel('gemini-3.8-flash', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '1M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: true },
    parameters: getParametersForModel('gemini-3-flash-preview', AIProvider.GOOGLE_GEMINI),
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Google Deep Research (Pro / Paid)',
    provider: AIProvider.GOOGLE_GEMINI,
    supportsGoogleSearch: true,
    supportsVision: true,
    supportsUrlContext: true,
    supportsThinking: true,
    contextWindow: '2M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: true, thinking: true },
    parameters: getParametersForModel('gemini-3.1-pro-preview', AIProvider.GOOGLE_GEMINI),
  },

  // Anthropic Models
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude 3.7 Sonnet (Hybrid Reasoning)',
    provider: AIProvider.ANTHROPIC,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: true },
    parameters: getParametersForModel('claude-3-7-sonnet-20250219', AIProvider.ANTHROPIC),
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: AIProvider.ANTHROPIC,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: true },
    parameters: getParametersForModel('claude-3-5-sonnet-20241022', AIProvider.ANTHROPIC),
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: AIProvider.ANTHROPIC,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('claude-3-5-haiku-20241022', AIProvider.ANTHROPIC),
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: AIProvider.ANTHROPIC,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: false },
    parameters: getParametersForModel('claude-3-opus-20240229', AIProvider.ANTHROPIC),
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: AIProvider.ANTHROPIC,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: false },
    parameters: getParametersForModel('claude-3-haiku-20240307', AIProvider.ANTHROPIC),
  },

  // OpenAI Models
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: true },
    parameters: getParametersForModel('gpt-4o', AIProvider.OPENAI),
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: false },
    parameters: getParametersForModel('gpt-4o-mini', AIProvider.OPENAI),
  },
  {
    id: 'o3-mini',
    name: 'o3-mini (Reasoning + Tools)',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('o3-mini', AIProvider.OPENAI),
  },
  {
    id: 'o1',
    name: 'o1',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: true },
    parameters: getParametersForModel('o1', AIProvider.OPENAI),
  },
  {
    id: 'o1-mini',
    name: 'o1-mini',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('o1-mini', AIProvider.OPENAI),
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: false },
    parameters: getParametersForModel('gpt-4-turbo', AIProvider.OPENAI),
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: AIProvider.OPENAI,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '16k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('gpt-3.5-turbo', AIProvider.OPENAI),
  },

  // Mistral Models
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('mistral-large-latest', AIProvider.MISTRAL),
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('mistral-small-latest', AIProvider.MISTRAL),
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '256k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('codestral-latest', AIProvider.MISTRAL),
  },
  {
    id: 'pixtral-large-latest',
    name: 'Pixtral Large',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: false },
    parameters: getParametersForModel('pixtral-large-latest', AIProvider.MISTRAL),
  },
  {
    id: 'open-mistral-7b',
    name: 'Mistral 7B',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '32k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('open-mistral-7b', AIProvider.MISTRAL),
  },
  {
    id: 'open-mixtral-8x7b',
    name: 'Mixtral 8x7B',
    provider: AIProvider.MISTRAL,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '32k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('open-mixtral-8x7b', AIProvider.MISTRAL),
  },

  // OpenRouter Models
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: true },
    parameters: getParametersForModel('anthropic/claude-3.7-sonnet', AIProvider.OPENROUTER),
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: true },
    parameters: getParametersForModel('anthropic/claude-3.5-sonnet', AIProvider.OPENROUTER),
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('anthropic/claude-3.5-haiku', AIProvider.OPENROUTER),
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: true,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: true },
    parameters: getParametersForModel('openai/gpt-4o', AIProvider.OPENROUTER),
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: false },
    parameters: getParametersForModel('openai/gpt-4o-mini', AIProvider.OPENROUTER),
  },
  {
    id: 'openai/o3-mini',
    name: 'o3-mini (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '200k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('openai/o3-mini', AIProvider.OPENROUTER),
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1 (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('deepseek/deepseek-r1', AIProvider.OPENROUTER),
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('meta-llama/llama-3.3-70b-instruct', AIProvider.OPENROUTER),
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash (via OpenRouter)',
    provider: AIProvider.OPENROUTER,
    supportsGoogleSearch: false,
    supportsVision: true,
    supportsThinking: false,
    contextWindow: '1M tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: true, webSearch: false, thinking: false },
    parameters: getParametersForModel('google/gemini-2.0-flash-001', AIProvider.OPENROUTER),
  },

  // Groq Models
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile (via Groq)',
    provider: AIProvider.GROQ,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('llama-3.3-70b-versatile', AIProvider.GROQ),
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant (via Groq)',
    provider: AIProvider.GROQ,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('llama-3.1-8b-instant', AIProvider.GROQ),
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B (via Groq)',
    provider: AIProvider.GROQ,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('deepseek-r1-distill-llama-70b', AIProvider.GROQ),
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B (via Groq)',
    provider: AIProvider.GROQ,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '32k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('mixtral-8x7b-32768', AIProvider.GROQ),
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B IT (via Groq)',
    provider: AIProvider.GROQ,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '8k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('gemma2-9b-it', AIProvider.GROQ),
  },

  // Ollama Models
  {
    id: 'llama3.3:latest',
    name: 'Llama 3.3 (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('llama3.3:latest', AIProvider.OLLAMA),
  },
  {
    id: 'llama3.2:latest',
    name: 'Llama 3.2 (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('llama3.2:latest', AIProvider.OLLAMA),
  },
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('llama3.1:8b', AIProvider.OLLAMA),
  },
  {
    id: 'deepseek-r1:70b',
    name: 'DeepSeek R1 70B (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '64k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('deepseek-r1:70b', AIProvider.OLLAMA),
  },
  {
    id: 'deepseek-r1:8b',
    name: 'DeepSeek R1 8B (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '64k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('deepseek-r1:8b', AIProvider.OLLAMA),
  },
  {
    id: 'qwen2.5:72b',
    name: 'Qwen 2.5 72B Instruct (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: true,
    contextWindow: '32k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: true },
    parameters: getParametersForModel('qwen2.5:72b', AIProvider.OLLAMA),
  },
  {
    id: 'qwen2.5:7b',
    name: 'Qwen 2.5 7B (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '32k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('qwen2.5:7b', AIProvider.OLLAMA),
  },
  {
    id: 'mistral:latest',
    name: 'Mistral 7B (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '32k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('mistral:latest', AIProvider.OLLAMA),
  },
  {
    id: 'phi3:latest',
    name: 'Phi-3 (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '128k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('phi3:latest', AIProvider.OLLAMA),
  },
  {
    id: 'gemma2:latest',
    name: 'Gemma 2 (Local Ollama)',
    provider: AIProvider.OLLAMA,
    supportsGoogleSearch: false,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: '8k tokens',
    capabilities: { tools: true, structuredOutputs: true, vision: false, webSearch: false, thinking: false },
    parameters: getParametersForModel('gemma2:latest', AIProvider.OLLAMA),
  }
];

export const DEFAULT_TASK_ASSIGNMENTS: TaskModelAssignments = {
  fact_check: {
    taskKey: 'fact_check',
    label: 'SIFT Fact-Check & Report Generation',
    category: 'Core Analysis',
    description: 'Generates the primary 4-pillar SIFT analysis report with structured evidence and verdict assessments.',
    icon: 'fact_check',
    provider: AIProvider.GOOGLE_GEMINI,
    modelId: 'gemini-2.5-flash',
    parameters: {
      temperature: 0.2,
      topP: 0.95,
      topK: 40,
      thinkingBudget: 8192,
      maxOutputTokens: 16384,
    }
  },
  claim_verification: {
    taskKey: 'claim_verification',
    label: 'Deep Verification & Bias Assessment',
    category: 'Core Analysis',
    description: 'Detailed lateral reading, source provenance analysis, misinformation detection, and bias assessment.',
    icon: 'verified_user',
    provider: AIProvider.GOOGLE_GEMINI,
    modelId: 'gemini-2.5-flash',
    parameters: {
      temperature: 0.3,
      topP: 0.9,
      topK: 40,
      thinkingBudget: 4096,
      maxOutputTokens: 12288,
    }
  },
  interactive_chat: {
    taskKey: 'interactive_chat',
    label: 'Follow-up Chat & Lateral Q&A',
    category: 'Interactive',
    description: 'Multi-turn interactive conversation for probing sources, lateral investigation, and claim inquiries.',
    icon: 'forum',
    provider: AIProvider.GOOGLE_GEMINI,
    modelId: 'gemini-2.5-flash',
    parameters: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      thinkingBudget: 4096,
      maxOutputTokens: 8192,
    }
  },
  preprocessing: {
    taskKey: 'preprocessing',
    label: 'Query Expansion & Search Formulator',
    category: 'Infrastructure',
    description: 'Fast entity extraction and search query formulation for MCP/Exa and web retrieval.',
    icon: 'search_spark',
    provider: AIProvider.GOOGLE_GEMINI,
    modelId: 'gemini-2.5-flash',
    parameters: {
      temperature: 0.1,
      topP: 0.9,
      topK: 40,
      thinkingBudget: 2048,
      maxOutputTokens: 4096,
    }
  },
  live_voice: {
    taskKey: 'live_voice',
    label: 'Real-Time Voice Assistant',
    category: 'Interactive',
    description: 'Multimodal bidirectional voice conversation and interactive audio fact-checking.',
    icon: 'mic',
    provider: AIProvider.GOOGLE_GEMINI,
    modelId: 'gemini-2.5-flash',
    parameters: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      voiceName: 'Aoede',
    }
  },
  custom_command: {
    taskKey: 'custom_command',
    label: 'Custom SIFT Commands',
    category: 'Infrastructure',
    description: 'Custom user-defined SIFT macros and targeted prompt instructions.',
    icon: 'terminal',
    provider: AIProvider.GOOGLE_GEMINI,
    modelId: 'gemini-2.5-flash',
    parameters: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      thinkingBudget: 4096,
      maxOutputTokens: 8192,
    }
  }
};
