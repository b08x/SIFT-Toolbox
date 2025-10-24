
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
import * as SessionManager from './utils/sessionManager.ts';
import { generateCacheKey, getCachedSiftReport, setSiftReportCache, SIFT_PROMPT_VERSION } from './utils/cache.ts';


import { 
  ReportType, 
  ChatMessage, 
  OriginalQueryInfo, 
  AIProvider, 
  AIModelConfig, 
  ConfigurableParams,
  CurrentSiftQueryDetails,
  ApiKeyValidationStates,
  UploadedFile,
  StreamEvent,
  SourceAssessment,
  SavedSessionState,
  LinkValidationStatus,
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

  // Configuration State
  const [userApiKeys, setUserApiKeys] = useState<{ [key in AIProvider]?: string }>({});
  const [apiKeyValidation, setApiKeyValidation] = useState<ApiKeyValidationStates>({});
  const [selectedProviderKey, setSelectedProviderKey] = useState<AIProvider>(AIProvider.GOOGLE_GEMINI);
  const [availableModels, setAvailableModels] = useState<AIModelConfig[]>(INITIAL_MODELS_CONFIG);
  const [selectedModelId, setSelectedModelId] = useState<string>(INITIAL_MODELS_CONFIG.find(m => m.provider === AIProvider.GOOGLE_GEMINI)?.id || INITIAL_MODELS_CONFIG[0].id);
  const [modelConfigParams, setModelConfigParams] = useState<ConfigurableParams>({});
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('');
  const [enableGeminiPreprocessing, setEnableGeminiPreprocessing] = useState<boolean>(false);
  const [sessionTopic, setSessionTopic] = useState<string>('');
  const [sessionContext, setSessionContext] = useState<string>('');
  const [sessionFiles, setSessionFiles] = useState<UploadedFile[]>([]);
  const [sessionUrls, setSessionUrls] = useState<string>('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);


  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [llmStatusMessage, setLlmStatusMessage] = useState<string | null>(null);

  // Session Save State
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  
  const [currentSiftQueryDetails, setCurrentSiftQueryDetails] = useState<CurrentSiftQueryDetails | null>(null);
  const [originalQueryForRestart, setOriginalQueryForRestart] = useState<OriginalQueryInfo | null>(null);
  
  // Source Assessment State
  const [sourceAssessments, setSourceAssessments] = useState<SourceAssessment[]>([]);
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
      if (enableGeminiPreprocessing && selectedProviderKey !== AIProvider.GOOGLE_GEMINI) {
          return apiKeyValidation[selectedProviderKey] === 'valid' && apiKeyValidation[AIProvider.GOOGLE_GEMINI] === 'valid';
      }
      return apiKeyValidation[selectedProviderKey] === 'valid';
  }, [apiKeyValidation, selectedProviderKey, enableGeminiPreprocessing]);

  // Effect to auto-open settings modal if key is invalid on config screen
  useEffect(() => {
      if (mainView === 'config' && !isApiKeyValid && chatMessages.length === 0) {
          setIsSettingsModalOpen(true);
      }
  }, [isApiKeyValid, mainView, chatMessages.length]);

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
    setSourceAssessments(prev => prev.map(assessment => 
        assessmentsToCheck.some(a => a.url === assessment.url)
            ? { ...assessment, linkValidationStatus: 'checking' }
            : assessment
    ));

    const checkedAssessmentsPromises = assessmentsToCheck.map(async (assessment) => {
        const status = await checkLinkStatus(assessment.url);
        return { ...assessment, linkValidationStatus: status };
    });

    const results = await Promise.all(checkedAssessmentsPromises);

    // Merge results back into the main state
    setSourceAssessments(prev => {
        const resultsMap = new Map(results.map(r => [r.url, r.linkValidationStatus]));
        return prev.map(assessment => 
            resultsMap.has(assessment.url)
                ? { ...assessment, linkValidationStatus: resultsMap.get(assessment.url) }
                : assessment
        );
    });
  }, []);

  const performSave = useCallback(() => {
    if (isLoading || chatMessages.length === 0) return;

    setSaveStatus('saving');
    // Short delay for UI to update to "Saving..."
    setTimeout(() => {
        try {
            const sessionState: SavedSessionState = {
                chatMessages,
                currentSiftQueryDetails,
                originalQueryForRestart,
                sourceAssessments,
                selectedProviderKey,
                selectedModelId,
                modelConfigParams,
                enableGeminiPreprocessing,
                userApiKeys,
                apiKeyValidation,
                customSystemPrompt,
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
  }, [
      isLoading, chatMessages, currentSiftQueryDetails, originalQueryForRestart, sourceAssessments,
      selectedProviderKey, selectedModelId, modelConfigParams, enableGeminiPreprocessing, userApiKeys, apiKeyValidation, customSystemPrompt
  ]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!isLoading && chatMessages.length > 0) {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        // Set a timeout to perform the save after 2 seconds of no changes that trigger this effect.
        saveTimeoutRef.current = window.setTimeout(performSave, 2000);
    }

    return () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
    };
  }, [performSave, isLoading, chatMessages.length]);

  const handleManualSave = () => {
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }
      performSave();
  };

  const handleRestoreSession = () => {
    const session = SessionManager.loadSession();
    if (session) {
      setChatMessages(session.chatMessages);
      setCurrentSiftQueryDetails(session.currentSiftQueryDetails);
      setOriginalQueryForRestart(session.originalQueryForRestart);
      
      // Mark all restored assessments as unchecked so they get validated on load
      const assessmentsToLoad = session.sourceAssessments.map(a => ({...a, linkValidationStatus: 'unchecked' as const}));
      setSourceAssessments(assessmentsToLoad);
      if (assessmentsToLoad.length > 0) {
          checkSourceLinks(assessmentsToLoad);
      }

      setSelectedProviderKey(session.selectedProviderKey);
      setSelectedModelId(session.selectedModelId);
      setModelConfigParams(session.modelConfigParams);
      setEnableGeminiPreprocessing(session.enableGeminiPreprocessing);
      setUserApiKeys(session.userApiKeys);
      setApiKeyValidation(session.apiKeyValidation);
      setCustomSystemPrompt(session.customSystemPrompt || '');
      
      // Restore initial config screen state from the loaded details if needed for consistency
      if (session.currentSiftQueryDetails) {
          setSessionTopic(session.currentSiftQueryDetails.sessionTopic);
          setSessionContext(session.currentSiftQueryDetails.sessionContext);
          setSessionFiles(session.currentSiftQueryDetails.sessionFiles);
          setSessionUrls(session.currentSiftQueryDetails.sessionUrls.join('\n'));
      }
      
      setMainView('chat'); // Go directly to chat on restore
      setLastSaveTime(new Date()); // Indicate that what is loaded is "saved" as of now.
      setSaveStatus('saved');
    } else {
      alert("Could not find or load the saved session.");
    }
  };


  const getSelectedModelConfig = useCallback((): AIModelConfig | undefined => {
    return availableModels.find(m => m.id === selectedModelId && m.provider === selectedProviderKey);
  }, [selectedModelId, selectedProviderKey, availableModels]);
  
  const handleNewSession = () => {
    // Resets session but preserves API keys, clears saved session
    setChatMessages([]);
    setIsLoading(false);
    setError(null);
    setLlmStatusMessage(null);
    setOriginalQueryForRestart(null);
    setCurrentSiftQueryDetails(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSessionTopic('');
    setSessionContext('');
    setSessionFiles([]);
    setSessionUrls('');
    setSourceAssessments([]);
    setSelectedSourceForModal(null);
    setCustomSystemPrompt('');

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
      setModelConfigParams(initialParams);
    }
  }, [selectedModelId, selectedProviderKey, getSelectedModelConfig]);

  const handleModelsUpdate = useCallback((provider: AIProvider, newModels: AIModelConfig[]) => {
      setAvailableModels(prev => {
          const otherProviderModels = prev.filter(m => m.provider !== provider);
          return [...otherProviderModels, ...newModels];
      });

      // Check if current selection is still valid for the updated provider
      if (selectedProviderKey === provider) {
          const isCurrentModelStillAvailable = newModels.some(m => m.id === selectedModelId);
          // If the current model is no longer in the list, or if no model is selected for this provider, select the first new one.
          if ((!isCurrentModelStillAvailable || !selectedModelId) && newModels.length > 0) {
              setSelectedModelId(newModels[0].id);
          }
      }
  }, [selectedProviderKey, selectedModelId]);

  const processStreamEvents = async (stream: AsyncGenerator<StreamEvent>, aiMessageId: string) => {
    let accumulatedText = '';
    let inThinkBlock = false;
    let accumulatedReasoning = '';

    // Buffering logic for smoother UI updates
    let textBufferForUiUpdate = '';
    let lastUiUpdate = Date.now();
    const UI_UPDATE_INTERVAL = 100; // ms

    const flushUiBuffer = () => {
        if (textBufferForUiUpdate.length > 0) {
            accumulatedText += textBufferForUiUpdate;
            setChatMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: accumulatedText } : m));
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
                      const reasoningChunk = streamBuffer.substring(0, endTagIndex);
                      accumulatedReasoning += reasoningChunk;
                      streamBuffer = streamBuffer.substring(endTagIndex + '</think>'.length);
                      inThinkBlock = false;
                  } else {
                      accumulatedReasoning += streamBuffer;
                      streamBuffer = '';
                  }
              } else {
                  const startTagIndex = streamBuffer.indexOf('<think>');
                  if (startTagIndex !== -1) {
                      const normalChunk = streamBuffer.substring(0, startTagIndex);
                      textBufferForUiUpdate += normalChunk;
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
          setChatMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, groundingSources: event.sources } : m));
          break;
        case 'error':
          setError(event.error);
          setLlmStatusMessage(`Error: ${event.error}`);
          setChatMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: `Error: ${event.error}`, isLoading: false, isError: true } : m));
          return; // Stop processing on error
        case 'final':
          flushUiBuffer(); // Final flush to capture all remaining text.

          if (event.cacheKey && event.fullText) {
              const reportToCache: CachedSiftReport = {
                  text: event.fullText,
                  groundingSources: event.groundingSources,
                  modelId: event.modelId,
                  originalQueryReportType: event.originalQueryReportType || ReportType.FULL_CHECK,
                  cachedAt: Date.now()
              };
              setSiftReportCache(event.cacheKey, reportToCache);
          }

          // Use the locally accumulated text which has been stripped of the <think> tags.
          // This ensures the main message body does not contain the reasoning block.
          let textForReport = accumulatedText;
          if (event.groundingSources && event.groundingSources.length > 0) {
              textForReport = correctRedirectLinksInMarkdown(textForReport, event.groundingSources);
          }

          const newAssessments = parseSourceAssessmentsFromMarkdown(textForReport);

          if (newAssessments.length > 0) {
              setSourceAssessments(prevAssessments => {
                  const updatedAssessmentsMap = new Map<string, Omit<SourceAssessment, 'index'>>();
                  
                  prevAssessments.forEach(a => updatedAssessmentsMap.set(a.url, a));
                  newAssessments.forEach(newA => {
                      const existing = updatedAssessmentsMap.get(newA.url);
                      updatedAssessmentsMap.set(newA.url, { ...existing, ...newA });
                  });
  
                  const sortedAssessments = Array.from(updatedAssessmentsMap.values()).sort((a, b) => {
                    const ratingA = getNumericRating(a.rating);
                    const ratingB = getNumericRating(b.rating);
                    return ratingB - ratingA;
                  });
                  
                  const finalAssessments = sortedAssessments.map((assessment, index) => {
                      const prevAssessment = prevAssessments.find(pa => pa.url === assessment.url);
                      return {
                          ...assessment,
                          index: index + 1,
                          linkValidationStatus: prevAssessment?.linkValidationStatus || 'unchecked',
                      };
                  });

                  const assessmentsThatNeedChecking = finalAssessments.filter(
                      fa => fa.linkValidationStatus === 'unchecked'
                  );
                  if (assessmentsThatNeedChecking.length > 0) {
                      checkSourceLinks(assessmentsThatNeedChecking);
                  }

                  return finalAssessments;
              });
          }
          setChatMessages(prev => prev.map(m => m.id === aiMessageId ? {
            ...m,
            text: textForReport, // Use the definitive stripped & corrected full text
            isLoading: false,
            groundingSources: event.groundingSources,
            isInitialSIFTReport: event.isInitialSIFTReport,
            originalQueryReportType: event.originalQueryReportType,
            modelId: event.modelId,
            reasoning: accumulatedReasoning.trim(),
          } : m));
          setLlmStatusMessage("Response complete.");
          break;
      }
    }
    // Final flush after loop in case stream ends without a 'final' event
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

    const initialPrompt = `New SIFT Session Started.
**Topic/Subject:** ${sessionTopic || "Not specified"}
**Additional Context/Instructions:** ${sessionContext || "None"}
${sessionFiles.length > 0 ? `**Attached Files (${sessionFiles.length}):** ${sessionFiles.map(f => f.name).join(', ')}` : ''}
${sessionUrls.trim().length > 0 ? `**Context URLs:**\n${sessionUrls.trim()}` : ''}`;

    const initialUserMessageText = `Let's begin the SIFT analysis. My topic is "${sessionTopic}" with the following context: "${sessionContext}". Please provide an initial analysis or plan of action based on this, considering any attached files or URLs.`;
    const urlList = sessionUrls.trim() ? sessionUrls.trim().split('\n').filter(u => u.trim() !== '') : [];
    
    const originalQuery: OriginalQueryInfo = {
        text: initialUserMessageText,
        reportType: ReportType.FULL_CHECK, // Start with a full check by default
        files: sessionFiles,
        urls: urlList,
    };

    if (!sessionTopic.trim()) {
      setError("Please provide a Topic/Subject to start the session.");
      return;
    }
    
    setIsLoading(true); 
    setMainView('chat');

    const userMessage: ChatMessage = {
      id: uuidv4(),
      sender: 'user',
      text: initialPrompt,
      timestamp: new Date(),
      originalQuery: originalQuery,
      uploadedFiles: sessionFiles,
    };
    setChatMessages([userMessage]);
    
    setCurrentSiftQueryDetails({
      sessionTopic: sessionTopic,
      sessionContext: sessionContext,
      sessionFiles: sessionFiles,
      sessionUrls: urlList,
    });
    setOriginalQueryForRestart(originalQuery); 
    setSourceAssessments([]); // Clear assessments for new session

    // Caching logic
    const cacheableDetails: CacheableQueryDetails = {
        text: originalQuery.text,
        files: sessionFiles.map(f => ({ base64Data: f.base64Data, name: f.name })),
        reportType: originalQuery.reportType,
        provider: selectedProviderKey,
        modelId: selectedModelId,
        modelConfigParams,
        siftPromptVersion: SIFT_PROMPT_VERSION,
    };
    const cacheKey = await generateCacheKey(cacheableDetails);
    const cachedReport = getCachedSiftReport(cacheKey);

    if (cachedReport) {
        setLlmStatusMessage("Loaded report from local cache.");
        const aiMessage: ChatMessage = {
            id: uuidv4(),
            sender: 'ai',
            text: cachedReport.text,
            timestamp: new Date(),
            isLoading: false,
            groundingSources: cachedReport.groundingSources,
            isInitialSIFTReport: true,
            originalQueryReportType: cachedReport.originalQueryReportType,
            modelId: cachedReport.modelId,
            isFromCache: true,
        };
        setChatMessages(prev => [...prev, aiMessage]);
        
        const assessmentsFromCache = parseSourceAssessmentsFromMarkdown(cachedReport.text)
            .map((a, index) => ({ ...a, index: index + 1, linkValidationStatus: 'unchecked' as const }));
        setSourceAssessments(assessmentsFromCache);
        if (assessmentsFromCache.length > 0) {
            checkSourceLinks(assessmentsFromCache);
        }
        
        setIsLoading(false);
        return;
    }
    // End of cache check

    abortControllerRef.current = new AbortController();
    const aiMessageId = uuidv4();
    setChatMessages(prev => [...prev, { 
      id: aiMessageId, 
      sender: 'ai', 
      text: '', 
      isLoading: true, 
      timestamp: new Date(), 
      modelId: selectedModelId 
    }]);

    try {
        // FIX: Pass `availableModels` to the AgenticApiService constructor.
        const service = new AgenticApiService(selectedProviderKey, selectedModelId, userApiKeys, enableGeminiPreprocessing, availableModels);
        const stream = service.streamSiftAnalysis({
            isInitialQuery: true,
            query: originalQuery,
            fullChatHistory: [userMessage],
            modelConfigParams: modelConfigParams,
            signal: abortControllerRef.current.signal,
            customSystemPrompt,
            cacheKey, // Pass cache key to the service
        });
        await processStreamEvents(stream, aiMessageId);
    } catch (e) {
      const errorText = `Failed to start analysis: ${e instanceof Error ? e.message : String(e)}`;
      setError(errorText);
      setLlmStatusMessage(errorText);
      setChatMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: errorText, isLoading: false, isError: true } : m));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };


  const handleSendChatMessage = async (messageText: string, command?: 'another round' | 'read the room' | 'generate_context_report' | 'generate_community_note' | 'web_search' | 'trace_claim' | 'discourse_map' | 'explain_like_im_in_high_school') => {
    if (isLoading) return;
    setError(null);
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: uuidv4(),
      sender: 'user',
      text: messageText,
      timestamp: new Date(),
    };
    const updatedChatMessages = [...chatMessages, userMessage];
    setChatMessages(updatedChatMessages);

    const aiMessageId = uuidv4();
    setChatMessages(prev => [...prev, { id: aiMessageId, sender: 'ai', text: '', isLoading: true, timestamp: new Date(), modelId: selectedModelId }]);
    
    abortControllerRef.current = new AbortController();

    try {
        // FIX: Pass `availableModels` to the AgenticApiService constructor.
        const service = new AgenticApiService(selectedProviderKey, selectedModelId, userApiKeys, enableGeminiPreprocessing, availableModels);
        const stream = service.streamSiftAnalysis({
            isInitialQuery: false,
            query: messageText,
            fullChatHistory: updatedChatMessages,
            modelConfigParams,
            signal: abortControllerRef.current.signal,
            originalQueryForRestart,
            command,
            customSystemPrompt,
        });
        await processStreamEvents(stream, aiMessageId);
    } catch (e) {
      const errorText = `Failed to send message: ${e instanceof Error ? e.message : String(e)}`;
      setError(errorText);
      setLlmStatusMessage(errorText);
      setChatMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: errorText, isLoading: false, isError: true } : m));
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
    setChatMessages(prevMessages => 
      prevMessages.map(msg => 
        msg.isLoading ? { ...msg, text: msg.text + "\n\nGeneration stopped by user.", isLoading: false, isError: false } : msg
      )
    );
  };

  const handleRestartGeneration = () => {
    if (originalQueryForRestart) {
      const firstUserMessage = chatMessages.find(msg => msg.sender === 'user' && msg.originalQuery);
      if (firstUserMessage) {
        setChatMessages([firstUserMessage]); 
        setSourceAssessments([]); // Clear assessments on restart
        const aiMessageId = uuidv4();
        setChatMessages(prev => [...prev, { id: aiMessageId, sender: 'ai', text: '', isLoading: true, timestamp: new Date(), modelId: selectedModelId }]);
        abortControllerRef.current = new AbortController();
        setIsLoading(true);
        try {
            // FIX: Pass `availableModels` to the AgenticApiService constructor.
            const service = new AgenticApiService(selectedProviderKey, selectedModelId, userApiKeys, enableGeminiPreprocessing, availableModels);
            const stream = service.streamSiftAnalysis({
                isInitialQuery: true,
                query: originalQueryForRestart,
                fullChatHistory: [firstUserMessage],
                modelConfigParams: modelConfigParams,
                signal: abortControllerRef.current.signal,
                customSystemPrompt,
            });
            processStreamEvents(stream, aiMessageId).finally(() => {
                setIsLoading(false);
                abortControllerRef.current = null;
            });
        } catch (e) {
            const errorText = `Failed to restart analysis: ${e instanceof Error ? e.message : String(e)}`;
            setError(errorText);
            setLlmStatusMessage(errorText);
            setChatMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: errorText, isLoading: false, isError: true } : m));
            setIsLoading(false);
        }
      }
    }
  };

  const handleExportSources = () => {
    if (sourceAssessments.length === 0) {
      alert("No sources have been assessed to export.");
      return;
    }

    const header = "| Index | Source | Usefulness Assessment | Notes | Rating (1-5) | URL |";
    const separator = "|---|---|---|---|---|---|";

    const rows = sourceAssessments
      .map(s => 
        `| ${s.index} | ${s.name.replace(/\|/g, '\\|')} | ${s.assessment.replace(/\|/g, '\\|')} | ${s.notes.replace(/\|/g, '\\|')} | ${s.rating} | ${s.url} |`
      )
      .join('\n');
    
    const fullMarkdownContent = `${header}\n${separator}\n${rows}`;
    
    const filename = `SIFT_Sources_${(sessionTopic || 'Untitled').replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.md`;
    
    downloadMarkdown(fullMarkdownContent, filename);
    setLlmStatusMessage("Source list exported successfully as Markdown.");
  };

  const handleExportReport = async (format: 'md' | 'pdf' | 'substack') => {
    if (chatMessages.length === 0) {
      alert("No session content to export.");
      return;
    }
    setIsGeneratingReport(true);
    setLlmStatusMessage("Generating final report...");
    setError(null);

    const transcript = chatMessages
      .filter(m => !m.isLoading && !m.isError)
      .map(m => `--- MESSAGE FROM: ${m.sender.toUpperCase()} (${new Date(m.timestamp).toLocaleString()}) ---\n\n${m.text}`)
      .join('\n\n');

    let sourceAssessmentsTable = 'No sources were formally assessed in this session.';
    if (sourceAssessments.length > 0) {
      const header = `| Index | Source | Usefulness Assessment | Notes | Rating (1-5) |\n|---|---|---|---|---|`;
      const rows = sourceAssessments.map(s => 
        `| ${s.index} | [${s.name}](${s.url}) | ${s.assessment.replace(/\|/g, '\\|')} | ${s.notes.replace(/\|/g, '\\|')} | ${s.rating} |`
      ).join('\n');
      sourceAssessmentsTable = `${header}\n${rows}`;
    }
    
    // For PDF, open a new window immediately to avoid pop-up blockers.
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
        const reportPrompt = REPORT_GENERATION_PROMPT
            .replace('[TRANSCRIPT]', transcript)
            .replace('[SOURCE_ASSESSMENTS_TABLE]', sourceAssessmentsTable);

        // FIX: Pass `availableModels` to the AgenticApiService constructor.
        const service = new AgenticApiService(selectedProviderKey, selectedModelId, userApiKeys, false, availableModels); // No preprocessing for report
        const stream = service.streamSiftAnalysis({
            isInitialQuery: false,
            query: reportPrompt,
            fullChatHistory: [], 
            modelConfigParams: { ...modelConfigParams, temperature: 0.2 },
            signal: new AbortController().signal,
            systemPromptOverride: REPORT_SYSTEM_PROMPT,
        });

        let reportText = '';
        for await (const event of stream) {
            if (event.type === 'chunk') {
                reportText += event.text;
            } else if (event.type === 'final') {
                reportText = event.fullText;
            } else if (event.type === 'error') {
                throw new Error(event.error);
            }
        }
      
      if (!reportText.trim()) {
        throw new Error("The AI returned an empty report.");
      }

      const filenameBase = `SIFT_Report_${(sessionTopic || 'Untitled').replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`;
      const reportTitle = `## Report: ${sessionTopic || 'Untitled Session'}\n\n**Generated:** ${new Date().toLocaleString()}\n\n---\n\n`;
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
      if (printWindow && !printWindow.closed) {
          printWindow.document.body.innerHTML = `<h1>Error</h1><p>${errorText}</p><p>You may close this tab.</p>`;
      }
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSourceIndexClick = (index: number) => {
    setIsToolsMenuOpen(true);

    // Delay scroll to allow menu to open and render
    setTimeout(() => {
        const container = sourceListContainerRef.current;
        if (!container) return;

        const element = container.querySelector(`#source-item-${index}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-source');
            setTimeout(() => {
                element.classList.remove('highlight-source');
            }, 2000); // Highlight for 2 seconds
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
                            sourceAssessments={sourceAssessments}
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
                          sessionTopic={sessionTopic}
                          setSessionTopic={setSessionTopic}
                          sessionContext={sessionContext}
                          setSessionContext={setSessionContext}
                          sessionFiles={sessionFiles}
                          setSessionFiles={setSessionFiles}
                          sessionUrls={sessionUrls}
                          setSessionUrls={setSessionUrls}
                          onStartSession={handleStartSession}
                          onRestoreSession={handleRestoreSession}
                          showRestoreButton={savedSessionExists && chatMessages.length === 0}
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
                    messages={chatMessages}
                    sourceAssessments={sourceAssessments}
                    onSendMessage={handleSendChatMessage}
                    isLoading={isLoading || isGeneratingReport}
                    onStopGeneration={handleStopGeneration}
                    onRestartGeneration={handleRestartGeneration}
                    onSourceIndexClick={handleSourceIndexClick}
                    canRestart={originalQueryForRestart !== null && !isLoading}
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
            userApiKeys={userApiKeys}
            setUserApiKeys={setUserApiKeys}
            apiKeyValidation={apiKeyValidation}
            setApiKeyValidation={setApiKeyValidation}
            selectedProviderKey={selectedProviderKey}
            setSelectedProviderKey={setSelectedProviderKey}
            enableGeminiPreprocessing={enableGeminiPreprocessing}
            setEnableGeminiPreprocessing={setEnableGeminiPreprocessing}
            availableModels={availableModels}
            onModelsUpdate={handleModelsUpdate}
            selectedModelId={selectedModelId}
            onSelectModelId={setSelectedModelId}
            modelConfigParams={modelConfigParams}
            onModelConfigParamChange={setModelConfigParams}
            customSystemPrompt={customSystemPrompt}
            setCustomSystemPrompt={setCustomSystemPrompt}
        />
      )}
       {selectedSourceForModal && (
        <SourceAssessmentModal 
          source={selectedSourceForModal} 
          onClose={() => setSelectedSourceForModal(null)} 
        />
      )}
    </div>
  );
};

export const App = AppInternal; 
export default AppInternal;
