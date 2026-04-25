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
        const anthropic = createAnthropic({ apiKey });
        return anthropic(modelId);
    }

    default:
      throw new Error(`Provider ${provider} not supported in factory.`);
  }
};
