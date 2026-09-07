import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createMistral } from '@ai-sdk/mistral';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AIProvider } from '../types.ts';

export const getVercelModel = (provider: AIProvider, apiKey: string, modelId: string) => {
  if (!apiKey) {
    throw new Error(`Missing API key for provider: ${provider}`);
  }

  switch (provider) {
    case AIProvider.GOOGLE_GEMINI: {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }

    case AIProvider.OPENAI: {
      const openai = createOpenAI({ 
        apiKey
      });
      return openai(modelId);
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
      return openrouter(modelId);
    }

    case AIProvider.MISTRAL: {
        const mistral = createMistral({ apiKey });
        return mistral(modelId);
    }

    case AIProvider.ANTHROPIC: {
        const anthropic = createAnthropic({ 
            apiKey,
            headers: {
                'anthropic-dangerous-direct-browser-access': 'true'
            }
        });
        return anthropic(modelId);
    }

    case AIProvider.GROQ: {
        const groq = createOpenAI({
            apiKey,
            baseURL: 'https://api.groq.com/openai/v1',
        });
        return groq(modelId);
    }

    case AIProvider.OLLAMA: {
        // Ollama uses local URL; if apiKey looks like a URL use that, otherwise default to http://localhost:11434/v1
        const rawUrl = (apiKey && apiKey.startsWith('http')) ? apiKey : 'http://localhost:11434/v1';
        const baseURL = rawUrl.endsWith('/v1') ? rawUrl : `${rawUrl}/v1`;
        const ollama = createOpenAI({
            apiKey: 'ollama',
            baseURL,
        });
        return ollama(modelId);
    }

    default:
      throw new Error(`Provider ${provider} not supported in factory.`);
  }
};
