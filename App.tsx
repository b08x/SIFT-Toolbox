


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { ChatInterface } from './components/ChatInterface';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorAlert } from './components/ErrorAlert';
import { UserQueryPanel } from './components/UserQueryPanel';
import { RightSidebar } from './components/RightSidebar';
import { LandingPage } from './components/LandingPage';
import { ConfigurationPage } from './components/ConfigurationPage';
import { SettingsModal } from './components/SettingsModal';
import { AgenticApiService } from './services/agenticApiService.ts';
import { SourceAssessmentModal } from './components/SourceAssessmentModal';
import * as SessionManager from './utils/sessionManager.ts';


import { 
  ReportType, 
  ChatMessage, 
  OriginalQueryInfo, 
  AIProvider, 
  AIModelConfig, 
  ConfigurableParams,
  CurrentSiftQueryDetails,
  ApiKeyValidationStates,
  AppPhase,
  UploadedFile,
  StreamEvent,
  SourceAssessment,
  GroundingChunk,
  SavedSessionState
} from './types';
import { DOSSIER_SYSTEM_PROMPT, DOSSIER_GENERATION_PROMPT } from './prompts';
import { AVAILABLE_PROVIDERS_MODELS } from './models.config';
import { downloadMarkdown, downloadPdfWithBrowserPrint } from './utils/download';
import { parseSourceAssessmentsFromMarkdown } from './utils/apiHelpers.ts';

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
  const [appPhase, setAppPhase] = useState<AppPhase>(AppPhase.LANDING);
  const [savedSessionExists, setSavedSessionExists] = useState<boolean>(false);
  
  // Configuration State
  const [userApiKeys, setUserApiKeys] = useState<{ [key in AIProvider]?: string }>({});
  const [apiKeyValidation, setApiKeyValidation] = useState<ApiKeyValidationStates>({});
  const [selectedProviderKey, setSelectedProviderKey] = useState<AIProvider>(AIProvider.GOOGLE_GEMINI);
  const [selectedModelId, setSelectedModelId] = useState<string>(AVAILABLE_PROVIDERS_MODELS.find(m => m.provider === AIProvider.GOOGLE_GEMINI)?.id || AVAILABLE_PROVIDERS_MODELS[0].id);
  const [modelConfigParams, setModelConfigParams] = useState<ConfigurableParams>({});
  const [enableGeminiPreprocessing, setEnableGeminiPreprocessing] = useState<boolean>(false);
  const [sessionTopic, setSessionTopic] = useState<string>('');
  const [sessionContext, setSessionContext] = useState<string>('');
  const [sessionFiles, setSessionFiles] = useState<UploadedFile[]>([]);
  const [sessionUrls, setSessionUrls] = useState<string>('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);


  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [llmStatusMessage, setLlmStatusMessage] = useState<string | null>(null);
  const [aiReasoningStream, setAiReasoningStream] = useState<string>('');
  const [isProcessingReasoning, setIsProcessingReasoning] = useState<boolean>(false);

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

  // Check for saved session on initial load
  useEffect(() => {
    setSavedSessionExists(SessionManager.hasSavedSession());
  }, []);

  const performSave = useCallback(() => {
    if (appPhase !== AppPhase.CHAT_ACTIVE || isLoading || chatMessages.length === 0) return;

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
      appPhase, isLoading, chatMessages, currentSiftQueryDetails, originalQueryForRestart, sourceAssessments,
      selectedProviderKey, selectedModelId, modelConfigParams, enableGeminiPreprocessing, userApiKeys, apiKeyValidation
  ]);

  // Debounced auto-save effect
  useEffect(() => {
    if (appPhase === AppPhase.CHAT_ACTIVE && !isLoading && chatMessages.length > 0) {
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
  }, [performSave, appPhase, isLoading, chatMessages.length]);

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
      setSourceAssessments(session.sourceAssessments);
      setSelectedProviderKey(session.selectedProviderKey);
      setSelectedModelId(session.selectedModelId);
      setModelConfigParams(session.modelConfigParams);
      setEnableGeminiPreprocessing(session.enableGeminiPreprocessing);
      setUserApiKeys(session.userApiKeys);
      setApiKeyValidation(session.apiKeyValidation);
      
      // Restore initial config screen state from the loaded details if needed for consistency
      if (session.currentSiftQueryDetails) {
          setSessionTopic(session.currentSiftQueryDetails.sessionTopic);
          setSessionContext(session.currentSiftQueryDetails.sessionContext);
          setSessionFiles(session.currentSiftQueryDetails.sessionFiles);
          setSessionUrls(session.currentSiftQueryDetails.sessionUrls.join('\n'));
      }
      
      setAppPhase(AppPhase.CHAT_ACTIVE);
      setLastSaveTime(new Date()); // Indicate that what is loaded is "saved" as of now.
      setSaveStatus('saved');
    } else {
      alert("Could not find or load the saved session.");
    }
  };


  const getSelectedModelConfig = useCallback((): AIModelConfig | undefined => {
    return AVAILABLE_PROVIDERS_MODELS.find(m => m.id === selectedModelId && m.provider === selectedProviderKey);
  }, [selectedModelId, selectedProviderKey]);

  const handleGoHome = () => {
    // Full reset, including API keys and saved session
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
    setAiReasoningStream('');
    setIsProcessingReasoning(false);
    
    // Clear keys and validation
    setUserApiKeys({}); 
    setApiKeyValidation({}); 
    SessionManager.clearSession();
    setSavedSessionExists(false);
    setAppPhase(AppPhase.LANDING); 
    setSaveStatus('idle');
    setLastSaveTime(null);
  };
  
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
    setAiReasoningStream('');
    setIsProcessingReasoning(false);

    SessionManager.clearSession();
    setSavedSessionExists(false);
    setAppPhase(AppPhase.CONFIGURATION_SETUP);
    setSaveStatus('idle');
    setLastSaveTime(null);
  };

  const handleGetStarted = () => {
    setAppPhase(AppPhase.CONFIGURATION_SETUP);
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


  const processStreamEvents = async (stream: AsyncGenerator<StreamEvent>, aiMessageId: string) => {
    let accumulatedText = '';
    let inThinkBlock = false;
  
    setAiReasoningStream('');
    setIsProcessingReasoning(false);

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
                      setAiReasoningStream(prev => prev + reasoningChunk);
                      streamBuffer = streamBuffer.substring(endTagIndex + '</think>'.length);
                      inThinkBlock = false;
                      setIsProcessingReasoning(false);
                  } else {
                      setAiReasoningStream(prev => prev + streamBuffer);
                      streamBuffer = '';
                  }
              } else {
                  const startTagIndex = streamBuffer.indexOf('<think>');
                  if (startTagIndex !== -1) {
                      const normalChunk = streamBuffer.substring(0, startTagIndex);
                      textBufferForUiUpdate += normalChunk;
                      streamBuffer = streamBuffer.substring(startTagIndex + '<think>'.length);
                      inThinkBlock = true;
                      setIsProcessingReasoning(true);
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
          flushUiBuffer(); // Final flush to show all chunk text

          const newAssessmentsRaw = parseSourceAssessmentsFromMarkdown(event.fullText);
          
          let correctedAssessments = newAssessmentsRaw;
          if (event.groundingSources && event.groundingSources.length > 0) {
            const directSourcesMap = new Map<string, string>(); // Map from normalized title to direct URL
            event.groundingSources.forEach(source => {
              if (source.web?.title && source.web?.uri) {
                const normalizedTitle = source.web.title.trim().toLowerCase();
                if (!directSourcesMap.has(normalizedTitle)) {
                  directSourcesMap.set(normalizedTitle, source.web.uri);
                }
              }
            });

            if (directSourcesMap.size > 0) {
              correctedAssessments = newAssessmentsRaw.map(assessment => {
                if (assessment.url.includes('vertexaisearch.cloud.google.com')) {
                  const assessmentTitleNormalized = assessment.name.trim().toLowerCase();
                  
                  // 1. Exact match
                  if (directSourcesMap.has(assessmentTitleNormalized)) {
                    return { ...assessment, url: directSourcesMap.get(assessmentTitleNormalized)! };
                  }

                  // 2. Partial match
                  let bestMatchUrl: string | null = null;
                  let highestMatchScore = 0;

                  for (const [sourceTitle, directUrl] of directSourcesMap.entries()) {
                    let score = 0;
                    if (assessmentTitleNormalized.includes(sourceTitle)) {
                      score = sourceTitle.length / assessmentTitleNormalized.length;
                    } else if (sourceTitle.includes(assessmentTitleNormalized)) {
                      score = assessmentTitleNormalized.length / sourceTitle.length;
                    }
                    
                    if (score > highestMatchScore) {
                      highestMatchScore = score;
                      bestMatchUrl = directUrl;
                    }
                  }

                  // Threshold to accept partial match
                  if (bestMatchUrl && highestMatchScore > 0.7) {
                    return { ...assessment, url: bestMatchUrl };
                  }
                }
                return assessment;
              });
            }
          }

          if (correctedAssessments.length > 0) {
              setSourceAssessments(prevAssessments => {
                  const updatedAssessmentsMap = new Map<string, Omit<SourceAssessment, 'index'>>();
                  
                  // Seed map with existing assessments to maintain order and data.
                  prevAssessments.forEach(a => updatedAssessmentsMap.set(a.url, a));
                  
                  // Add/update with new assessments. `Map` handles uniqueness by key.
                  correctedAssessments.forEach(newA => {
                      const existing = updatedAssessmentsMap.get(newA.url);
                      updatedAssessmentsMap.set(newA.url, { ...existing, ...newA });
                  });
  
                  // Convert map to array and sort by rating in descending order
                  const sortedAssessments = Array.from(updatedAssessmentsMap.values()).sort((a, b) => {
                    const ratingA = getNumericRating(a.rating);
                    const ratingB = getNumericRating(b.rating);
                    return ratingB - ratingA;
                  });
                  
                  // Assign final, sequential indices after sorting.
                  return sortedAssessments.map((assessment, index) => ({
                      ...assessment,
                      index: index + 1,
                  }));
              });
          }
          setChatMessages(prev => prev.map(m => m.id === aiMessageId ? {
            ...m,
            text: event.fullText, // Use the definitive full text from the final event
            isLoading: false,
            groundingSources: event.groundingSources,
            isInitialSIFTReport: event.isInitialSIFTReport,
            originalQueryReportType: event.originalQueryReportType,
            modelId: event.modelId,
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
    setAppPhase(AppPhase.CHAT_ACTIVE); 

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
        const service = new AgenticApiService(selectedProviderKey, selectedModelId, userApiKeys, enableGeminiPreprocessing);
        const stream = service.streamSiftAnalysis({
            isInitialQuery: true,
            query: originalQuery,
            fullChatHistory: [userMessage],
            modelConfigParams: modelConfigParams,
            signal: abortControllerRef.current.signal,
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


  const handleSendChatMessage = async (messageText: string, command?: 'another round' | 'read the room' | 'generate_context_report' | 'generate_community_note' | 'web_search') => {
    if (appPhase !== AppPhase.CHAT_ACTIVE || isLoading) return;
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
        const service = new AgenticApiService(selectedProviderKey, selectedModelId, userApiKeys, enableGeminiPreprocessing);
        const stream = service.streamSiftAnalysis({
            isInitialQuery: false,
            query: messageText,
            fullChatHistory: updatedChatMessages,
            modelConfigParams,
            signal: abortControllerRef.current.signal,
            originalQueryForRestart,
            command,
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
            const service = new AgenticApiService(selectedProviderKey, selectedModelId, userApiKeys, enableGeminiPreprocessing);
            const stream = service.streamSiftAnalysis({
                isInitialQuery: true,
                query: originalQueryForRestart,
                fullChatHistory: [firstUserMessage],
                modelConfigParams: modelConfigParams,
                signal: abortControllerRef.current.signal,
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

  const handleExportDossier = async (format: 'md' | 'pdf') => {
    if (chatMessages.length === 0) {
      alert("No session content to export.");
      return;
    }
    setIsGeneratingDossier(true);
    setLlmStatusMessage("Generating final dossier...");
    setError(null);

    const transcript = chatMessages
      .filter(m => !m.isLoading && !m.isError)
      .map(m => `--- MESSAGE FROM: ${m.sender.toUpperCase()} (${new Date(m.timestamp).toLocaleString()}) ---\n\n${m.text}`)
      .join('\n\n');
    
    // For PDF, open a new window immediately to avoid pop-up blockers.
    let printWindow: Window | null = null;
    if (format === 'pdf') {
        printWindow = window.open('', '_blank');
        if (!printWindow) {
            const errorText = "Could not open new window. Please disable pop-up blockers and try again.";
            setError(errorText);
            setLlmStatusMessage(errorText);
            setIsGeneratingDossier(false);
            return;
        }
        printWindow.document.write('<html><head><title>Generating SIFT Dossier...</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;margin:0;background-color:#212934;color:#e2a32d}.container{text-align:center}.spinner{border:4px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#e2a32d;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}h1{color:#f5b132}p{color:#95aac0}</style></head><body><div class="container"><div class="spinner"></div><h1>Generating Dossier...</h1><p>Please wait, this may take a moment.</p></div></body></html>');
    }

    try {
        const dossierPrompt = DOSSIER_GENERATION_PROMPT.replace('[TRANSCRIPT]', transcript);
        const service = new AgenticApiService(selectedProviderKey, selectedModelId, userApiKeys, false); // No preprocessing for dossier
        const stream = service.streamSiftAnalysis({
            isInitialQuery: false,
            query: dossierPrompt,
            fullChatHistory: [], 
            modelConfigParams: { ...modelConfigParams, temperature: 0.2 },
            signal: new AbortController().signal,
            systemPromptOverride: DOSSIER_SYSTEM_PROMPT,
        });

        let dossierText = '';
        for await (const event of stream) {
            if (event.type === 'chunk') {
                dossierText += event.text;
            } else if (event.type === 'final') {
                dossierText = event.fullText;
            } else if (event.type === 'error') {
                throw new Error(event.error);
            }
        }
      
      if (!dossierText.trim()) {
        throw new Error("The AI returned an empty dossier.");
      }

      const filenameBase = `SIFT_Dossier_${(sessionTopic || 'Untitled').replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'md') {
        downloadMarkdown(dossierText, `${filenameBase}.md`);
        setLlmStatusMessage("Dossier exported successfully as Markdown.");
      } else if (format === 'pdf' && printWindow) {
        const dossierTitle = `## Dossier: ${sessionTopic || 'Untitled Session'}\n\n**Generated:** ${new Date().toLocaleString()}\n\n---\n\n`;
        downloadPdfWithBrowserPrint(dossierTitle + dossierText, `${filenameBase}.pdf`, printWindow);
        setLlmStatusMessage("Dossier sent to print dialog.");
      }

    } catch (e) {
      console.error("Dossier export failed:", e);
      const errorText = `Failed to generate dossier: ${e instanceof Error ? e.message : String(e)}`;
      setError(errorText);
      setLlmStatusMessage(errorText);
      if (printWindow && !printWindow.closed) {
          printWindow.document.body.innerHTML = `<h1>Error</h1><p>${errorText}</p><p>You may close this tab.</p>`;
      }
    } finally {
      setIsGeneratingDossier(false);
    }
  };

  if (appPhase === AppPhase.LANDING) {
    return <LandingPage onGetStarted={handleGetStarted} onRestoreSession={handleRestoreSession} showRestoreButton={savedSessionExists} />;
  }

  if (appPhase === AppPhase.CONFIGURATION_SETUP) {
    return (
      <>
        <ConfigurationPage
          apiKeyValidation={apiKeyValidation}
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
          onGoHome={handleGoHome}
          selectedProviderKey={selectedProviderKey}
          enableGeminiPreprocessing={enableGeminiPreprocessing}
        />
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
            availableModels={AVAILABLE_PROVIDERS_MODELS}
            selectedModelId={selectedModelId}
            onSelectModelId={setSelectedModelId}
            modelConfigParams={modelConfigParams}
            onModelConfigParamChange={setModelConfigParams}
          />
        )}
      </>
    );
  }

  const selectedModelConfig = getSelectedModelConfig();

  return (
    <div className="flex flex-col md:flex-row h-screen max-h-screen bg-[#212934] text-gray-200">
      <main className={`flex-grow flex flex-col p-3 md:p-6 overflow-hidden h-full`}>
          <header className="mb-4 flex-shrink-0 flex justify-between items-center">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#e2a32d] flex items-center">
                  <span className="mr-2 text-3xl md:text-4xl">🔍</span>
                  SIFT Toolbox Session
              </h1>
              <p className="text-sm text-[#95aac0]">
                  Model: <span className="font-semibold text-[#c36e26]">{getSelectedModelConfig()?.name || 'N/A'}</span>
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="p-2 text-sm bg-gray-600 hover:bg-gray-500 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212934] focus:ring-gray-500 transition-colors"
                  title="Open Settings"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.48.398.668 1.03.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.127c-.332.183-.582.495-.645.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.127.332-.183.582-.495.645-.87l.213-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
              </button>
              <button
                  onClick={handleNewSession}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212934] focus:ring-blue-500 transition-colors"
                  title="End this session and start a new one"
              >
                  New Session
              </button>
            </div>
          </header>
          
          {error && <ErrorAlert message={error} />}

          <div className="flex-grow flex min-h-0"> 
            {currentSiftQueryDetails && (
              <UserQueryPanel
                sessionTopic={currentSiftQueryDetails.sessionTopic}
                sessionContext={currentSiftQueryDetails.sessionContext}
                sessionFiles={currentSiftQueryDetails.sessionFiles}
                sessionUrls={currentSiftQueryDetails.sessionUrls}
                aiReasoningStream={aiReasoningStream}
                isProcessingReasoning={isProcessingReasoning}
              />
            )}
            <div className="flex-grow pl-0 md:pl-4 min-w-0"> 
              <ChatInterface
                ref={chatContainerRef}
                messages={chatMessages}
                sourceAssessments={sourceAssessments}
                onSendMessage={handleSendChatMessage}
                isLoading={isLoading}
                onStopGeneration={handleStopGeneration}
                onRestartGeneration={handleRestartGeneration}
                canRestart={originalQueryForRestart !== null && !isLoading}
                supportsWebSearch={selectedModelConfig?.supportsGoogleSearch ?? false}
              />
            </div>
          </div>

          <footer className="mt-auto pt-3 text-center text-xs text-[#95aac0]/70 flex-shrink-0">
            <p>Reports compiled and contextualized using Language Models. | SIFT Methodology.</p>
          </footer>
      </main>
      {appPhase === AppPhase.CHAT_ACTIVE && (
        <RightSidebar
          llmStatusMessage={llmStatusMessage}
          onGenerateContextReport={() => handleSendChatMessage("ACTION: Generate Context Report", 'generate_context_report')}
          onGenerateCommunityNote={() => handleSendChatMessage("ACTION: Generate Community Note", 'generate_community_note')}
          isLoading={isLoading}
          isGeneratingDossier={isGeneratingDossier}
          onExportDossier={handleExportDossier}
          sourceAssessments={sourceAssessments}
          onSelectSource={setSelectedSourceForModal}
          onSaveSession={handleManualSave}
          saveStatus={saveStatus}
          lastSaveTime={lastSaveTime}
        />
      )}
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
            availableModels={AVAILABLE_PROVIDERS_MODELS}
            selectedModelId={selectedModelId}
            onSelectModelId={setSelectedModelId}
            modelConfigParams={modelConfigParams}
            onModelConfigParamChange={setModelConfigParams}
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