
import { GoogleGenAI, Part, GenerateContentResponse, Content } from "@google/genai";
import OpenAI from 'openai';
import { 
    AIProvider, 
    GroundingChunk,
    StreamEvent,
    AIModelConfig,
    ConfigurableParams,
    OriginalQueryInfo,
    ChatMessage,
    ReportType,
    UploadedFile,
    CustomCommand
} from '../types.ts';
import { 
    INITIAL_MODELS_CONFIG, 
    standardOpenAIParameters, 
    standardGeminiParameters,
    getParametersForModel
} from '../models.config.ts';
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
        const mistralKey = this.userApiKeys[AIProvider.MISTRAL];
        
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
        if (this.provider === AIProvider.MISTRAL && mistralKey) {
             this.openaiClient = new OpenAI({
                baseURL: 'https://api.mistral.ai/v1',
                apiKey: mistralKey,
                dangerouslyAllowBrowser: true,
            });
        }
    }
    
    public static async validateApiKey(provider: AIProvider, key: string): Promise<{ isValid: boolean, error?: string }> {
        if (!key || !key.trim()) return { isValid: false, error: 'API Key cannot be empty.' };
        
        try {
            if (provider === AIProvider.GOOGLE_GEMINI) {
                const ai = new GoogleGenAI({ apiKey: key });
                // Use simplified content structure for quick validation
                await ai.models.generateContent({ 
                    model: 'gemini-3-flash-preview', 
                    contents: 'Ping' 
                });
            } else {
                const baseURLMap: Record<string, string> = {
                    [AIProvider.OPENAI]: 'https://api.openai.com/v1',
                    [AIProvider.MISTRAL]: 'https://api.mistral.ai/v1',
                    [AIProvider.OPENROUTER]: 'https://openrouter.ai/api/v1',
                };
                
                const baseURL = baseURLMap[provider];
                if (baseURL) {
                    // Use direct fetch for validation to get better error details
                    const response = await fetch(`${baseURL}/models`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${key}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error?.message || `API returned status ${response.status}`);
                    }
                }
            }
            return { isValid: true };
        } catch (e: any) {
            console.error(`[validateApiKey] ${provider} error:`, e);
            
            // Map standard fetch/connection errors to helpful user messages
            if (e.name === 'TypeError' && (e.message.includes('fetch') || e.message === 'Failed to fetch')) {
                return { 
                    isValid: false, 
                    error: `Connection error: The request to ${provider} was blocked. This is often due to CORS restrictions on browser-side API calls. Consider using a proxy or checking your network.` 
                };
            }
            
            return { isValid: false, error: e.message || 'Validation failed.' };
        }
    }

    public static async fetchAvailableModels(provider: AIProvider, apiKey: string): Promise<AIModelConfig[]> {
        const fallback = INITIAL_MODELS_CONFIG.filter(m => m.provider === provider);
        if (!apiKey) return fallback;
        
        try {
            if (provider === AIProvider.GOOGLE_GEMINI) {
                // Try v1 first, as it is generally more stable for GA keys
                let response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
                
                // Fallback to v1beta if v1 returns 404 or 400
                if (!response.ok) {
                    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                }

                if (!response.ok) {
                    console.info(`[Gemini] Discovery API unavailable (${response.status}). Using local model list.`);
                    return fallback;
                }
                
                const data = await response.json();
                if (!data.models) return fallback;

                const uniqueModelsMap = new Map<string, AIModelConfig>();

                data.models
                    .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
                    .forEach((model: any) => {
                        const id = model.name.split('/').pop();
                        if (uniqueModelsMap.has(id)) return;

                        const isGemini3 = id.includes('gemini-3') || id.includes('gemini-2.5') || id.includes('gemini-2.0');
                        const isThinkingSupported = isGemini3 || id.includes('thinking');
                        
                        let displayName = model.displayName || id;
                        if (id === 'gemini-3-pro-preview') displayName = 'Google Deep Research';

                        uniqueModelsMap.set(id, {
                            id: id,
                            name: displayName,
                            provider: AIProvider.GOOGLE_GEMINI,
                            parameters: getParametersForModel(id, AIProvider.GOOGLE_GEMINI),
                            supportsGoogleSearch: true,
                            supportsVision: true,
                            supportsThinking: isThinkingSupported,
                        });
                    });

                return Array.from(uniqueModelsMap.values()).sort((a, b) => b.id.localeCompare(a.id));
            } else {
                const baseURLMap: Record<string, string> = {
                    [AIProvider.OPENAI]: 'https://api.openai.com/v1',
                    [AIProvider.MISTRAL]: 'https://api.mistral.ai/v1',
                    [AIProvider.OPENROUTER]: 'https://openrouter.ai/api/v1',
                };
                
                const baseURL = baseURLMap[provider];
                if (!baseURL) return fallback;

                const response = await fetch(`${baseURL}/models`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    console.warn(`[${provider}] Model discovery failed with status ${response.status}`);
                    return fallback;
                }

                const data = await response.json();
                if (!data.data || !Array.isArray(data.data)) return fallback;

                const uniqueModelsMap = new Map<string, AIModelConfig>();

                data.data.forEach((model: any) => {
                    const id = model.id;
                    if (uniqueModelsMap.has(id)) return;

                    const name = model.name || id;
                    
                    // Basic heuristic for vision/thinking support
                    const supportsVision = id.toLowerCase().includes('vision') || 
                                         id.toLowerCase().includes('gpt-4o') || 
                                         id.toLowerCase().includes('claude-3') ||
                                         id.toLowerCase().includes('gemini');
                    
                    const supportsThinking = id.toLowerCase().includes('thinking') || 
                                           id.toLowerCase().includes('o1') || 
                                           id.toLowerCase().includes('o3') ||
                                           id.toLowerCase().includes('deepseek-r1');

                    uniqueModelsMap.set(id, {
                        id: id,
                        name: name,
                        provider: provider,
                        parameters: getParametersForModel(id, provider),
                        supportsVision,
                        supportsThinking,
                    });
                });

                return Array.from(uniqueModelsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            }
        } catch (e) {
            console.warn(`[${provider}] Model discovery failed:`, e);
            return fallback;
        }
    }

    public async *streamSiftAnalysis(options: {
        isInitialQuery: boolean;
        query: OriginalQueryInfo | string;
        fullChatHistory: ChatMessage[];
        modelConfigParams: ConfigurableParams;
        signal?: AbortSignal;
        customSystemPrompt?: string;
        command?: string | CustomCommand;
    }): AsyncIterableIterator<StreamEvent> {
        const { isInitialQuery, query, fullChatHistory, modelConfigParams, signal, customSystemPrompt, command } = options;

        let userPrompt = '';
        let reportType = ReportType.FULL_CHECK;
        let files: UploadedFile[] = [];
        let effectiveParams = { ...modelConfigParams };

        if (isInitialQuery && typeof query !== 'string') {
            userPrompt = constructFullPrompt(query.text || '', query.reportType);
            reportType = query.reportType;
            files = query.files || [];
        } else {
            userPrompt = typeof query === 'string' ? query : (query.text || '');
            if (command) {
                if (typeof command === 'string') {
                    userPrompt = `[COMMAND: ${command}] ${userPrompt}`;
                } else {
                    // Custom Command
                    userPrompt = `${command.prompt}\n\nUser Input: ${userPrompt}`;
                    if (command.parameters) {
                        effectiveParams = { ...effectiveParams, ...command.parameters };
                    }
                }
            }
        }

        yield { type: 'status', message: 'Connecting to AI provider...' };

        try {
            if (this.provider === AIProvider.GOOGLE_GEMINI && this.geminiAi) {
                const systemPrompt = getSystemPromptForSelectedModel(this.modelConfig, customSystemPrompt);
                const { gemini: history } = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, AIProvider.GOOGLE_GEMINI);

                const currentParts: Part[] = [];
                for (const file of files) {
                    const base64Data = file.base64Data.split(',')[1];
                    currentParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: file.type
                        }
                    });
                }
                currentParts.push({ text: userPrompt });

                const config: any = {
                    systemInstruction: systemPrompt,
                    temperature: Number(effectiveParams.temperature),
                    topP: Number(effectiveParams.topP),
                    topK: Number(effectiveParams.topK),
                };

                if (this.modelConfig.supportsGoogleSearch) {
                    config.tools = [{ googleSearch: {} }];
                }

                if (this.modelConfig.supportsThinking) {
                   config.thinkingConfig = { thinkingBudget: Number(effectiveParams.thinkingBudget) || 0 };
                   if (effectiveParams.maxOutputTokens) {
                       config.maxOutputTokens = Number(effectiveParams.maxOutputTokens);
                   }
                }

                const contents: Content[] = history ? [...history, { role: 'user', parts: currentParts }] : [{ role: 'user', parts: currentParts }];

                const responseStream = await this.geminiAi.models.generateContentStream({
                    model: this.modelConfig.id,
                    contents,
                    config: config
                });

                let fullText = '';
                let groundingSources: GroundingChunk[] = [];

                for await (const chunk of responseStream) {
                    if (signal?.aborted) break;
                    
                    const text = chunk.text;
                    if (text) {
                        fullText += text;
                        yield { type: 'chunk', text: text };
                    }

                    const candidate = chunk.candidates?.[0];
                    if (candidate?.groundingMetadata?.groundingChunks) {
                        const chunks = candidate.groundingMetadata.groundingChunks as any[];
                        const newSources = chunks.map(c => ({
                            web: c.web ? { uri: c.web.uri, title: c.web.title } : undefined
                        })).filter(s => s.web);
                        
                        if (newSources.length > 0) {
                            groundingSources = [...groundingSources, ...newSources];
                            yield { type: 'sources', sources: groundingSources };
                        }
                    }
                }

                yield {
                    type: 'final',
                    fullText,
                    modelId: this.modelConfig.id,
                    groundingSources,
                    isInitialSIFTReport: isInitialQuery,
                    originalQueryReportType: reportType
                };

            } else if (this.openaiClient) {
                const systemPrompt = getSystemPromptForSelectedModel(this.modelConfig, customSystemPrompt);
                const { openai: history } = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, this.provider);

                const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = history || [];
                
                const content: any[] = [{ type: 'text', text: userPrompt }];
                if (this.modelConfig.supportsVision) {
                    for (const file of files) {
                        if (file.type.startsWith('image/')) {
                            content.push({
                                type: 'image_url',
                                image_url: { url: file.base64Data }
                            });
                        }
                    }
                }

                messages.push({ role: 'user', content: content });

                const stream = await this.openaiClient.chat.completions.create({
                    model: this.modelConfig.id,
                    messages,
                    temperature: Number(effectiveParams.temperature),
                    top_p: Number(effectiveParams.topP),
                    stream: true,
                });

                let fullText = '';
                for await (const chunk of stream) {
                    if (signal?.aborted) break;
                    const text = chunk.choices[0]?.delta?.content || '';
                    if (text) {
                        fullText += text;
                        yield { type: 'chunk', text: text };
                    }
                }

                yield {
                    type: 'final',
                    fullText,
                    modelId: this.modelConfig.id,
                    isInitialSIFTReport: isInitialQuery,
                    originalQueryReportType: reportType
                };
            }
        } catch (e: any) {
            console.error("[streamSiftAnalysis] Error details:", e);
            yield { type: 'error', error: e.message || 'An error occurred during generation.' };
        }
    }
}
