import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { marked } from 'marked';

import { ChatInterface } from './components/ChatInterface.tsx';
import { ErrorAlert } from './components/ErrorAlert.tsx';
import { ExportAndSourcesMenu } from './components/SessionToolsMenu.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { AgenticApiService } from './services/agenticApiService.ts';
import { SourceAssessmentModal } from './components/SourceAssessmentModal.tsx';
import { SessionConfigurationView } from './components/SessionConfigurationView.tsx';
import { AboutContent } from './components/LandingPage.tsx';
import { LiveConversationView } from './components/LiveConversationView.tsx';
import * as SessionManager from './utils/sessionManager.ts';
import { generateCacheKey, getCachedSiftReport, setSiftReportCache, SIFT_PROMPT_VERSION } from './utils/cache.ts';
import { useAppStore } from './store.ts';


import { 
  ReportType, 
  ChatMessage, 
  OriginalQueryInfo, 
  AIProvider, 
  AIModelConfig, 
  ConfigurableParams,
  CurrentSiftQueryDetails,
  UploadedFile,
  StreamEvent,
  SourceAssessment,
  SavedSessionState,
  CacheableQueryDetails,
  CachedSiftReport
} from './types.ts';
import { REPORT_SYSTEM_PROMPT, REPORT_GENERATION_PROMPT } from './prompts.ts';
import { INITIAL_MODELS_CONFIG } from './models.config.ts';
import { downloadMarkdown, downloadPdfWithBrowserPrint, downloadHtml } from './utils/download.ts';
import { parseSourceAssessmentsFromMarkdown, correctRedirectLinksInMarkdown, checkLinkStatus, transformMarkdownForSubstack } from './utils/apiHelpers.ts';

// Helper function to parse rating string into a comparable number
const getNumericRating = (ratingStr: string): number => {
    if (!ratingStr) return 0;
    // Handles ranges like "4-5" or "4–5" by taking the higher number for sorting.
    const parts = ratingStr.split(/[-–]/);
    const lastPart = parts[parts.length - 1]?.trim();
    const numericPart = parseFloat(lastPart);
    return isNaN(numericPart) ? 0 : numericPart;
};


