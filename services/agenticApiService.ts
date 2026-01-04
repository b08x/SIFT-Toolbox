
import { GoogleGenAI, Part } from "@google/genai";
import OpenAI from 'openai';
import { streamText } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { 
    AIProvider, 
    GroundingChunk,
    StreamEvent,
    AIModelConfig,
    ConfigurableParams,
    OriginalQueryInfo,
    ChatMessage,
    ReportType
} from '../types.ts';
import { INITIAL_MODELS_CONFIG, standardOpenAIParameters, standardGeminiParameters } from '../models.config.ts';
import { getSystemPromptForSelectedModel, getTruncatedHistoryForApi } from '../utils/apiHelpers.ts';
import { constructFullPrompt } from "../prompts.ts";

export class AgenticApiService {
    private geminiAi: GoogleGenAI | null = null;
    private openaiClient: OpenAI | null = null;
    private provider: AIProvider;
    private modelConfig: AIModelConfig;
    
    constructor(
        provider: AIProvider,
        modelId: string,
        private userApiKeys: { [key in AIProvider]?: string },
        private enableGeminiPreprocessing: boolean,
        availableModels: AIModelConfig[],
    ) {
        this.provider = provider;
        const modelConfig = availableModels.find(m => m.id === modelId && m.provider === provider);
        this.modelConfig = modelConfig || INITIAL_MODELS_CONFIG.find(m => m.id === modelId && m.provider === provider) || INITIAL_MODELS_CONFIG[0];
        this.initializeClients();
    }

