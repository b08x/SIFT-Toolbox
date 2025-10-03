
import { GoogleGenAI, Part, Content } from "@google/genai";
import OpenAI from 'openai';
import { generateText, streamText } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
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
} from '../types';
import { AVAILABLE_PROVIDERS_MODELS } from '../models.config';
import { getSystemPromptForSelectedModel, getTruncatedHistoryForApi } from '../utils/apiHelpers';
import { constructFullPrompt } from "../prompts";

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
    ) {
        this.provider = provider;
        const modelConfig = AVAILABLE_PROVIDERS_MODELS.find(m => m.id === modelId && m.provider === provider);
        if (!modelConfig) {
            throw new Error(`Model configuration for ${modelId} with provider ${provider} not found.`);
        }
        this.modelConfig = modelConfig;
        this.initializeClients();
    }

    private initializeClients() {
        const geminiKeyToUse = this.userApiKeys[AIProvider.GOOGLE_GEMINI];
        const openaiKeyToUse = this.userApiKeys[AIProvider.OPENAI];
        const openrouterKeyToUse = this.userApiKeys[AIProvider.OPENROUTER];
        
        if ((this.provider === AIProvider.GOOGLE_GEMINI || this.enableGeminiPreprocessing) && geminiKeyToUse) {
            this.geminiAi = new GoogleGenAI({ apiKey: geminiKeyToUse });
        }
        if (this.provider === AIProvider.OPENAI && openaiKeyToUse) {
            this.openaiClient = new OpenAI({ apiKey: openaiKeyToUse, dangerouslyAllowBrowser: true });
        }
        if (this.provider === AIProvider.OPENROUTER && openrouterKeyToUse) {
            this.openaiClient = new OpenAI({
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: openrouterKeyToUse,
                defaultHeaders: { 'HTTP-Referer': window.location.href, 'X-Title': 'SIFT Toolbox' },
                dangerouslyAllowBrowser: true,
            });
        }
    }
    
    public static async validateApiKey(provider: AIProvider, key: string): Promise<{ isValid: boolean, error?: string }> {
        if (!key.trim()) return { isValid: false, error: 'API Key cannot be empty.' };
        try {
            if (provider === AIProvider.GOOGLE_GEMINI) {
                const ai = new GoogleGenAI({ apiKey: key });
                await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'test' });
            } else if (provider === AIProvider.OPENAI) {
                const openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
                await openai.chat.completions.create({ model: 'gpt-3.5-turbo', messages: [{role: 'user', content: 'test'}], max_tokens: 5});
            } else if (provider === AIProvider.OPENROUTER) {
                const openrouter = new OpenAI({
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: key,
                    defaultHeaders: { 'HTTP-Referer': window.location.href, 'X-Title': 'SIFT Toolbox' },
                    dangerouslyAllowBrowser: true,
                });
                // Using a free model for validation as requested.
                await openrouter.chat.completions.create({ model: 'deepseek/deepseek-chat-v3-0324:free', messages: [{role: 'user', content: 'test'}], max_tokens: 5});
            } else if (provider === AIProvider.MISTRAL) {
                const mistralProvider = createMistral({ apiKey: key });
                // Fix: Per the type error, the `generateText` function expects `max_tokens` (snake_case) for the Mistral provider, not `maxTokens`.
                await generateText({
                    model: mistralProvider('mistral-small-latest'),
                    prompt: 'test',
                    max_tokens: 10,
                });
            }
            return { isValid: true };
        } catch (e: any) {
            const errorText = e.message || 'Validation failed.';
            let finalErrorText = `Validation failed: ${errorText}`; // Default message

            if (e instanceof OpenAI.APIError) {
                switch (e.status) {
                    case 401:
                        finalErrorText = "Authentication failed (401). Please ensure your API key is correct and active.";
                        break;
                    case 429:
                        if (provider === AIProvider.OPENROUTER) {
                            finalErrorText = "Validation failed due to rate limits (429). This is common with free models. If your key is correct, you can try again later or proceed with the session, but you may still encounter errors.";
                        } else {
                            finalErrorText = "Validation failed due to a rate limit error (429) from the provider. Please try again later or check your key's status.";
                        }
                        break;
                    case 404:
                        finalErrorText = `The validation model was not found (404). This may be a temporary issue with the provider. Details: ${errorText}`;
                        break;
                    default:
                        finalErrorText = `An API error occurred during validation (Status ${e.status}): ${errorText}`;
                        break;
                }
            } else if (errorText.includes('429') || errorText.toLowerCase().includes('resource_exhausted')) { // Fallback for non-APIError rate limit messages
                if (provider === AIProvider.OPENROUTER) {
                    finalErrorText = "Key validation failed with a 429 error from OpenRouter. The test model is likely rate-limited. If you are sure your key is correct, you can try to proceed, but you may still encounter errors. Consider trying again later or checking your OpenRouter account dashboard.";
                } else {
                    finalErrorText = "Could not validate key due to a rate limit error (429) from the provider. This can happen with free models. Please try again later or check your key's status on the provider's website.";
                }
            } else if (errorText.toLowerCase().includes('api key not valid') || errorText.toLowerCase().includes('permissiondenied')) {
                finalErrorText = "Authentication or permission error. Your API key might be invalid or lacks necessary permissions. Please check the key and your account status on the provider's website.";
            }
            return { isValid: false, error: finalErrorText };
        }
    }

    private async * runGeminiPreprocessing(query: OriginalQueryInfo, signal: AbortSignal): AsyncGenerator<StreamEvent | { type: 'preprocessed_sources', sources: GroundingChunk[] }> {
        if (!this.geminiAi) {
            yield { type: 'error', error: "Google Gemini API Key for preprocessing is not valid or client not initialized." };
            return;
        }
        yield { type: 'status', message: "Preprocessing: Gemini is searching for sources..." };
        const geminiPreprocessingModelId = 'gemini-2.5-flash';
        
        try {
            // Construct a simple prompt for source gathering.
            const promptParts: Part[] = [];
            let textForSourceGathering = `Find relevant and reliable web sources for the following query: "${query.text || 'Analyze the provided files.'}"`;
            
            if (query.files && query.files.length > 0) {
                textForSourceGathering += '\n\nThe following files were also uploaded for context:\n';
                const mediaParts: Part[] = [];
                for (const file of query.files) {
                    const [header, base64] = file.base64Data.split(',');
                    const mimeType = header.match(/:(.*?);/)?.[1];
                    
                    // Only pass images/videos to vision model
                    if (mimeType && (mimeType.startsWith('image/') || mimeType.startsWith('video/'))) {
                         mediaParts.push({ inlineData: { data: base64, mimeType } });
                         textForSourceGathering += `- ${file.name} (${mimeType})\n`;
                    } else {
                         textForSourceGathering += `- ${file.name} (${mimeType || 'unknown type'})\n`;
                    }
                }
                promptParts.push({ text: textForSourceGathering });
                promptParts.push(...mediaParts);
            } else {
                promptParts.push({ text: textForSourceGathering });
            }

            if (signal.aborted) throw new Error("Preprocessing stopped by user.");

            const response = await this.geminiAi.models.generateContent({
                model: geminiPreprocessingModelId,
                contents: { role: "user", parts: promptParts },
                config: { tools: [{ googleSearch: {} }] },
            });
            
            if (signal.aborted) throw new Error("Preprocessing stopped by user.");

            const groundingChunks: GroundingChunk[] = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((gc: any) => ({ web: gc.web })) || [];

            if (groundingChunks.length > 0) {
                yield { type: 'status', message: `Preprocessing: Found ${groundingChunks.length} sources.` };
                yield { type: 'preprocessed_sources', sources: groundingChunks };
            } else {
                yield { type: 'status', message: "Preprocessing: No specific web sources found. Proceeding with general knowledge." };
                yield { type: 'preprocessed_sources', sources: [] };
            }

        } catch (e) {
            const errorText = `Gemini preprocessing failed: ${e instanceof Error ? e.message : String(e)}`;
            yield { type: 'error', error: errorText };
        }
    }

    private constructPromptFromQuery(query: OriginalQueryInfo): { promptParts: Part[], textPrompt: string } {
        const promptParts: Part[] = [];
        let textPromptContent = constructFullPrompt(
            query.text || `Analyze the provided files.`,
            query.reportType
        );

        if (query.urls && query.urls.length > 0 && this.modelConfig.supportsUrlContext) {
            const urlsText = query.urls.join('\n');
            textPromptContent += `\n\nCRITICAL CONTEXT: The user has provided the following URLs for analysis. You MUST prioritize the content of these URLs as the primary source of information. Use your search tools to access these specific pages. Do not perform general web searches unless the provided URLs are insufficient or you are explicitly asked to broaden the search.\n\n---URL CONTEXT---\n${urlsText}\n---END URL CONTEXT---\n`;
        }

        if (query.files && query.files.length > 0) {
            textPromptContent += '\n\nThe following files were also uploaded for analysis:\n';
            const mediaParts: Part[] = [];
            for (const file of query.files) {
                const [header, base64] = file.base64Data.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1];
                
                if (mimeType && this.modelConfig.supportsVision && (mimeType.startsWith('image/') || mimeType.startsWith('video/'))) {
                     mediaParts.push({ inlineData: { data: base64, mimeType } });
                     textPromptContent += `- ${file.name} (${mimeType}) - Content provided directly to model.\n`;
                } else if (mimeType === 'text/plain') {
                    try {
                        const decodedText = atob(base64);
                        textPromptContent += `- ${file.name} (text/plain) - Content included below:\n---\n${decodedText}\n---\n`;
                    } catch (e) {
                        console.error(`Failed to decode base64 for ${file.name}`, e);
                        textPromptContent += `- ${file.name} (${mimeType}) - Failed to decode file content.\n`;
                    }
                } else {
                     textPromptContent += `- ${file.name} (${mimeType || 'unknown type'}) - Content not directly readable, please refer to it by name.\n`;
                }
            }
            promptParts.push({ text: textPromptContent });
            promptParts.push(...mediaParts);
        } else {
            promptParts.push({ text: textPromptContent });
        }
        
        return { promptParts, textPrompt: textPromptContent };
    }

    async * streamSiftAnalysis(params: {
        isInitialQuery: boolean;
        query: OriginalQueryInfo | string;
        fullChatHistory: ChatMessage[];
        modelConfigParams: ConfigurableParams;
        signal: AbortSignal;
        systemPromptOverride?: string;
        originalQueryForRestart?: OriginalQueryInfo | null;
        command?: 'another round' | 'read the room' | 'generate_context_report' | 'generate_community_note' | 'web_search';
        cacheKey?: string;
        customSystemPrompt?: string;
    }): AsyncGenerator<StreamEvent> {
        try {
            const { isInitialQuery, query, fullChatHistory, modelConfigParams, signal, systemPromptOverride, originalQueryForRestart, command, cacheKey, customSystemPrompt } = params;

            let mainExecutionPrompt: string;
            let promptPartsForApi: Part[] = [];
            let currentProviderForMainExecution = this.provider;
            let finalReportText = '';
            let finalGroundingChunks: GroundingChunk[] = [];
            let effectiveReportTypeForPrompt: ReportType | undefined = undefined;
            const systemPrompt = systemPromptOverride || getSystemPromptForSelectedModel(this.modelConfig, customSystemPrompt);

            if (isInitialQuery) {
                const initialQuery = query as OriginalQueryInfo;
                effectiveReportTypeForPrompt = initialQuery.reportType;

                if (!this.modelConfig.supportsGoogleSearch && this.enableGeminiPreprocessing) {
                    let preprocessedSources: GroundingChunk[] = [];
                    // The internal event type for the generator
                    type PreprocessingEvent = StreamEvent | { type: 'preprocessed_sources', sources: GroundingChunk[] };
                    const preprocessingStream: AsyncGenerator<PreprocessingEvent> = this.runGeminiPreprocessing(initialQuery, signal);
                    
                    for await (const event of preprocessingStream) {
                        if (event.type === 'preprocessed_sources') {
                            preprocessedSources = event.sources;
                            finalGroundingChunks = event.sources; // Store for the final report event
                            if (event.sources.length > 0) {
                                yield { type: 'sources', sources: event.sources }; // Pass sources to UI immediately
                            }
                        } else {
                            yield event; // Pass through status/error events
                            if (event.type === 'error') return;
                        }
                    }
                    
                    // New status update after Gemini search is complete
                    yield { type: 'status', message: `Main Analysis: ${this.modelConfig.name} is analyzing the query with ${preprocessedSources.length > 0 ? 'grounded sources' : 'its general knowledge'}...` };

                    const { promptParts: originalPromptParts, textPrompt: originalTextPrompt } = this.constructPromptFromQuery(initialQuery);
                    
                    let sourcesText = '';
                    if (preprocessedSources.length > 0) {
                        const sourcesList = preprocessedSources
                            .filter(s => s.web?.uri)
                            .map(s => `- [${s.web?.title || 'Untitled'}](${s.web?.uri})`)
                            .join('\n');
                        sourcesText = `\n\nYou MUST use the following web sources as the primary basis for your analysis. Do not perform your own web search. If the sources are irrelevant, state that and proceed with your general knowledge, but you must first acknowledge them.\n\n---GROUNDING SOURCES---\n${sourcesList}\n---END GROUNDING SOURCES---\n`;
                    }

                    mainExecutionPrompt = originalTextPrompt + sourcesText;
                    
                    // Reconstruct prompt parts for OpenRouter, especially for multimodal queries
                    promptPartsForApi = [];
                    const textPart = { text: mainExecutionPrompt };
                    const mediaParts = originalPromptParts.filter(p => 'inlineData' in p);
                    promptPartsForApi.push(textPart, ...mediaParts);

                } else { // The original path for Gemini or other models with search, or when preprocessing is off
                    const { promptParts, textPrompt } = this.constructPromptFromQuery(initialQuery);
                    promptPartsForApi = promptParts;
                    mainExecutionPrompt = textPrompt;
                }
            } else { // Follow-up message
                 let promptForThisTurn = query as string;
                 if (command === 'generate_context_report' || command === 'generate_community_note') {
                    const lastAiMessageContent = fullChatHistory.filter(m => m.sender === 'ai' && !m.isError && m.text && m.text.length > 0).pop()?.text || originalQueryForRestart?.text || "the previous discussion";
                    const baseText = `Based on the SIFT analysis of "${(lastAiMessageContent.substring(0, 200))}...", please generate a ${command === 'generate_context_report' ? 'Context Report' : 'Community Note'}.`;
                    effectiveReportTypeForPrompt = command === 'generate_context_report' ? ReportType.CONTEXT_REPORT : ReportType.COMMUNITY_NOTE;
                    promptForThisTurn = constructFullPrompt(baseText, effectiveReportTypeForPrompt);
                 } else if (command === 'another round' || command === 'read the room') {
                    const originalQueryContext = originalQueryForRestart?.text ? `The original query was about: "${originalQueryForRestart.text.substring(0, 150)}..."` : "The original query involved uploaded files.";
                    promptForThisTurn = `Based on the previous SIFT analysis and our conversation, please execute the '${command}' command. ${originalQueryContext}. Refer to the full conversation history to find additional sources or summarize opinion as specified in the system prompt instructions.`;
                 } else if (command === 'web_search') {
                    promptForThisTurn = `Please perform a web search to provide the most current and relevant information for the following query. Summarize your findings and cite your sources. User Query: "${query as string}"`;
                 }
                 mainExecutionPrompt = promptForThisTurn;
                 promptPartsForApi.push({ text: mainExecutionPrompt });
            }

            yield { type: 'status', message: 'Main Analysis: Preparing request...' };

            if (currentProviderForMainExecution === AIProvider.GOOGLE_GEMINI) {
                if (!this.geminiAi) throw new Error("Gemini client not initialized.");
                const history = getTruncatedHistoryForApi(fullChatHistory, systemPrompt, AIProvider.GOOGLE_GEMINI).gemini || [];

                const geminiConfig: any = { ...modelConfigParams };
                if (geminiConfig.thinkingBudget) {
                    geminiConfig.thinkingConfig = { thinkingBudget: geminiConfig.thinkingBudget as number };
                    delete geminiConfig.thinkingBudget;
                }
                if (geminiConfig.maxOutputTokens && geminiConfig.thinkingConfig) {
                    if ((geminiConfig.thinkingConfig.thinkingBudget as number) >= (geminiConfig.maxOutputTokens as number)) {
                        geminiConfig.thinkingConfig.thinkingBudget = Math.floor((geminiConfig.maxOutputTokens as number) * 0.5);
                    }
                }

                const geminiChat = this.geminiAi.chats.create({
                    model: this.modelConfig.id,
                    config: { ...geminiConfig, tools: this.modelConfig.supportsGoogleSearch ? [{ googleSearch: {} }] : undefined, systemInstruction: systemPrompt },
                    history,
                });

                if (this.modelConfig.supportsGoogleSearch) yield { type: 'status', message: 'Main Analysis: Executing web searches...' };
                const stream = await geminiChat.sendMessageStream({ message: promptPartsForApi });
                yield { type: 'status', message: 'Main Analysis: Analyzing and synthesizing information...' };
                for await (const chunk of stream) {
                    if (signal.aborted) break;
                    yield { type: 'chunk', text: chunk.text };
                    finalReportText += chunk.text;
                    if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                        const newChunks = chunk.candidates[0].groundingMetadata.groundingChunks.map((gc: any) => ({ web: gc.web }));
                        finalGroundingChunks = newChunks;
                        yield { type: 'sources', sources: newChunks };
                    }
                }
            } else if ([AIProvider.OPENAI, AIProvider.OPENROUTER, AIProvider.MISTRAL].includes(currentProviderForMainExecution)) {
                yield { type: 'status', message: `Main Analysis: Sending request to ${this.modelConfig.name}...` };
                
                // Get history *before* the current message, then we'lladd the full prompt as the last message.
                const historyContext = getTruncatedHistoryForApi(fullChatHistory.slice(0, -1), systemPrompt, this.provider).openai || [];

                if (this.provider === AIProvider.MISTRAL) {
                    const mistralApiKey = this.userApiKeys[AIProvider.MISTRAL];
                    if (!mistralApiKey) {
                        throw new Error('Mistral API key not found');
                    }
                    const mistralProvider = createMistral({ apiKey: mistralApiKey });
                    const mistralModel = mistralProvider(this.modelConfig.id as any);

                    const systemPromptForApi = historyContext.find(m => m.role === 'system')?.content as string;
                    const messagesForApi = historyContext.filter(m => m.role !== 'system').map(m => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content as string
                    }));
                    messagesForApi.push({ role: 'user', content: mainExecutionPrompt });

                    // Fix: Per the type error, the `streamText` function expects `max_tokens` (snake_case) for the Mistral provider, not `maxTokens`.
                    const { textStream } = await streamText({
                        model: mistralModel,
                        system: systemPromptForApi,
                        messages: messagesForApi,
                        abortSignal: signal,
                        temperature: modelConfigParams.temperature as number,
                        topP: modelConfigParams.topP as number,
                        max_tokens: modelConfigParams.max_tokens as number,
                    });
                    
                    yield { type: 'status', message: 'Main Analysis: Analyzing and synthesizing information...' };
                    if (textStream) {
                        for await (const textPart of textStream) {
                            if (signal.aborted) break;
                            yield { type: 'chunk', text: textPart };
                            finalReportText += textPart;
                        }
                    }
                } else { // OpenAI or OpenRouter
                    const client = this.openaiClient;
                    if (!client) throw new Error(`${this.provider} client not initialized.`);

                    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: mainExecutionPrompt }];
                    if (isInitialQuery && this.modelConfig.supportsVision) {
                        const initialQuery = query as OriginalQueryInfo;
                        initialQuery.files?.forEach(file => {
                            if (file.type.startsWith('image/')) {
                                userContent.push({ type: 'image_url', image_url: { url: file.base64Data, detail: 'auto' }});
                            }
                        });
                    }
                    
                    const messagesForApi: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                        ...historyContext,
                        { role: 'user', content: userContent }
                    ];

                    const stream = await client.chat.completions.create({
                        model: this.modelConfig.id,
                        messages: messagesForApi,
                        stream: true,
                        temperature: modelConfigParams.temperature as number,
                        top_p: modelConfigParams.topP as number,
                        max_tokens: modelConfigParams.max_tokens as number,
                    });

                    yield { type: 'status', message: 'Main Analysis: Analyzing and synthesizing information...' };
                    for await (const chunk of stream) {
                        if (signal.aborted) break;
                        const content = chunk.choices[0]?.delta?.content || "";
                        yield { type: 'chunk', text: content };
                        finalReportText += content;
                    }
                }
            }

            if(signal.aborted) finalReportText += "\n\nGeneration stopped by user.";

            yield {
                type: 'final',
                fullText: finalReportText,
                modelId: this.modelConfig.id,
                groundingSources: finalGroundingChunks,
                isInitialSIFTReport: isInitialQuery || !!effectiveReportTypeForPrompt,
                originalQueryReportType: effectiveReportTypeForPrompt,
                cacheKey: isInitialQuery ? cacheKey : undefined,
            };

        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') {
                 yield { type: 'status', message: 'Generation cancelled by user.' };
            } else {
                const errorText = e instanceof Error ? e.message : String(e);
                let finalErrorText = `An unexpected error occurred: ${errorText}`; // Default with more context
                console.error("Agentic API call failed:", e);
                
                // Specific check for OpenAI/OpenRouter API errors
                if (e instanceof OpenAI.APIError) {
                    switch (e.status) {
                        case 401:
                            finalErrorText = "Authentication failed (401). Your API key is invalid, expired, or has been revoked. Please verify your key in Settings.";
                            break;
                        case 403:
                            finalErrorText = `Permission denied (403). Your API key may not have permission to use the model "${this.modelConfig.name}". Please check your account plan and permissions on the provider's website.`;
                            break;
                        case 404:
                            finalErrorText = `Model not found (404). The selected model "${this.modelConfig.name}" is not available with your API key. It may be deprecated or require special access. Please try another model.`;
                            break;
                        case 429:
                            if (this.provider === AIProvider.OPENROUTER) {
                                finalErrorText = `OpenRouter returned a 429 error. This usually means the selected model is rate-limited or temporarily unavailable. This is common for free models. Please try again in a few minutes, choose a different model in Settings, or check your OpenRouter account for usage limits.`;
                            } else {
                                finalErrorText = "The model provider returned a rate limit error (429). This can happen with free models under heavy load or if usage limits are exceeded. Please try again in a few minutes, select a different model in Settings, or check your API key's usage on the provider's website.";
                            }
                            break;
                        default:
                            if (e.status >= 500) {
                                finalErrorText = `The model provider encountered a server error (${e.status}). This is likely a temporary issue on their end. Please try again in a few minutes.`;
                            } else {
                                finalErrorText = `An unexpected API error occurred (Status ${e.status}): ${e.message}`;
                            }
                            break;
                    }
                } 
                // General checks for common error strings from any provider, including Gemini
                else if (errorText.includes('429') || errorText.toLowerCase().includes('resource_exhausted')) {
                    finalErrorText = "Rate limit reached. You may have exceeded your usage quota or sent requests too quickly. Please check your account on the provider's website and try again later.";
                }
                else if (errorText.toLowerCase().includes('api key not valid') || errorText.toLowerCase().includes('permissiondenied')) {
                     finalErrorText = "Authentication or permission error. Your API key might be invalid or lacks the necessary permissions for this model. Please check your key in Settings and on the provider's website.";
                } else if (errorText.includes('400') && errorText.toLowerCase().includes('bad request')) {
                    finalErrorText = `Bad Request (400). The model could not process the request. This can be caused by an invalid model parameter, an unsupported file type, or a prompt that violates safety policies. Details: ${errorText}`;
                }
        
                yield { type: 'error', error: finalErrorText };
            }
        }
    }
}