const AppInternal = (): React.ReactElement => {
  const [savedSessionExists, setSavedSessionExists] = useState<boolean>(false);
  
  // Layout State
  const [mainView, setMainView] = useState<'config' | 'chat'>('config');
  const [configTab, setConfigTab] = useState<'config' | 'about'>('config');
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isLiveConversationOpen, setIsLiveConversationOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Zustand Store Integration
  const store = useAppStore();

  // Chat State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [llmStatusMessage, setLlmStatusMessage] = useState<string | null>(null);

  // Session Save State
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  
  const [selectedSourceForModal, setSelectedSourceForModal] = useState<SourceAssessment | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sourceListContainerRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Check for saved session on initial load
  useEffect(() => {
    setSavedSessionExists(SessionManager.hasSavedSession());
  }, []);
  
  const isApiKeyValid = useMemo(() => {
      if (store.enableGeminiPreprocessing && store.selectedProviderKey !== AIProvider.GOOGLE_GEMINI) {
          return store.apiKeyValidation[store.selectedProviderKey] === 'valid' && store.apiKeyValidation[AIProvider.GOOGLE_GEMINI] === 'valid';
      }
      return store.apiKeyValidation[store.selectedProviderKey] === 'valid';
  }, [store.apiKeyValidation, store.selectedProviderKey, store.enableGeminiPreprocessing]);

  // Effect to auto-open settings modal if key is invalid on config screen
  useEffect(() => {
      if (mainView === 'config' && !isApiKeyValid && store.chatMessages.length === 0) {
          setIsSettingsModalOpen(true);
      }
  }, [isApiKeyValid, mainView, store.chatMessages.length]);

  // Effect to handle clicks outside of the tools menu to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (
            toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node) &&
            toolsMenuButtonRef.current && !toolsMenuButtonRef.current.contains(event.target as Node)
        ) {
            setIsToolsMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [toolsMenuRef, toolsMenuButtonRef]);


  const checkSourceLinks = useCallback(async (assessmentsToCheck: SourceAssessment[]) => {
    if (assessmentsToCheck.length === 0) return;

    // Immediately mark the ones we are about to check as 'checking' in the UI
    const checkingAssessments = assessmentsToCheck.map(a => ({ ...a, linkValidationStatus: 'checking' as const }));
    store.updateSourceAssessments(checkingAssessments);

    const checkedAssessmentsPromises = assessmentsToCheck.map(async (assessment) => {
        const status = await checkLinkStatus(assessment.url);
        return { ...assessment, linkValidationStatus: status };
    });

    const results = await Promise.all(checkedAssessmentsPromises);
    store.updateSourceAssessments(results);
  }, [store]);

  const performSave = useCallback(() => {
    if (isLoading || store.chatMessages.length === 0) return;

    setSaveStatus('saving');
    setTimeout(() => {
        try {
            const { chatMessages, currentSiftQueryDetails, originalQueryForRestart, sourceAssessments, selectedProviderKey, selectedModelId, modelConfigParams, enableGeminiPreprocessing, userApiKeys, apiKeyValidation, customSystemPrompt } = useAppStore.getState();
            const sessionState: SavedSessionState = {
                chatMessages, currentSiftQueryDetails, originalQueryForRestart, sourceAssessments, selectedProviderKey,
                selectedModelId, modelConfigParams, enableGeminiPreprocessing, userApiKeys, apiKeyValidation, customSystemPrompt,
            };
            SessionManager.saveSession(sessionState);
            setSavedSessionExists(true);
            setSaveStatus('saved');
            setLastSaveTime(new Date());
        } catch (e) {
            console.error("Failed to save session:", e);
            setSaveStatus('error');
        }
    }, 200);
  }, [isLoading, store.chatMessages.length]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!isLoading && store.chatMessages.length > 0) {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = window.setTimeout(performSave, 2000);
    }

    return () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
    };
  }, [performSave, isLoading, store.chatMessages.length]);

  const handleManualSave = () => {
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }
      performSave();
  };

  const handleRestoreSession = () => {
    const session = SessionManager.loadSession();
    if (session) {
      // Mark all restored assessments as unchecked so they get validated on load
      const assessmentsToLoad = session.sourceAssessments.map(a => ({...a, linkValidationStatus: 'unchecked' as const}));
      
      const sessionTopic = session.currentSiftQueryDetails?.sessionTopic || '';
      const sessionContext = session.currentSiftQueryDetails?.sessionContext || '';
      const sessionFiles = session.currentSiftQueryDetails?.sessionFiles || [];
      const sessionUrls = session.currentSiftQueryDetails?.sessionUrls.join('\n') || '';

      store.setInitialState({ ...session, sourceAssessments: assessmentsToLoad, sessionTopic, sessionContext, sessionFiles, sessionUrls });

      if (assessmentsToLoad.length > 0) {
          checkSourceLinks(assessmentsToLoad);
      }
      
      setMainView('chat');
      setLastSaveTime(new Date());
      setSaveStatus('saved');
    } else {
      alert("Could not find or load the saved session.");
    }
  };

  const [availableModels, setAvailableModels] = useState<AIModelConfig[]>(INITIAL_MODELS_CONFIG);
  
  const getSelectedModelConfig = useCallback((): AIModelConfig | undefined => {
    return availableModels.find(m => m.id === store.selectedModelId && m.provider === store.selectedProviderKey);
  }, [store.selectedModelId, store.selectedProviderKey, availableModels]);
  
  const handleNewSession = () => {
    store.resetSession();
    setIsLoading(false);
    setError(null);
    setLlmStatusMessage(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSelectedSourceForModal(null);
    SessionManager.clearSession();
    setSavedSessionExists(false);
    setSaveStatus('idle');
    setLastSaveTime(null);
    setMainView('config');
    setConfigTab('config');
  };

  useEffect(() => {
    const currentModelConfig = getSelectedModelConfig();
    if (currentModelConfig) {
      const initialParams: ConfigurableParams = {};
      currentModelConfig.parameters.forEach(param => {
        initialParams[param.key] = param.defaultValue;
      });
      store.setModelConfigParams(initialParams);
    }
  }, [store.selectedModelId, store.selectedProviderKey, getSelectedModelConfig, store.setModelConfigParams]);

  const handleModelsUpdate = useCallback((provider: AIProvider, newModels: AIModelConfig[]) => {
      setAvailableModels(prev => {
          const otherProviderModels = prev.filter(m => m.provider !== provider);
          return [...otherProviderModels, ...newModels];
      });

      if (store.selectedProviderKey === provider) {
          const isCurrentModelStillAvailable = newModels.some(m => m.id === store.selectedModelId);
          if ((!isCurrentModelStillAvailable || !store.selectedModelId) && newModels.length > 0) {
              store.setSelectedModelId(newModels[0].id);
          }
      }
  }, [store.selectedProviderKey, store.selectedModelId, store.setSelectedModelId]);

  const processStreamEvents = async (stream: AsyncGenerator<StreamEvent>, aiMessageId: string) => {
    let accumulatedText = '';
    let inThinkBlock = false;
    let accumulatedReasoning = '';
    let textBufferForUiUpdate = '';
    let lastUiUpdate = Date.now();
    const UI_UPDATE_INTERVAL = 100;

    const flushUiBuffer = () => {
        if (textBufferForUiUpdate.length > 0) {
            accumulatedText += textBufferForUiUpdate;
            store.updateChatMessage(aiMessageId, { text: accumulatedText });
            textBufferForUiUpdate = '';
        }
        lastUiUpdate = Date.now();
    };

    for await (const event of stream) {
      if (abortControllerRef.current?.signal.aborted) {
        setLlmStatusMessage("Generation stopped by user.");
        break;
      }
      switch (event.type) {
        case 'status':
          setLlmStatusMessage(event.message);
          break;
        case 'chunk':
          let streamBuffer = event.text;
          while (streamBuffer.length > 0) {
              if (inThinkBlock) {
                  const endTagIndex = streamBuffer.indexOf('</think>');
                  if (endTagIndex !== -1) {
                      accumulatedReasoning += streamBuffer.substring(0, endTagIndex);
                      streamBuffer = streamBuffer.substring(endTagIndex + '</think>'.length);
                      inThinkBlock = false;
                  } else {
                      accumulatedReasoning += streamBuffer;
                      streamBuffer = '';
                  }
              } else {
                  const startTagIndex = streamBuffer.indexOf('<think>');
                  if (startTagIndex !== -1) {
                      textBufferForUiUpdate += streamBuffer.substring(0, startTagIndex);
                      streamBuffer = streamBuffer.substring(startTagIndex + '<think>'.length);
                      inThinkBlock = true;
                  } else {
                      textBufferForUiUpdate += streamBuffer;
                      streamBuffer = '';
                  }
              }
          }
          if (Date.now() - lastUiUpdate > UI_UPDATE_INTERVAL) {
            flushUiBuffer();
          }
          break;
        case 'sources':
          store.updateChatMessage(aiMessageId, { groundingSources: event.sources });
          break;
        case 'error':
          setError(event.error);
          setLlmStatusMessage(`Error: ${event.error}`);
          store.updateChatMessage(aiMessageId, { text: `Error: ${event.error}`, isLoading: false, isError: true });
          return;
        case 'final':
          flushUiBuffer();
          if (event.cacheKey && event.fullText) {
              const reportToCache: CachedSiftReport = {
                  text: event.fullText, groundingSources: event.groundingSources, modelId: event.modelId,
                  originalQueryReportType: event.originalQueryReportType || ReportType.FULL_CHECK, cachedAt: Date.now()
              };
              setSiftReportCache(event.cacheKey, reportToCache);
          }
          let textForReport = accumulatedText;
          if (event.groundingSources && event.groundingSources.length > 0) {
              textForReport = correctRedirectLinksInMarkdown(textForReport, event.groundingSources);
          }
          const newAssessments = parseSourceAssessmentsFromMarkdown(textForReport);
          if (newAssessments.length > 0) {
              const prevAssessments = useAppStore.getState().sourceAssessments;
              const updatedAssessmentsMap = new Map<string, Omit<SourceAssessment, 'index'>>();
              prevAssessments.forEach(a => updatedAssessmentsMap.set(a.url, a));
              newAssessments.forEach(newA => {
                  const existing = updatedAssessmentsMap.get(newA.url);
                  updatedAssessmentsMap.set(newA.url, { ...existing, ...newA });
              });
              const sortedAssessments = Array.from(updatedAssessmentsMap.values()).sort((a, b) => getNumericRating(b.rating) - getNumericRating(a.rating));
              const finalAssessments = sortedAssessments.map((assessment, index) => {
                  const prevAssessment = prevAssessments.find(pa => pa.url === assessment.url);
                  return { ...assessment, index: index + 1, linkValidationStatus: prevAssessment?.linkValidationStatus || 'unchecked' };
              });
              const assessmentsThatNeedChecking = finalAssessments.filter(fa => fa.linkValidationStatus === 'unchecked');
              if (assessmentsThatNeedChecking.length > 0) checkSourceLinks(assessmentsThatNeedChecking);
              store.setSourceAssessments(finalAssessments);
          }
          store.updateChatMessage(aiMessageId, {
            text: textForReport, isLoading: false, groundingSources: event.groundingSources,
            isInitialSIFTReport: event.isInitialSIFTReport, originalQueryReportType: event.originalQueryReportType,
            modelId: event.modelId, reasoning: accumulatedReasoning.trim(),
          });
          setLlmStatusMessage("Response complete.");
          break;
      }
    }
    flushUiBuffer();
  };

  const handleStartSession = async () => {
    setError(null);
    setLlmStatusMessage("Initializing SIFT session...");
    
    const currentModelConfig = getSelectedModelConfig();
    if (!currentModelConfig) {
      setError("Selected model configuration is not available.");
      return;
    }

    const { sessionTopic, sessionContext, sessionFiles, sessionUrls } = store;
    const initialPrompt = `New SIFT Session Started.
**Topic/Subject:** ${sessionTopic || "Not specified"}
**Additional Context/Instructions:** ${sessionContext || "None"}
${sessionFiles.length > 0 ? `**Attached Files (${sessionFiles.length}):** ${sessionFiles.map(f => f.name).join(', ')}` : ''}
${sessionUrls.trim().length > 0 ? `**Context URLs:**\n${sessionUrls.trim()}` : ''}`;

    const initialUserMessageText = `Let's begin the SIFT analysis. My topic is "${sessionTopic}" with the following context: "${sessionContext}". Please provide an initial analysis or plan of action based on this, considering any attached files or URLs.`;
    const urlList = sessionUrls.trim() ? sessionUrls.trim().split('\n').filter(u => u.trim() !== '') : [];
    
    const originalQuery: OriginalQueryInfo = { text: initialUserMessageText, reportType: ReportType.FULL_CHECK, files: sessionFiles, urls: urlList };
    if (!sessionTopic.trim()) {
      setError("Please provide a Topic/Subject to start the session.");
      return;
    }
    
    setIsLoading(true); 
    setMainView('chat');

    const userMessage: ChatMessage = { id: uuidv4(), sender: 'user', text: initialPrompt, timestamp: new Date(), originalQuery: originalQuery, uploadedFiles: sessionFiles };
    store.setChatMessages([userMessage]);
    
    store.setCurrentSiftQueryDetails({ sessionTopic, sessionContext, sessionFiles, sessionUrls: urlList });
    store.setOriginalQueryForRestart(originalQuery); 
    store.setSourceAssessments([]);

    const cacheableDetails: CacheableQueryDetails = {
        text: originalQuery.text, files: sessionFiles.map(f => ({ base64Data: f.base64Data, name: f.name })),
        reportType: originalQuery.reportType, provider: store.selectedProviderKey, modelId: store.selectedModelId,
        modelConfigParams: store.modelConfigParams, siftPromptVersion: SIFT_PROMPT_VERSION,
    };
    const cacheKey = await generateCacheKey(cacheableDetails);
    const cachedReport = getCachedSiftReport(cacheKey);

    if (cachedReport) {
        setLlmStatusMessage("Loaded report from local cache.");
        const aiMessage: ChatMessage = {
            id: uuidv4(), sender: 'ai', text: cachedReport.text, timestamp: new Date(), isLoading: false,
            groundingSources: cachedReport.groundingSources, isInitialSIFTReport: true,
            originalQueryReportType: cachedReport.originalQueryReportType, modelId: cachedReport.modelId, isFromCache: true,
        };
        store.addChatMessage(aiMessage);
        const assessmentsFromCache = parseSourceAssessmentsFromMarkdown(cachedReport.text).map((a, index) => ({ ...a, index: index + 1, linkValidationStatus: 'unchecked' as const }));
        store.setSourceAssessments(assessmentsFromCache);
        if (assessmentsFromCache.length > 0) checkSourceLinks(assessmentsFromCache);
        setIsLoading(false);
        return;
    }

    abortControllerRef.current = new AbortController();
    const aiMessageId = uuidv4();
    store.addChatMessage({ id: aiMessageId, sender: 'ai', text: '', isLoading: true, timestamp: new Date(), modelId: store.selectedModelId });

    try {
        const service = new AgenticApiService(store.selectedProviderKey, store.selectedModelId, store.userApiKeys, store.enableGeminiPreprocessing, availableModels);
        const stream = service.streamSiftAnalysis({
            isInitialQuery: true, query: originalQuery, fullChatHistory: [userMessage], modelConfigParams: store.modelConfigParams,
            signal: abortControllerRef.current.signal, customSystemPrompt: store.customSystemPrompt, cacheKey,
        });
        await processStreamEvents(stream, aiMessageId);
    } catch (e) {
      const errorText = `Failed to start analysis: ${e instanceof Error ? e.message : String(e)}`;
      setError(errorText);
      setLlmStatusMessage(errorText);
      store.updateChatMessage(aiMessageId, { text: errorText, isLoading: false, isError: true });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };


  const handleSendChatMessage = async (messageText: string, command?: 'another round' | 'read the room' | 'generate_context_report' | 'generate_community_note' | 'web_search' | 'trace_claim' | 'discourse_map' | 'explain_like_im_in_high_school') => {
    if (isLoading) return;
    setError(null);
    setIsLoading(true);

    const userMessage: ChatMessage = { id: uuidv4(), sender: 'user', text: messageText, timestamp: new Date() };
    store.addChatMessage(userMessage);
    const updatedChatMessages = [...useAppStore.getState().chatMessages];
    
    const aiMessageId = uuidv4();
    store.addChatMessage({ id: aiMessageId, sender: 'ai', text: '', isLoading: true, timestamp: new Date(), modelId: store.selectedModelId });
    
    abortControllerRef.current = new AbortController();

    try {
        const service = new AgenticApiService(store.selectedProviderKey, store.selectedModelId, store.userApiKeys, store.enableGeminiPreprocessing, availableModels);
        const stream = service.streamSiftAnalysis({
            isInitialQuery: false, query: messageText, fullChatHistory: updatedChatMessages, modelConfigParams: store.modelConfigParams,
            signal: abortControllerRef.current.signal, originalQueryForRestart: store.originalQueryForRestart,
            command, customSystemPrompt: store.customSystemPrompt,
        });
        await processStreamEvents(stream, aiMessageId);
    } catch (e) {
      const errorText = `Failed to send message: ${e instanceof Error ? e.message : String(e)}`;
      setError(errorText);
      setLlmStatusMessage(errorText);
      store.updateChatMessage(aiMessageId, { text: errorText, isLoading: false, isError: true });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };
  
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setLlmStatusMessage(prev => prev && !prev.includes("Stopped by user") ? prev + " (Stopped by user)" : "Generation stopped by user.");
    useAppStore.getState().chatMessages.forEach(msg => {
        if (msg.isLoading) {
            store.updateChatMessage(msg.id, { text: msg.text + "\n\nGeneration stopped by user.", isLoading: false, isError: false });
        }
    });
  };

  const handleRestartGeneration = () => {
    if (store.originalQueryForRestart) {
      const firstUserMessage = store.chatMessages.find(msg => msg.sender === 'user' && msg.originalQuery);
      if (firstUserMessage) {
        store.setChatMessages([firstUserMessage]); 
        store.setSourceAssessments([]);
        const aiMessageId = uuidv4();
        store.addChatMessage({ id: aiMessageId, sender: 'ai', text: '', isLoading: true, timestamp: new Date(), modelId: store.selectedModelId });
        abortControllerRef.current = new AbortController();
        setIsLoading(true);
        try {
            const service = new AgenticApiService(store.selectedProviderKey, store.selectedModelId, store.userApiKeys, store.enableGeminiPreprocessing, availableModels);
            const stream = service.streamSiftAnalysis({
                isInitialQuery: true, query: store.originalQueryForRestart, fullChatHistory: [firstUserMessage],
                modelConfigParams: store.modelConfigParams, signal: abortControllerRef.current.signal, customSystemPrompt: store.customSystemPrompt,
            });
            processStreamEvents(stream, aiMessageId).finally(() => {
                setIsLoading(false);
                abortControllerRef.current = null;
            });
        } catch (e) {
            const errorText = `Failed to restart analysis: ${e instanceof Error ? e.message : String(e)}`;
            setError(errorText);
            setLlmStatusMessage(errorText);
            store.updateChatMessage(aiMessageId, { text: errorText, isLoading: false, isError: true });
            setIsLoading(false);
        }
      }
    }
  };

  const handleExportSources = () => {
    if (store.sourceAssessments.length === 0) {
      alert("No sources have been assessed to export.");
      return;
    }
    const header = "| Index | Source | Usefulness Assessment | Notes | Rating (1-5) | URL |";
    const separator = "|---|---|---|---|---|---|";
    const rows = store.sourceAssessments.map(s => 
        `| ${s.index} | ${s.name.replace(/\|/g, '\\|')} | ${s.assessment.replace(/\|/g, '\\|')} | ${s.notes.replace(/\|/g, '\\|')} | ${s.rating} | ${s.url} |`
      ).join('\n');
    const fullMarkdownContent = `${header}\n${separator}\n${rows}`;
    const filename = `SIFT_Sources_${(store.sessionTopic || 'Untitled').replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.md`;
    downloadMarkdown(fullMarkdownContent, filename);
    setLlmStatusMessage("Source list exported successfully as Markdown.");
  };

  const handleExportReport = async (format: 'md' | 'pdf' | 'substack') => {
    if (store.chatMessages.length === 0) {
      alert("No session content to export.");
      return;
    }
    setIsGeneratingReport(true);
    setLlmStatusMessage("Generating final report...");
    setError(null);

    const transcript = store.chatMessages.filter(m => !m.isLoading && !m.isError)
      .map(m => `--- MESSAGE FROM: ${m.sender.toUpperCase()} (${new Date(m.timestamp).toLocaleString()}) ---\n\n${m.text}`).join('\n\n');

    let sourceAssessmentsTable = 'No sources were formally assessed in this session.';
    if (store.sourceAssessments.length > 0) {
      const header = `| Index | Source | Usefulness Assessment | Notes | Rating (1-5) |\n|---|---|---|---|---|`;
      const rows = store.sourceAssessments.map(s => `| ${s.index} | [${s.name}](${s.url}) | ${s.assessment.replace(/\|/g, '\\|')} | ${s.notes.replace(/\|/g, '\\|')} | ${s.rating} |`).join('\n');
      sourceAssessmentsTable = `${header}\n${rows}`;
    }
    
    let printWindow: Window | null = null;
    if (format === 'pdf') {
        printWindow = window.open('', '_blank');
        if (!printWindow) {
            const errorText = "Could not open new window. Please disable pop-up blockers and try again.";
            setError(errorText);
            setLlmStatusMessage(errorText);
            setIsGeneratingReport(false);
            return;
        }
        printWindow.document.write('<html><head><title>Generating SIFT Report...</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;margin:0;background-color:var(--background);color:var(--primary)}.container{text-align:center}.spinner{border:4px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:var(--primary);width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}h1{color:var(--primary)}p{color:var(--text-light)}</style></head><body><div class="container"><div class="spinner"></div><h1>Generating Report...</h1><p>Please wait, this may take a moment.</p></div></body></html>');
    }

    try {
        const reportPrompt = REPORT_GENERATION_PROMPT.replace('[TRANSCRIPT]', transcript).replace('[SOURCE_ASSESSMENTS_TABLE]', sourceAssessmentsTable);
        const service = new AgenticApiService(store.selectedProviderKey, store.selectedModelId, store.userApiKeys, false, availableModels);
        const stream = service.streamSiftAnalysis({
            isInitialQuery: false, query: reportPrompt, fullChatHistory: [], modelConfigParams: { ...store.modelConfigParams, temperature: 0.2 },
            signal: new AbortController().signal, systemPromptOverride: REPORT_SYSTEM_PROMPT,
        });

        let reportText = '';
        for await (const event of stream) {
            if (event.type === 'chunk') reportText += event.text;
            else if (event.type === 'final') reportText = event.fullText;
            else if (event.type === 'error') throw new Error(event.error);
        }
      
      if (!reportText.trim()) throw new Error("The AI returned an empty report.");

      const filenameBase = `SIFT_Report_${(store.sessionTopic || 'Untitled').replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`;
      const reportTitle = `## Report: ${store.sessionTopic || 'Untitled Session'}\n\n**Generated:** ${new Date().toLocaleString()}\n\n---\n\n`;
      const fullReportMarkdown = reportTitle + reportText;

      if (format === 'md') {
        downloadMarkdown(fullReportMarkdown, `${filenameBase}.md`);
        setLlmStatusMessage("Report exported successfully as Markdown.");
      } else if (format === 'substack') {
        const substackMarkdown = transformMarkdownForSubstack(fullReportMarkdown);
        const htmlContent = marked.parse(substackMarkdown) as string;
        downloadHtml(htmlContent, `${filenameBase}.html`);
        setLlmStatusMessage("Report exported successfully for Substack (HTML).");
      } else if (format === 'pdf' && printWindow) {
        downloadPdfWithBrowserPrint(fullReportMarkdown, `${filenameBase}.pdf`, printWindow);
        setLlmStatusMessage("Report sent to print dialog.");
      }

    } catch (e) {
      console.error("Report export failed:", e);
      const errorText = `Failed to generate report: ${e instanceof Error ? e.message : String(e)}`;
      setError(errorText);
      setLlmStatusMessage(errorText);
      if (printWindow && !printWindow.closed) printWindow.document.body.innerHTML = `<h1>Error</h1><p>${errorText}</p><p>You may close this tab.</p>`;
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSourceIndexClick = (index: number) => {
    setIsToolsMenuOpen(true);
    setTimeout(() => {
        const container = sourceListContainerRef.current;
        if (!container) return;
        const element = container.querySelector(`#source-item-${index}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-source');
            setTimeout(() => element.classList.remove('highlight-source'), 2000);
        }
    }, 100);
  };

  const selectedModelConfig = getSelectedModelConfig();

  return (
    <div className="bg-main text-main">
      <main className="flex flex-col min-h-screen p-3 md:p-6">
          <header className="mb-4 flex-shrink-0 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-primary-accent flex items-center">
                    <span className="mr-2 text-3xl md:text-4xl">🔍</span>
                    SIFT Toolbox
                </h1>
                {mainView === 'chat' && (
                  <p className="text-sm text-light">
                      Model: <span className="font-semibold text-primary-accent">{getSelectedModelConfig()?.name || 'N/A'}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="p-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-border transition-colors"
                  title="Open Settings"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.48.398.668 1.03.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.127c-.332.183-.582.495-.645-.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.127.332-.183.582-.495.645-.87l.213-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
              </button>
              {mainView === 'chat' && (
                <>
                  <button
                      onClick={handleNewSession}
                      className="px-4 py-2 text-sm bg-primary hover:brightness-110 text-on-primary font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-primary transition-all"
                      title="End this session and start a new one"
                  >
                      New Session
                  </button>
                  <div className="relative">
                    <button
                        ref={toolsMenuButtonRef}
                        onClick={() => setIsToolsMenuOpen(prev => !prev)}
                        className="px-4 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-primary transition-all flex items-center"
                        title="Open Sources & Export Menu"
                        aria-haspopup="true"
                        aria-expanded={isToolsMenuOpen}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Export
                    </button>
                    {isToolsMenuOpen && (
                        <ExportAndSourcesMenu
                            ref={toolsMenuRef}
                            isGeneratingReport={isGeneratingReport}
                            onExportReport={handleExportReport}
                            onExportSources={handleExportSources}
                            sourceAssessments={store.sourceAssessments}
                            onSelectSource={setSelectedSourceForModal}
                            sourceListContainerRef={sourceListContainerRef}
                            onClose={() => setIsToolsMenuOpen(false)}
                        />
                    )}
                  </div>
                </>
              )}
            </div>
          </header>
          
          {error && <ErrorAlert message={error} />}

          <div className="flex-grow flex flex-col min-h-0"> 
            {mainView === 'config' && (
              <div className="flex-grow flex flex-col min-h-0">
                  <div className="flex border-b border-ui mb-4 flex-shrink-0">
                      <button 
                          onClick={() => setConfigTab('config')}
                          className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors border-b-2 ${
                              configTab === 'config' ? 'border-primary text-primary-accent' : 'border-transparent text-light hover:text-main'
                          }`}
                      >
                          Session Configuration
                      </button>
                      <button 
                          onClick={() => setConfigTab('about')}
                          className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors border-b-2 ${
                              configTab === 'about' ? 'border-primary text-primary-accent' : 'border-transparent text-light hover:text-main'
                          }`}
                      >
                          About SIFT Toolbox
                      </button>
                  </div>
                  <div className="flex-grow">
                    {configTab === 'config' && (
                      <SessionConfigurationView 
                          isApiKeyValid={isApiKeyValid}
                          onOpenSettings={() => setIsSettingsModalOpen(true)}
                          sessionTopic={store.sessionTopic}
                          setSessionTopic={store.setSessionTopic}
                          sessionContext={store.sessionContext}
                          setSessionContext={store.setSessionContext}
                          sessionFiles={store.sessionFiles}
                          setSessionFiles={store.setSessionFiles}
                          sessionUrls={store.sessionUrls}
                          setSessionUrls={store.setSessionUrls}
                          onStartSession={handleStartSession}
                          onRestoreSession={handleRestoreSession}
                          showRestoreButton={savedSessionExists && store.chatMessages.length === 0}
                      />
                    )}
                    {configTab === 'about' && <AboutContent />}
                  </div>
              </div>
            )}
            {mainView === 'chat' && (
                <div className="flex-grow min-w-0 h-[75vh]"> 
                  <ChatInterface
                    ref={chatContainerRef}
                    messages={store.chatMessages}
                    sourceAssessments={store.sourceAssessments}
                    onSendMessage={handleSendChatMessage}
                    isLoading={isLoading || isGeneratingReport}
                    onStopGeneration={handleStopGeneration}
                    onRestartGeneration={handleRestartGeneration}
                    onSourceIndexClick={handleSourceIndexClick}
                    onToggleLiveConversation={() => setIsLiveConversationOpen(true)}
                    canRestart={store.originalQueryForRestart !== null && !isLoading}
                    supportsWebSearch={selectedModelConfig?.supportsGoogleSearch ?? false}
                    llmStatusMessage={llmStatusMessage}
                    saveStatus={saveStatus}
                    lastSaveTime={lastSaveTime}
                    onSaveSession={handleManualSave}
                  />
                </div>
            )}
          </div>

          <footer className="mt-auto pt-3 text-center text-xs text-light/70 flex-shrink-0">
            <p>Reports compiled and contextualized using Language Models. | SIFT Methodology.</p>
          </footer>
      </main>

      {isSettingsModalOpen && (
        <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            userApiKeys={store.userApiKeys}
            setUserApiKeys={store.setUserApiKeys}
            apiKeyValidation={store.apiKeyValidation}
            setApiKeyValidation={store.setApiKeyValidation}
            selectedProviderKey={store.selectedProviderKey}
            setSelectedProviderKey={store.setSelectedProviderKey}
            enableGeminiPreprocessing={store.enableGeminiPreprocessing}
            setEnableGeminiPreprocessing={store.setEnableGeminiPreprocessing}
            availableModels={availableModels}
            onModelsUpdate={handleModelsUpdate}
            selectedModelId={store.selectedModelId}
            onSelectModelId={store.setSelectedModelId}
            modelConfigParams={store.modelConfigParams}
            onModelConfigParamChange={store.setModelConfigParams}
            customSystemPrompt={store.customSystemPrompt}
            setCustomSystemPrompt={store.setCustomSystemPrompt}
        />
      )}
       {selectedSourceForModal && (
        <SourceAssessmentModal 
          source={selectedSourceForModal} 
          onClose={() => setSelectedSourceForModal(null)} 
        />
      )}
      {isLiveConversationOpen && (
        <LiveConversationView 
            userApiKeys={store.userApiKeys}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            apiKeyValidation={store.apiKeyValidation}
            onClose={() => setIsLiveConversationOpen(false)}
        />
      )}
    </div>
  );
};

export const App = AppInternal; 
export default AppInternal;