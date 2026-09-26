import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createMistral } from '@ai-sdk/mistral';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AIProvider } from '../types.ts';

/**
 * Ensures the model conforms to AI SDK specification version 'v2'
 * expected by AI SDK 5, preventing UnsupportedModelVersionError.
 */
const ensureLanguageModelV2 = <T extends object>(model: T): T => {
  if (!model) return model;
  const anyModel = model as any;
  if (anyModel.specificationVersion && anyModel.specificationVersion !== 'v2') {
    return new Proxy(model, {
      get(target, prop, receiver) {
        if (prop === 'specificationVersion') {
          return 'v2';
        }
        return Reflect.get(target, prop, receiver);
      }
    });
  }
  return model;
};

export const getVercelModel = (provider: AIProvider, apiKey: string, modelId: string) => {
  if (!apiKey) {
    throw new Error(`Missing API key for provider: ${provider}`);
  }

  let model: any;

  switch (provider) {
    case AIProvider.GOOGLE_GEMINI: {
      const google = createGoogleGenerativeAI({ apiKey });
      model = google(modelId);
      break;
    }

    case AIProvider.OPENAI: {
      const openai = createOpenAI({ 
        apiKey
      });
      // Use .chat() to ensure standard chat completions API is used
      model = typeof openai.chat === 'function' ? openai.chat(modelId) : openai(modelId);
      break;
    }

    case AIProvider.OPENROUTER: {
      const openrouter = createOpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.href : 'https://sift-toolbox.local',
            'X-Title': 'SIFT Toolbox'
        }
      });
      // OpenRouter models implement the OpenAI chat completions endpoint (/chat/completions)
      model = typeof openrouter.chat === 'function' ? openrouter.chat(modelId) : openrouter(modelId);
      break;
    }

    case AIProvider.MISTRAL: {
        const mistral = createMistral({ apiKey });
        model = mistral(modelId);
        break;
    }

    case AIProvider.ANTHROPIC: {
        const anthropic = createAnthropic({ 
            apiKey,
            headers: {
                'anthropic-dangerous-direct-browser-access': 'true'
            }
        });
        model = anthropic(modelId);
        break;
    }

    case AIProvider.GROQ: {
        const groq = createOpenAI({
            apiKey,
            baseURL: 'https://api.groq.com/openai/v1',
        });
        // Groq implements OpenAI-compatible /chat/completions
        model = typeof groq.chat === 'function' ? groq.chat(modelId) : groq(modelId);
        break;
    }

    case AIProvider.OLLAMA: {
        // Ollama uses local URL; if apiKey looks like a URL use that, otherwise default to http://localhost:11434/v1
        const rawUrl = (apiKey && apiKey.startsWith('http')) ? apiKey : 'http://localhost:11434/v1';
        const baseURL = rawUrl.endsWith('/v1') ? rawUrl : `${rawUrl}/v1`;
        const ollama = createOpenAI({
            apiKey: 'ollama',
            baseURL,
        });
        // Ollama implements OpenAI-compatible /chat/completions
        model = typeof ollama.chat === 'function' ? ollama.chat(modelId) : ollama(modelId);
        break;
    }

    default:
      throw new Error(`Provider ${provider} not supported in factory.`);
  }

  return ensureLanguageModelV2(model);
};
