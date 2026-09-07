
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
    CustomCommand,
    McpSearchConfig,
    SourceAssessment
} from '../types.ts';
import { 
    INITIAL_MODELS_CONFIG, 
    standardOpenAIParameters, 
    standardGeminiParameters,
    getParametersForModel,
    isModelSIFTCompliant
} from '../models.config.ts';
import { getSystemPromptForSelectedModel, getTruncatedHistoryForApi, SessionContextOptions } from '../utils/apiHelpers.ts';
import { constructFullPrompt } from "../prompts.ts";
import { McpSearchService, DEFAULT_MCP_CONFIG } from './mcpSearchService.ts';

export const formatSiftCommandPrompt = (
    command: string | CustomCommand,
    userInput: string,
    topicContext?: string
): string => {
    if (typeof command !== 'string') {
        return `${command.prompt}\n\nUser Input / Focus: ${userInput}`;
    }

    const trimmedInput = userInput.trim();
    const activeSubject = topicContext || trimmedInput || 'the ongoing investigation';

    switch (command) {
        case 'another round':
            return `[SIFT COMMAND: Another Round]
Execute another round of lateral reading and source discovery for the ongoing investigation on: "${activeSubject}".
Objectives:
1. Search for new, contrasting, or orthogonal sources that broaden the viewpoint pool (e.g., at least one source challenging the consensus/majority view, and one offering a different perspective).
2. Evaluate these new sources with URL, position on issue, and usefulness rating (1–5).
3. Present a concise "### 🔄 Post-Round Update" explaining what new evidence has come to light, whether it reinforces or contradicts prior findings, and if/how it shifts our understanding of the central claim.
${trimmedInput && trimmedInput !== 'another round' ? `\nUser's Specific Query: "${trimmedInput}"` : ''}`;

        case 'read the room':
            return `[SIFT COMMAND: Read the Room]
Survey and analyze the broader information environment and structure of expert and public opinion regarding: "${activeSubject}".
Objectives:
1. Explicitly characterize the expert discourse using standard consensus taxonomy:
   - Consensus (evidence is compelling, question is closed among experts)
   - Majority/Minority (one dominant theory with credible minority dissent)
   - Competing Theories (multiple viable hypotheses, none dominant)
   - Genuine Uncertainty (experts acknowledge "we just don't know yet")
   - Fringe Viewpoints (isolated claims outside scholarly/professional dialogue)
2. Explain what is driving disagreement (methodological differences, definitions, ideological framing, or commercial/political incentives).
3. Conclude with an objective synthesis of the prevailing landscape.
${trimmedInput && trimmedInput !== 'read the room' ? `\nUser's Specific Query: "${trimmedInput}"` : ''}`;

        case 'trace_claim':
            return `[SIFT COMMAND: Trace Claim to Source]
Trace the claim back to its primary origin or earliest known publication for: "${activeSubject}".
Objectives:
1. Identify who first stated or published this claim, when, and where.
2. Locate the primary source (e.g., original scientific paper, official transcript, legislation text, raw video, or uncropped photograph).
3. Compare the original source with how it has been simplified, exaggerated, or distorted in downstream reporting.
${trimmedInput && trimmedInput !== 'trace claim' ? `\nUser's Specific Query: "${trimmedInput}"` : ''}`;

        case 'discourse_map':
            return `[SIFT COMMAND: Discourse Map]
Construct a structured Discourse Map of the key perspectives surrounding: "${activeSubject}".
Objectives:
1. Identify the major stakeholders and factions (e.g., regulatory bodies, independent researchers, industry advocates, consumer groups).
2. For each faction, summarize their core argument, primary evidence cited, and underlying incentives or assumptions.
3. Highlight points of agreement across camps vs crux unresolved disagreements.
${trimmedInput && trimmedInput !== 'discourse map' ? `\nUser's Specific Query: "${trimmedInput}"` : ''}`;

        case 'explain_like_im_in_high_school':
            return `[SIFT COMMAND: Explain Like I'm in High School]
Explain the verified facts and findings regarding "${activeSubject}" in clear, relatable, conversational language suitable for a high school student.
Avoid dense academic or legal jargon without sacrificing nuance. Use clear analogies and walk through why the claim was misleading or accurate.
${trimmedInput && trimmedInput !== "explain like i'm in high school" ? `\nUser's Specific Query: "${trimmedInput}"` : ''}`;

        case 'generate_community_note':
            return `[SIFT COMMAND: Generate Community Note]
Draft an objective, high-utility Community Note regarding: "${activeSubject}".
Structure:
- Context Summary (under 280 characters): Neutral statement of what context is missing or what factual correction applies.
- Key Evidence & Sources: Bulleted links to authoritative primary sources.
- Why It Matters: Brief explanation of how it corrects potential public misunderstanding.
${trimmedInput && trimmedInput !== 'generate community note' ? `\nUser's Specific Query: "${trimmedInput}"` : ''}`;

        case 'generate_context_report':
            return `[SIFT COMMAND: Generate Context Report]
Generate a comprehensive Context Report on "${activeSubject}", detailing the historical background, institutional definitions, and systemic factors that provide the necessary context to evaluate this claim accurately.
${trimmedInput && trimmedInput !== 'generate context report' ? `\nUser's Specific Query: "${trimmedInput}"` : ''}`;

        case 'web_search':
            return `[SIFT COMMAND: Web Search Verification]
Perform targeted web search verification on this query: "${trimmedInput || activeSubject}". Focus on authoritative, recent primary sources and state the verifiable facts clearly with direct citations.`;

        default:
            return `[SIFT COMMAND: ${command}] ${trimmedInput}`;
    }
};

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
        private mcpSearchConfig?: McpSearchConfig,
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
        // Ollama runs locally and does not strictly require a key (or key can be custom server URL)
        if (provider === AIProvider.OLLAMA) {
            try {
                const rawUrl = (key && key.startsWith('http')) ? key : 'http://localhost:11434';
                const endpoint = rawUrl.endsWith('/') ? `${rawUrl}api/tags` : `${rawUrl}/api/tags`;
                const response = await fetch(endpoint, { method: 'GET' });
                if (response.ok) return { isValid: true };
                return { isValid: true }; // Local service may be reachable
            } catch {
                return { isValid: true }; // Allow local setup
            }
        }

        if (!key || !key.trim()) return { isValid: false, error: 'API Key cannot be empty.' };
        
        // Key format pre-validation to prevent cross-provider errors (e.g. OpenRouter key used in OpenAI)
        const trimmedKey = key.trim();
        if (provider === AIProvider.OPENAI) {
            if (trimmedKey.startsWith('sk-or-v1')) {
                return { isValid: false, error: "This key begins with 'sk-or-v1-', which is an OpenRouter API key. Please place it in the OpenRouter field." };
            }
            if (trimmedKey.startsWith('sk-ant-')) {
                return { isValid: false, error: "This key begins with 'sk-ant-', which is an Anthropic Claude API key. Please place it in the Anthropic field." };
            }
        } else if (provider === AIProvider.ANTHROPIC) {
            if (trimmedKey.startsWith('sk-or-v1')) {
                return { isValid: false, error: "This key begins with 'sk-or-v1-', which is an OpenRouter API key. Please place it in the OpenRouter field." };
            }
        }

        try {
            if (provider === AIProvider.GOOGLE_GEMINI) {
                const ai = new GoogleGenAI({ apiKey: trimmedKey });
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
                    [AIProvider.GROQ]: 'https://api.groq.com/openai/v1',
                };
                
                const baseURL = baseURLMap[provider];
                if (baseURL) {
                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json'
                    };
                    
                    if (provider === AIProvider.ANTHROPIC) {
                        headers['x-api-key'] = trimmedKey;
                        headers['anthropic-version'] = '2023-06-01';
                        headers['anthropic-dangerous-direct-browser-access'] = 'true';
                    } else {
                        headers['Authorization'] = `Bearer ${trimmedKey}`;
                    }

                    // Use direct fetch for validation to get better error details
                    const response = await fetch(`${baseURL}/models`, {
                        method: 'GET',
                        headers
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        const errorMsg = errorData.error?.message || `API returned status ${response.status} (${response.statusText})`;
                        console.warn(`[validateApiKey] ${provider} validation rejected:`, errorMsg);
                        return { isValid: false, error: errorMsg };
                    }
                }
            }
            return { isValid: true };
        } catch (e: any) {
            console.warn(`[validateApiKey] ${provider} validation exception:`, e?.message || e);
            
            // Map standard fetch/connection errors to helpful user messages
            if (e.name === 'TypeError' && (e.message?.includes('fetch') || e.message === 'Failed to fetch')) {
                return { 
                    isValid: false, 
                    error: `Connection error: The request to ${provider} was blocked or unreachable. Please check your network or proxy settings.` 
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

                // Exclude non-generative utility models (embeddings, audio-only TTS, etc.)
                const nonTextSubstrings = ['embedding', 'tts', 'transcribe', 'image-preview', 'robotics', 'computer-use', 'bison', 'aqa'];

                data.models
                    .filter((m: any) => {
                        if (!m.supportedGenerationMethods?.includes('generateContent')) return false;
                        const id = (m.name.split('/').pop() || '').toLowerCase();
                        if (nonTextSubstrings.some(s => id.includes(s))) return false;
                        return true;
                    })
                    .forEach((model: any) => {
                        const id = model.name.split('/').pop();
                        if (uniqueModelsMap.has(id)) return;

                        const isThinkingSupported = id.includes('thinking') || id.includes('gemini-2.5') || id.includes('gemini-3');
                        
                        let displayName = model.displayName || id;
                        if (id === 'gemini-2.5-flash') displayName = 'Gemini 2.5 Flash (Recommended)';
                        else if (id === 'gemini-2.0-flash') displayName = 'Gemini 2.0 Flash';
                        else if (id === 'gemini-2.0-flash-lite') displayName = 'Gemini 2.0 Flash Lite';
                        else if (id === 'gemini-1.5-flash') displayName = 'Gemini 1.5 Flash';
                        else if (id === 'gemini-1.5-pro') displayName = 'Gemini 1.5 Pro';
                        else if (id === 'gemini-3.1-pro-preview') displayName = 'Google Deep Research (Pro / Paid)';

                        const modelConfig: AIModelConfig = {
                            id: id,
                            name: displayName,
                            provider: AIProvider.GOOGLE_GEMINI,
                            parameters: getParametersForModel(id, AIProvider.GOOGLE_GEMINI),
                            supportsGoogleSearch: true,
                            supportsVision: true,
                            supportsThinking: isThinkingSupported,
                            capabilities: {
                                tools: true,
                                structuredOutputs: true,
                                vision: true,
                                webSearch: true,
                                thinking: isThinkingSupported,
                            }
                        };

                        uniqueModelsMap.set(id, modelConfig);
                    });

                // Prioritize stable, high-quota models at top
                const getModelRank = (id: string): number => {
                    if (id === 'gemini-2.5-flash') return 1;
                    if (id === 'gemini-2.0-flash') return 2;
                    if (id === 'gemini-2.0-flash-lite') return 3;
                    if (id === 'gemini-1.5-flash') return 4;
                    if (id === 'gemini-1.5-pro') return 5;
                    if (id === 'gemini-3.8-flash') return 6;
                    if (id === 'gemini-3-flash-preview') return 7;
                    if (id === 'gemini-3.1-pro-preview') return 8;
                    if (id.includes('flash')) return 10;
                    if (id.includes('pro')) return 20;
                    return 30;
                };

                const compliantList = Array.from(uniqueModelsMap.values())
                    .sort((a, b) => {
                        const rankA = getModelRank(a.id);
                        const rankB = getModelRank(b.id);
                        if (rankA !== rankB) return rankA - rankB;
                        return a.id.localeCompare(b.id);
                    });

                return compliantList.length > 0 ? compliantList : fallback;
            } else if (provider === AIProvider.OLLAMA) {
                const rawUrl = (apiKey && apiKey.startsWith('http')) ? apiKey : 'http://localhost:11434';
                const baseUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
                try {
                    const response = await fetch(`${baseUrl}/api/tags`);
                    if (response.ok) {
                        const data = await response.json();
                        if (Array.isArray(data.models)) {
                            const models = data.models
                                .map((m: any) => {
                                    const id = m.name || m.model;
                                    const isVision = id.includes('vision') || id.includes('llava');
                                    const isThinking = id.includes('r1') || id.includes('reason') || id.includes('qwen2.5');
                                    const isTools = id.includes('qwen') || id.includes('llama3') || id.includes('mistral') || id.includes('r1');
                                    return {
                                        id: id,
                                        name: `${id} (Local Ollama)`,
                                        provider: AIProvider.OLLAMA,
                                        parameters: getParametersForModel(id, AIProvider.OLLAMA),
                                        contextWindow: '32k tokens',
                                        capabilities: {
                                            tools: isTools,
                                            structuredOutputs: true,
                                            vision: isVision,
                                            webSearch: false,
                                            thinking: isThinking,
                                        },
                                        supportsVision: isVision,
                                        supportsThinking: isThinking,
                                    };
                                });
                            
                            return models.length > 0 ? models : fallback;
                        }
                    }
                } catch {
                    return fallback;
                }
                return fallback;
            } else {
                const baseURLMap: Record<string, string> = {
                    [AIProvider.OPENAI]: 'https://api.openai.com/v1',
                    [AIProvider.MISTRAL]: 'https://api.mistral.ai/v1',
                    [AIProvider.OPENROUTER]: 'https://openrouter.ai/api/v1',
                    [AIProvider.ANTHROPIC]: 'https://api.anthropic.com/v1',
                    [AIProvider.GROQ]: 'https://api.groq.com/openai/v1',
                };
                
                const baseURL = baseURLMap[provider];
                if (!baseURL) return fallback;

                const headers: Record<string, string> = {
                    'Content-Type': 'application/json'
                };
                
                if (provider === AIProvider.ANTHROPIC) {
                    headers['x-api-key'] = apiKey;
                    headers['anthropic-version'] = '2023-06-01';
                    headers['anthropic-dangerous-direct-browser-access'] = 'true';
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

                    const idLower = id.toLowerCase();
                    const name = model.name || model.display_name || id;
                    
                    // Filter out non-chat / auxiliary models
                    if (
                        idLower.includes('embed') || 
                        idLower.includes('whisper') || 
                        idLower.includes('tts') || 
                        idLower.includes('dall-e') || 
                        idLower.includes('moderation') ||
                        idLower.includes('davinci') ||
                        idLower.includes('babbage')
                    ) {
                        return;
                    }

                    const supportsVision = idLower.includes('vision') || 
                                         idLower.includes('gpt-4o') || 
                                         idLower.includes('claude-3') || 
                                         idLower.includes('pixtral');
                    
                    const supportsThinking = idLower.includes('thinking') || 
                                           idLower.includes('o1') || 
                                           idLower.includes('o3') ||
                                           idLower.includes('deepseek-r1') ||
                                           idLower.includes('claude-3-7');

                    const supportsTools = !idLower.includes('instruct') || idLower.includes('qwen') || idLower.includes('claude');

                    const contextWindow = model.context_length ? `${Math.round(model.context_length / 1000)}k tokens` : undefined;

                    const modelConfig: AIModelConfig = {
                        id: id,
                        name: name,
                        provider: provider,
                        parameters: getParametersForModel(id, provider),
                        supportsVision,
                        supportsThinking,
                        contextWindow,
                        capabilities: {
                            tools: supportsTools,
                            structuredOutputs: true,
                            vision: supportsVision,
                            webSearch: false,
                            thinking: supportsThinking,
                        }
                    };

                    uniqueModelsMap.set(id, modelConfig);
                });

                const compliantList = Array.from(uniqueModelsMap.values())
                    .sort((a, b) => a.name.localeCompare(b.name));

                return compliantList.length > 0 ? compliantList : fallback;
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
        mcpSearchConfig?: McpSearchConfig;
        sessionTopic?: string;
        sessionContext?: string;
        sourceAssessments?: SourceAssessment[];
        sessionUrls?: string;
    }): AsyncIterableIterator<StreamEvent> {
        const { isInitialQuery, query, fullChatHistory, modelConfigParams, signal, customSystemPrompt, command } = options;

        let userPrompt = '';
        let reportType = ReportType.FULL_CHECK;
        let files: UploadedFile[] = [];
        let effectiveParams = { ...modelConfigParams };

        const rawQueryText = typeof query === 'string' ? query : (query.text || '');

        const contextOptions: SessionContextOptions = {
            sessionTopic: options.sessionTopic,
            sessionContext: options.sessionContext,
            sourceAssessments: options.sourceAssessments,
            sessionUrls: options.sessionUrls
        };

        // MCP Search & Contextual Relevance Grounding
        let mcpGroundingBlock = '';
        let mcpSources: GroundingChunk[] = [];
        const activeMcpConfig = options.mcpSearchConfig || this.mcpSearchConfig || DEFAULT_MCP_CONFIG;

        if (activeMcpConfig && activeMcpConfig.enabled && rawQueryText.trim().length > 0) {
            yield { 
                type: 'status', 
                message: `🔍 Searching live web via MCP (${activeMcpConfig.provider === 'exa' ? 'Exa Search' : 'MCP Tool'}) with contextual reranking...` 
            };
            try {
                const { results } = await McpSearchService.executeSearch(rawQueryText, activeMcpConfig, signal);
                if (results.length > 0) {
                    mcpSources = McpSearchService.toGroundingChunks(results);
                    yield { type: 'sources', sources: mcpSources };

                    const avgRel = Math.round(results.reduce((acc, r) => acc + (r.relevanceScore || 0.8), 0) / results.length * 100);
                    yield {
                        type: 'status',
                        message: `⚡ Reranked ${results.length} live sources (${avgRel}% contextual relevance). Grounding analysis with ${this.modelConfig.name}...`
                    };

                    mcpGroundingBlock = McpSearchService.formatResultsForPrompt(results, rawQueryText);
                }
            } catch (err: any) {
                if (signal?.aborted) return;
                console.warn('[streamSiftAnalysis] MCP Search note:', err);
            }
        }

        if (isInitialQuery && typeof query !== 'string') {
            userPrompt = constructFullPrompt(query.text || '', query.reportType, mcpGroundingBlock);
            reportType = query.reportType;
            files = query.files || [];
        } else {
            userPrompt = typeof query === 'string' ? query : (query.text || '');
            if (command) {
                userPrompt = formatSiftCommandPrompt(command, userPrompt, options.sessionTopic);
                if (typeof command !== 'string' && command.parameters) {
                    effectiveParams = { ...effectiveParams, ...command.parameters };
                }
            } else {
                userPrompt = `[Ongoing SIFT Investigation Follow-up]: ${userPrompt}`;
            }
            if (mcpGroundingBlock) {
                userPrompt = `${mcpGroundingBlock}\n\n${userPrompt}`;
            }
        }

        yield { type: 'status', message: 'Connecting to AI provider...' };

        try {
            if (this.provider === AIProvider.GOOGLE_GEMINI && this.geminiAi) {
                const systemPrompt = getSystemPromptForSelectedModel(this.modelConfig, customSystemPrompt, contextOptions);
                const { gemini: history } = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, AIProvider.GOOGLE_GEMINI, contextOptions);

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

                    // Enforce Google Search grounding for all Gemini provider calls
                    config.tools = [{ googleSearch: {} }];

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
                        let groundingSources: GroundingChunk[] = [...mcpSources];
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
                                    web: c.web ? { 
                                        uri: c.web.uri, 
                                        title: c.web.title,
                                        relevanceScore: 0.95
                                    } : undefined
                                })).filter(s => s.web);
                                
                                if (newSources.length > 0) {
                                    // Merge without duplicate URIs
                                    const existingUris = new Set(groundingSources.map(s => s.web?.uri));
                                    const filteredNew = newSources.filter(s => s.web && !existingUris.has(s.web.uri));
                                    groundingSources = [...groundingSources, ...filteredNew];
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
                const systemPrompt = getSystemPromptForSelectedModel(this.modelConfig, customSystemPrompt, contextOptions);
                const { openai: history } = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, this.provider, contextOptions);

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
                    temperature: Number(effectiveParams.temperature) || 0.7,
                    topP: Number(effectiveParams.topP) || 0.95,
                    topK: effectiveParams.topK ? Number(effectiveParams.topK) : undefined,
                    maxTokens: effectiveParams.maxOutputTokens 
                        ? Number(effectiveParams.maxOutputTokens) 
                        : (effectiveParams.max_tokens ? Number(effectiveParams.max_tokens) : undefined),
                    frequencyPenalty: effectiveParams.frequencyPenalty !== undefined ? Number(effectiveParams.frequencyPenalty) : undefined,
                    presencePenalty: effectiveParams.presencePenalty !== undefined ? Number(effectiveParams.presencePenalty) : undefined,
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
                    groundingSources: mcpSources,
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
