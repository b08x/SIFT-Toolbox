
import { GoogleGenAI, Part, GenerateContentResponse, Content } from "@google/genai";
import { streamText, generateText, CoreMessage } from 'ai';
import { getVercelModel } from './providerFactory.ts';
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

export const isRateLimitOrQuotaError = (err: any): boolean => {
    if (!err) return false;
    const msg = String(err.message || '').toLowerCase();
    const status = err.status || err.code || err?.error?.code || err?.error?.status;
    const errStr = typeof err === 'object' ? JSON.stringify(err).toLowerCase() : String(err).toLowerCase();
    return (
        status === 429 ||
        status === 'RESOURCE_EXHAUSTED' ||
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota') ||
        msg.includes('rate limit') ||
        msg.includes('rate-limit') ||
        errStr.includes('429') ||
        errStr.includes('resource_exhausted') ||
        errStr.includes('quota')
    );
};

export class AgenticApiService {
    private geminiAi: GoogleGenAI | null = null;
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
        const geminiKey = this.userApiKeys[AIProvider.GOOGLE_GEMINI] || process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
        
        if (geminiKey) {
            this.geminiAi = new GoogleGenAI({ apiKey: geminiKey });
        }
    }
    
    public static async validateApiKey(provider: AIProvider, key: string): Promise<{ isValid: boolean, error?: string }> {
        if (!key || !key.trim()) return { isValid: false, error: 'API Key cannot be empty.' };
        
        try {
            if (provider === AIProvider.GOOGLE_GEMINI) {
                const ai = new GoogleGenAI({ apiKey: key });
                // Use gemini-2.5-flash for reliable validation without 429 quota exhaustion
                await ai.models.generateContent({ 
                    model: 'gemini-2.5-flash', 
                    contents: 'Ping' 
                });
            } else {
                const baseURLMap: Record<string, string> = {
                    [AIProvider.OPENAI]: 'https://api.openai.com/v1',
                    [AIProvider.MISTRAL]: 'https://api.mistral.ai/v1',
                    [AIProvider.OPENROUTER]: 'https://openrouter.ai/api/v1',
                    [AIProvider.ANTHROPIC]: 'https://api.anthropic.com/v1',
                };
                
                const baseURL = baseURLMap[provider];
                if (baseURL) {
                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json'
                    };
                    
                    if (provider === AIProvider.ANTHROPIC) {
                        headers['x-api-key'] = key;
                        headers['anthropic-version'] = '2023-06-01';
                    } else {
                        headers['Authorization'] = `Bearer ${key}`;
                    }

                    // Use direct fetch for validation to get better error details
                    const response = await fetch(`${baseURL}/models`, {
                        method: 'GET',
                        headers
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
                // Try v1beta first to get preview models
                let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                
                // Fallback to v1 if v1beta fails
                if (!response.ok) {
                    response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
                }

                if (!response.ok) {
                    console.info(`[Gemini] Discovery API unavailable (${response.status}). Using local model list.`);
                    return fallback;
                }
                
                const data = await response.json();
                if (!data.models) return fallback;

                const uniqueModelsMap = new Map<string, AIModelConfig>();

                // Exclude deprecated or non-text generation models
                const deprecatedPrefixes = ['gemini-1.5', 'gemini-1.0', 'gemini-2.0', 'text-bison', 'chat-bison', 'embedding', 'aqa'];
                const nonTextSubstrings = ['embedding', 'tts', 'transcribe', 'image-preview', 'robotics', 'computer-use'];

                data.models
                    .filter((m: any) => {
                        if (!m.supportedGenerationMethods?.includes('generateContent')) return false;
                        const id = (m.name.split('/').pop() || '').toLowerCase();
                        if (deprecatedPrefixes.some(p => id.startsWith(p))) return false;
                        if (nonTextSubstrings.some(s => id.includes(s))) return false;
                        return true;
                    })
                    .forEach((model: any) => {
                        const id = model.name.split('/').pop();
                        if (uniqueModelsMap.has(id)) return;

                        const isGemini3 = id.includes('gemini-3') || id.includes('gemini-2.5');
                        const isThinkingSupported = isGemini3 || id.includes('thinking');
                        
                        let displayName = model.displayName || id;
                        if (id === 'gemini-2.5-flash') displayName = 'Gemini 2.5 Flash (Recommended)';
                        else if (id === 'gemini-2.5-flash-lite') displayName = 'Gemini 2.5 Flash Lite (High Speed)';
                        else if (id === 'gemini-3.1-pro-preview') displayName = 'Google Deep Research (Pro / Paid)';

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

                // Prioritize stable, high-quota models at top
                const getModelRank = (id: string): number => {
                    if (id === 'gemini-2.5-flash') return 1;
                    if (id === 'gemini-2.5-flash-lite') return 2;
                    if (id === 'gemini-3.8-flash') return 3;
                    if (id === 'gemini-3-flash-preview') return 4;
                    if (id === 'gemini-3.1-flash-lite') return 5;
                    if (id === 'gemini-3.1-pro-preview') return 6;
                    if (id.includes('flash')) return 10;
                    if (id.includes('pro')) return 20;
                    return 30;
                };

                return Array.from(uniqueModelsMap.values()).sort((a, b) => {
                    const rankA = getModelRank(a.id);
                    const rankB = getModelRank(b.id);
                    if (rankA !== rankB) return rankA - rankB;
                    return a.id.localeCompare(b.id);
                });
            } else {
                const baseURLMap: Record<string, string> = {
                    [AIProvider.OPENAI]: 'https://api.openai.com/v1',
                    [AIProvider.MISTRAL]: 'https://api.mistral.ai/v1',
                    [AIProvider.OPENROUTER]: 'https://openrouter.ai/api/v1',
                    [AIProvider.ANTHROPIC]: 'https://api.anthropic.com/v1',
                };
                
                const baseURL = baseURLMap[provider];
                if (!baseURL) return fallback;

                const headers: Record<string, string> = {
                    'Content-Type': 'application/json'
                };
                
                if (provider === AIProvider.ANTHROPIC) {
                    headers['x-api-key'] = apiKey;
                    headers['anthropic-version'] = '2023-06-01';
                } else {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                const response = await fetch(`${baseURL}/models`, {
                    method: 'GET',
                    headers
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

                    const name = model.name || model.display_name || id;
                    
                    // Basic heuristic for vision/thinking support
                    const supportsVision = id.toLowerCase().includes('vision') || 
                                         id.toLowerCase().includes('gpt-4o') || 
                                         id.toLowerCase().includes('claude-3') ||
                                         id.toLowerCase().includes('gemini');
                    
                    const supportsThinking = id.toLowerCase().includes('thinking') || 
                                           id.toLowerCase().includes('o1') || 
                                           id.toLowerCase().includes('o3') ||
                                           id.toLowerCase().includes('deepseek-r1') ||
                                           id.toLowerCase().includes('claude-3-7');

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
                    if (!file.base64Data) {
                        console.warn(`File ${file.name} is missing base64Data (likely restored from a previous session). Skipping.`);
                        continue;
                    }
                    const base64Data = file.base64Data.split(',')[1];
                    currentParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: file.type
                        }
                    });
                }
                currentParts.push({ text: userPrompt });

                let contents: Content[] = [];
                if (history && history.length > 0) {
                    const cleanHistory = [...history];
                    // Ensure alternating turns: if history ends with 'user', merge it with the new turn
                    if (cleanHistory[cleanHistory.length - 1].role === 'user') {
                        const lastUser = cleanHistory.pop()!;
                        const existingText = lastUser.parts?.map(p => ('text' in p ? p.text : '')).join(' ') || '';
                        if (existingText) {
                            currentParts.unshift({ text: existingText });
                        }
                    }
                    contents = [...cleanHistory, { role: 'user', parts: currentParts }];
                } else {
                    contents = [{ role: 'user', parts: currentParts }];
                }

                // Determine candidate models in order of attempt for 429 quota resilience
                const candidateModels: string[] = [];
                const requestedModel = this.modelConfig.id;
                candidateModels.push(requestedModel);
                if (requestedModel !== 'gemini-2.5-flash') {
                    candidateModels.push('gemini-2.5-flash');
                }
                if (requestedModel !== 'gemini-2.5-flash-lite') {
                    candidateModels.push('gemini-2.5-flash-lite');
                }

                let streamSucceeded = false;
                let lastError: any = null;

                for (let attemptIdx = 0; attemptIdx < candidateModels.length; attemptIdx++) {
                    const activeModelId = candidateModels[attemptIdx];
                    const isFallback = attemptIdx > 0;

                    if (isFallback) {
                        yield {
                            type: 'status',
                            message: `Quota limit reached on ${candidateModels[attemptIdx - 1]}. Automatically continuing analysis with ${activeModelId}...`
                        };
                        await new Promise(r => setTimeout(r, 600));
                    }

                    const config: any = {
                        systemInstruction: systemPrompt,
                        temperature: Number(effectiveParams.temperature) || 0.7,
                        topP: Number(effectiveParams.topP) || 0.95,
                        topK: Number(effectiveParams.topK) || 40,
                    };

                    // Include Google Search grounding for supported models
                    if (this.modelConfig.supportsGoogleSearch || activeModelId.includes('flash')) {
                        config.tools = [{ googleSearch: {} }];
                    }

                    if (activeModelId.includes('gemini-3') || activeModelId.includes('gemini-2.5-flash')) {
                        if (this.modelConfig.supportsThinking && Number(effectiveParams.thinkingBudget) > 0) {
                            config.thinkingConfig = { thinkingBudget: Number(effectiveParams.thinkingBudget) };
                        }
                        if (effectiveParams.maxOutputTokens) {
                            config.maxOutputTokens = Number(effectiveParams.maxOutputTokens);
                        }
                    }

                    try {
                        const responseStream = await this.geminiAi.models.generateContentStream({
                            model: activeModelId,
                            contents,
                            config: config
                        });

                        let fullText = '';
                        let groundingSources: GroundingChunk[] = [];
                        let streamEmitted = false;

                        for await (const chunk of responseStream) {
                            if (signal?.aborted) break;
                            
                            const text = chunk.text;
                            if (text) {
                                streamEmitted = true;
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
                            modelId: activeModelId,
                            groundingSources,
                            isInitialSIFTReport: isInitialQuery,
                            originalQueryReportType: reportType
                        };

                        streamSucceeded = true;
                        break; // Success! Exit candidate model loop
                    } catch (err: any) {
                        lastError = err;
                        console.warn(`[streamSiftAnalysis] Error on ${activeModelId}:`, err);

                        const isQuota = isRateLimitOrQuotaError(err);
                        // If quota error and we have another candidate model, retry with next model
                        if (isQuota && attemptIdx < candidateModels.length - 1) {
                            continue;
                        }
                        break;
                    }
                }

                if (!streamSucceeded && lastError) {
                    if (isRateLimitOrQuotaError(lastError)) {
                        yield {
                            type: 'error',
                            error: `⚠️ **API Rate Limit / Quota Exceeded (429 RESOURCE_EXHAUSTED)**\n\nThe request exceeded the available quota on the Gemini API.\n\n**Quick solutions:**\n• **Wait 30–60 seconds**: Free tier rate limits automatically refresh every minute.\n• **Switch Model**: In **Settings**, select **Gemini 2.5 Flash** or **Gemini 2.5 Flash Lite** for the highest throughput.\n• **Use Personal API Key**: In **Settings → API Keys**, add your personal Gemini API key to avoid shared project quota limits.`
                        };
                    } else {
                        yield {
                            type: 'error',
                            error: lastError.message || 'An error occurred during generation.'
                        };
                    }
                }

            } else {
                const providerApiKey = this.userApiKeys[this.provider];
                const apiKey = providerApiKey || (this.provider === AIProvider.GOOGLE_GEMINI ? (process.env.API_KEY || (process.env as any).GEMINI_API_KEY) : undefined);
                if (!apiKey) throw new Error(`API key missing for ${this.provider}`);

                const model = getVercelModel(this.provider, apiKey, this.modelConfig.id);
                const systemPrompt = getSystemPromptForSelectedModel(this.modelConfig, customSystemPrompt);
                const { openai: history } = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, this.provider);

                const messages: CoreMessage[] = (history || []).map(msg => {
                    // Map OpenAI format to Vercel CoreMessage format
                    if (msg.role === 'system') {
                        return { role: 'system', content: msg.content as string };
                    } else if (msg.role === 'user') {
                        return { role: 'user', content: msg.content as string };
                    } else if (msg.role === 'assistant') {
                        return { role: 'assistant', content: msg.content as string };
                    }
                    return { role: 'user', content: '' };
                });
                
                const contentParts: any[] = [{ type: 'text', text: userPrompt }];
                if (this.modelConfig.supportsVision) {
                    for (const file of files) {
                        if (file.type.startsWith('image/') && file.base64Data) {
                            contentParts.push({
                                type: 'image',
                                image: file.base64Data
                            });
                        } else if (file.type.startsWith('image/') && !file.base64Data) {
                            console.warn(`Image ${file.name} is missing base64Data (likely restored from a previous session). Skipping.`);
                        }
                    }
                }

                messages.push({ role: 'user', content: contentParts as any });

                const { textStream } = await streamText({
                    model: model as any,
                    messages,
                    system: systemPrompt,
                    temperature: Number(effectiveParams.temperature),
                    topP: Number(effectiveParams.topP),
                    abortSignal: signal,
                });

                let fullText = '';
                for await (const textPart of textStream) {
                    if (signal?.aborted) break;
                    if (textPart) {
                        fullText += textPart;
                        yield { type: 'chunk', text: textPart };
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
            if (isRateLimitOrQuotaError(e)) {
                yield {
                    type: 'error',
                    error: `⚠️ **API Rate Limit / Quota Exceeded (429 RESOURCE_EXHAUSTED)**\n\nThe request exceeded the available quota on the Gemini API.\n\n**Quick solutions:**\n• **Wait 30–60 seconds**: Free tier rate limits automatically refresh every minute.\n• **Switch Model**: In **Settings**, select **Gemini 2.5 Flash** or **Gemini 2.5 Flash Lite**.\n• **Use Personal API Key**: In **Settings → API Keys**, add your personal Gemini API key.`
                };
            } else {
                yield { type: 'error', error: e.message || 'An error occurred during generation.' };
            }
        }
    }

    public async suggestFollowUpQueries(reportText: string): Promise<string[]> {
        if (!this.modelConfig) return [];
        
        try {
            const systemPrompt = `You are a helpful assistant. Based on the provided fact-checking/contextualization report, suggest exactly three follow-up search queries that the user could run to deep-dive into the claims or topics mentioned. Return ONLY a JSON array of strings, with no markdown formatting or other text. Example: ["Query 1", "Query 2", "Query 3"]`;
            
            if (this.provider === AIProvider.GOOGLE_GEMINI && this.geminiAi) {
                // Try fast, generous-quota models for follow-up suggestions
                const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
                if (this.modelConfig.id && !candidateModels.includes(this.modelConfig.id) && !this.modelConfig.id.includes('pro')) {
                    candidateModels.unshift(this.modelConfig.id);
                }

                for (const modelId of candidateModels) {
                    try {
                        const response = await this.geminiAi.models.generateContent({
                            model: modelId,
                            contents: reportText.slice(0, 8000), // Keep concise to save tokens
                            config: {
                                systemInstruction: systemPrompt,
                                temperature: 0.7,
                            }
                        });
                        const cleanedText = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
                        const queries = JSON.parse(cleanedText);
                        if (Array.isArray(queries) && queries.length > 0) {
                            return queries.slice(0, 3);
                        }
                    } catch (err: any) {
                        if (isRateLimitOrQuotaError(err)) {
                            continue;
                        }
                        console.warn(`[suggestFollowUpQueries] Model ${modelId} error:`, err?.message);
                    }
                }
                return [];
            }

            const providerApiKey = this.userApiKeys[this.provider];
            const apiKey = providerApiKey || (this.provider === AIProvider.GOOGLE_GEMINI ? (process.env.API_KEY || (process.env as any).GEMINI_API_KEY) : undefined);
            if (!apiKey) return [];

            const model = getVercelModel(this.provider, apiKey, this.modelConfig.id);
            
            const { text } = await generateText({
                model: model as any,
                messages: [{ role: 'user', content: reportText }],
                system: systemPrompt,
                temperature: 0.7,
            });
            
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const queries = JSON.parse(cleanedText);
            
            if (Array.isArray(queries) && queries.length > 0) {
                return queries.slice(0, 3);
            }
            return [];
        } catch (e) {
            console.error("[suggestFollowUpQueries] Error generating follow-up queries:", e);
            return [];
        }
    }
}