    private initializeClients() {
        const geminiKey = process.env.API_KEY;
        const openaiKey = this.userApiKeys[AIProvider.OPENAI];
        const openrouterKey = this.userApiKeys[AIProvider.OPENROUTER];
        
        if (geminiKey) {
            this.geminiAi = new GoogleGenAI({ apiKey: geminiKey });
        }
        if (this.provider === AIProvider.OPENAI && openaiKey) {
            this.openaiClient = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });
        }
        if (this.provider === AIProvider.OPENROUTER && openrouterKey) {
            this.openaiClient = new OpenAI({
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: openrouterKey,
                dangerouslyAllowBrowser: true,
            });
        }
    }
    
    public static async validateApiKey(provider: AIProvider, key: string): Promise<{ isValid: boolean, error?: string }> {
        if (!key.trim()) return { isValid: false, error: 'API Key cannot be empty.' };
        try {
            if (provider === AIProvider.GOOGLE_GEMINI) {
                const ai = new GoogleGenAI({ apiKey: key });
                await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: 'test' });
            } else if (provider === AIProvider.OPENAI) {
                const openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
                await openai.chat.completions.create({ model: 'gpt-3.5-turbo', messages: [{role: 'user', content: 'test'}], max_tokens: 5});
            } else if (provider === AIProvider.OPENROUTER) {
                const openrouter = new OpenAI({
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: key,
                    dangerouslyAllowBrowser: true,
                });
                await openrouter.chat.completions.create({ model: 'openai/gpt-4o-mini', messages: [{role: 'user', content: 'test'}], max_tokens: 5});
            } else if (provider === AIProvider.MISTRAL) {
                const mistralProvider = createMistral({ apiKey: key });
                await streamText({
                    model: mistralProvider('mistral-small-latest'),
                    prompt: 'test',
                    maxTokens: 5,
                });
            }
            return { isValid: true };
        } catch (e: any) {
            return { isValid: false, error: e.message };
        }
    }

    public static async fetchAvailableModels(provider: AIProvider, key: string): Promise<AIModelConfig[]> {
        try {
            if (provider === AIProvider.GOOGLE_GEMINI) {
                return INITIAL_MODELS_CONFIG.filter(m => m.provider === AIProvider.GOOGLE_GEMINI);
            }
            if (provider === AIProvider.OPENAI) {
                const openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
                const response = await openai.models.list();
                return response.data
                    .filter(model => model.id.startsWith('gpt-'))
                    .sort((a, b) => b.id.localeCompare(a.id))
                    .map(model => ({
                        id: model.id,
                        name: model.id.toUpperCase(),
                        provider: AIProvider.OPENAI,
                        parameters: standardOpenAIParameters,
                        supportsVision: model.id.includes('4o'),
                    }));
            }
            if (provider === AIProvider.OPENROUTER) {
                const openrouter = new OpenAI({
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: key,
                    dangerouslyAllowBrowser: true,
                });
                const response = await openrouter.models.list();
                return response.data
                    .filter((m: any) => !m.id.includes('dall-e') && !m.id.includes('whisper'))
                    .map((model: any) => ({
                        id: model.id,
                        name: model.name || model.id,
                        provider: AIProvider.OPENROUTER,
                        parameters: standardOpenAIParameters,
                        supportsVision: model.architecture?.modality?.includes('image') || model.id.includes('vision') || false,
                    }));
            }
            if (provider === AIProvider.MISTRAL) {
                const response = await fetch('https://api.mistral.ai/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                if (!response.ok) throw new Error('Mistral API call failed');
                const data = await response.json();
                return data.data
                    .sort((a: any, b: any) => a.id.localeCompare(b.id))
                    .map((model: any) => ({
                        id: model.id,
                        name: model.id.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                        provider: AIProvider.MISTRAL,
                        parameters: standardOpenAIParameters,
                        supportsVision: model.id.includes('pixtral'),
                    }));
            }
        } catch (error) {
            console.error(`Failed to fetch models for ${provider}:`, error);
        }
        return INITIAL_MODELS_CONFIG.filter(m => m.provider === provider);
    }

    private constructPromptFromQuery(query: OriginalQueryInfo): { promptParts: Part[], textPrompt: string } {
        const textPromptContent = constructFullPrompt(query.text || "Analyze the provided input.", query.reportType);
        const parts: Part[] = [{ text: textPromptContent }];
        if (query.files) {
            query.files.forEach(file => {
                const [header, data] = file.base64Data.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
                parts.push({ inlineData: { data, mimeType } });
            });
        }
        return { promptParts: parts, textPrompt: textPromptContent };
    }

    async * streamSiftAnalysis(params: {
        isInitialQuery: boolean;
        query: OriginalQueryInfo | string;
        fullChatHistory: ChatMessage[];
        modelConfigParams: ConfigurableParams;
        signal: AbortSignal;
        command?: string;
        customSystemPrompt?: string;
    }): AsyncGenerator<StreamEvent> {
        const { isInitialQuery, query, fullChatHistory, modelConfigParams, signal, customSystemPrompt } = params;
        const systemPrompt = getSystemPromptForSelectedModel(this.modelConfig, customSystemPrompt);

        try {
            if (this.provider === AIProvider.GOOGLE_GEMINI) {
                if (!this.geminiAi) throw new Error("Gemini API Key not found.");
                
                const history = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, AIProvider.GOOGLE_GEMINI).gemini || [];
                const chat = this.geminiAi.chats.create({
                    model: this.modelConfig.id,
                    config: { systemInstruction: systemPrompt },
                    history,
                });

                let prompt: any;
                if (isInitialQuery) {
                    const { promptParts } = this.constructPromptFromQuery(query as OriginalQueryInfo);
                    prompt = promptParts;
                } else {
                    prompt = query as string;
                }

                const stream = await chat.sendMessageStream({ message: prompt });
                let fullText = '';
                for await (const chunk of stream) {
                    if (signal.aborted) break;
                    const text = chunk.text || '';
                    fullText += text;
                    yield { type: 'chunk', text: text };
                    if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                        const chunks = chunk.candidates[0].groundingMetadata.groundingChunks.map((gc: any) => ({ web: gc.web }));
                        yield { type: 'sources', sources: chunks };
                    }
                }
                yield { 
                    type: 'final', 
                    fullText, 
                    modelId: this.modelConfig.id, 
                    isInitialSIFTReport: isInitialQuery 
                };
            } else if (this.provider === AIProvider.MISTRAL) {
                const mistralKey = this.userApiKeys[AIProvider.MISTRAL];
                if (!mistralKey) throw new Error("Mistral API key not configured.");
                
                const mistral = createMistral({ apiKey: mistralKey });
                const history = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, AIProvider.MISTRAL).openai || [];
                
                const { textStream } = await streamText({
                    model: mistral(this.modelConfig.id),
                    messages: [...history, { role: 'user', content: isInitialQuery ? (query as OriginalQueryInfo).text : (query as string) }],
                    abortSignal: signal,
                });

                let fullText = '';
                for await (const textPart of textStream) {
                    fullText += textPart;
                    yield { type: 'chunk', text: textPart };
                }
                yield { type: 'final', fullText, modelId: this.modelConfig.id, isInitialSIFTReport: isInitialQuery };
            } else {
                const client = this.openaiClient;
                if (!client) throw new Error(`${this.provider} API client not initialized. Check your API key.`);
                
                const history = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, this.provider).openai || [];
                const stream = await client.chat.completions.create({
                    model: this.modelConfig.id,
                    messages: [...history, { role: 'user', content: isInitialQuery ? (query as OriginalQueryInfo).text : (query as string) }],
                    stream: true,
                    temperature: modelConfigParams.temperature as number,
                    top_p: modelConfigParams.topP as number,
                    max_tokens: modelConfigParams.max_tokens as number,
                });

                let fullText = '';
                for await (const chunk of stream) {
                    if (signal.aborted) break;
                    const content = chunk.choices[0]?.delta?.content || "";
                    fullText += content;
                    yield { type: 'chunk', text: content };
                }
                yield { 
                    type: 'final', 
                    fullText, 
                    modelId: this.modelConfig.id, 
                    isInitialSIFTReport: isInitialQuery 
                };
            }
        } catch (e: any) {
            yield { type: 'error', error: e.message };
        }
    }
}
