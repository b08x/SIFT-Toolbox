
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatInterface } from './components/ChatInterface.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { AgenticApiService } from './services/agenticApiService.ts';
import { SourceAssessmentModal } from './components/SourceAssessmentModal.tsx';
import { SessionConfigurationView } from './components/SessionConfigurationView.tsx';
import { LeftSidebar } from './components/LeftSidebar.tsx';
import { RightSidebar } from './components/RightSidebar.tsx';
import { AboutContent } from './components/LandingPage.tsx';
import { LearnSiftModal } from './components/LearnSiftModal.tsx';
import { LiveConversationView } from './components/LiveConversationView.tsx';
import { ExportSessionModal } from './components/ExportSessionModal.tsx';
import { RecentSessionsModal } from './components/RecentSessionsModal.tsx';
import * as SessionManager from './utils/sessionManager.ts';
import * as DownloadUtils from './utils/download.ts';
import { useAppStore } from './store.ts';
import { useAuth } from './contexts/AuthContext.tsx';
import { Menu, BarChart3 } from 'lucide-react';
import { SIFT_ICON } from './constants.ts';
import { 
  ReportType, 
  ChatMessage, 
  OriginalQueryInfo, 
  AIProvider, 
  SourceAssessment,
  CustomCommand,
  RecentSessionItem,
  LLMTaskKey,
} from './types.ts';
import { parseSourceAssessmentsFromMarkdown, checkLinkStatus } from './utils/apiHelpers.ts';
import { detectEnvironmentSecrets } from './services/mcpSearchService.ts';
import { isModelSIFTCompliant } from './models.config.ts';
import { marked } from 'marked';

export const App = (): React.ReactElement => {
  const store = useAppStore();
  const { user } = useAuth();
  
  // View State
  const [mainView, setMainView] = useState<'config' | 'chat' | 'about'>('config');
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(window.innerWidth >= 768);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(window.innerWidth >= 1280);
  
  // Modal States
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLiveConversationOpen, setIsLiveConversationOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLearnSiftModalOpen, setIsLearnSiftModalOpen] = useState(false);
  const [isRecentSessionsModalOpen, setIsRecentSessionsModalOpen] = useState(false);
  const [selectedSourceForModal, setSelectedSourceForModal] = useState<SourceAssessment | null>(null);

  // Operational State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [llmStatusMessage, setLlmStatusMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSessionItem[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshRecentSessions = useCallback(async () => {
    try {
      const list = await SessionManager.getRecentSessions(user?.uid);
      setRecentSessions(list);
      setHasSavedSession(list.length > 0);
    } catch (err) {
      console.warn("Failed to refresh recent sessions:", err);
    }
  }, [user?.uid]);

  // Initial setup: auto-detect environment keys, validate them, and pull latest models
  useEffect(() => {
    const initEnvironmentKeysAndModels = async () => {
      const secretsStatus = detectEnvironmentSecrets();

      // Configure Exa MCP search if secret detected
      if (secretsStatus.hasExaSecret && secretsStatus.exaApiKey) {
        store.setMcpSearchConfig(prev => ({
          ...prev,
          apiKey: secretsStatus.exaApiKey || prev.apiKey,
          enabled: true
        }));
      }

      // Check all providers for environment keys
      const detectedEntries = Object.entries(secretsStatus.providerKeys || {})
        .filter(([_, key]) => Boolean(key && (key as string).trim().length > 0)) as [AIProvider, string][];

      if (detectedEntries.length === 0) return;

      // Update store with detected environment keys
      store.setUserApiKeys(prev => {
        const updated = { ...prev };
        // Migrate any previously misassigned OpenRouter keys
        if (updated[AIProvider.OPENAI]?.startsWith('sk-or-v1')) {
          if (!updated[AIProvider.OPENROUTER]) {
            updated[AIProvider.OPENROUTER] = updated[AIProvider.OPENAI];
          }
          delete updated[AIProvider.OPENAI];
        }
        detectedEntries.forEach(([prov, key]) => {
          if (!updated[prov] || updated[prov].trim().length === 0) {
            updated[prov] = key;
          }
        });
        return updated;
      });

      // Auto-validate and pull latest models for each detected provider
      await Promise.all(
        detectedEntries.map(async ([provider, key]) => {
          try {
            // 1. Validate the detected API key
            const validationResult = await AgenticApiService.validateApiKey(provider, key);
            store.setApiKeyValidation(prev => ({
              ...prev,
              [provider]: validationResult.isValid ? 'valid' : 'invalid'
            }));

            // 2. If valid, pull latest models from provider API
            if (validationResult.isValid) {
              const pulledModels = await AgenticApiService.fetchAvailableModels(provider, key);
              const compliantModels = pulledModels || [];

              if (compliantModels.length > 0) {
                store.setAvailableModels(prev => {
                  const filtered = prev.filter(m => m.provider !== provider);
                  return [...filtered, ...compliantModels];
                });

                // If currently active model is unselected
                if (!store.selectedModelId) {
                  if (provider === store.selectedProviderKey || provider === AIProvider.GOOGLE_GEMINI) {
                    store.setSelectedModelId(compliantModels[0].id);
                  }
                }
              }
            }
          } catch (err) {
            console.warn(`[Auto-Init] Validation or model pull failed for ${provider}:`, err);
          }
        })
      );
    };
    initEnvironmentKeysAndModels();
  }, []);

  useEffect(() => {
    refreshRecentSessions();
  }, [refreshRecentSessions]);

  const handleSendMessage = useCallback(async (
      text: string, 
      command?: 'another round' | 'read the room' | 'web_search' | 'trace_claim' | 'generate_context_report' | 'generate_community_note' | 'discourse_map' | 'explain_like_im_in_high_school' | CustomCommand,
      isInitial: boolean = false
  ) => {
    if (isLoading) return;

    // Resolve task-specific model routing and parameters
    const taskKey: LLMTaskKey = isInitial ? 'fact_check' : 'interactive_chat';
    const taskSetting = store.taskModelAssignments?.[taskKey];
    const effectiveProvider = taskSetting?.provider || store.selectedProviderKey;
    const effectiveModelId = taskSetting?.modelId || store.selectedModelId;
    const effectiveParams = taskSetting?.parameters || store.modelConfigParams;

    const queryInfo: OriginalQueryInfo = {
        text: text,
        files: isInitial ? store.sessionFiles : [],
        urls: isInitial ? store.sessionUrls.split('\n').filter(u => u.trim()) : [],
        reportType: ReportType.FULL_CHECK
    };

    const userMsgId = uuidv4();
    const userMsg: ChatMessage = {
        id: userMsgId,
        sender: 'user',
        text: text,
        timestamp: new Date(),
        uploadedFiles: isInitial ? store.sessionFiles : [],
        originalQuery: isInitial ? queryInfo : undefined
    };
    
    store.addChatMessage(userMsg);
    setIsLoading(true);
    setLlmStatusMessage("Preparing analysis...");

    const aiMsgId = uuidv4();
    const aiMsg: ChatMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: '',
        timestamp: new Date(),
        isLoading: true,
        modelId: effectiveModelId
    };
    store.addChatMessage(aiMsg);

    abortControllerRef.current = new AbortController();

    const api = new AgenticApiService(
        effectiveProvider,
        effectiveModelId,
        store.userApiKeys,
        store.enableGeminiPreprocessing,
        store.availableModels,
        store.mcpSearchConfig
    );

    try {
        const stream = api.streamSiftAnalysis({
            isInitialQuery: isInitial,
            query: isInitial ? queryInfo : text,
            fullChatHistory: store.chatMessages,
            modelConfigParams: effectiveParams,
            signal: abortControllerRef.current.signal,
            customSystemPrompt: store.customSystemPrompt,
            command: command,
            mcpSearchConfig: store.mcpSearchConfig,
            sessionTopic: store.sessionTopic,
            sessionContext: store.sessionContext,
            sourceAssessments: store.sourceAssessments,
            sessionUrls: store.sessionUrls
        });

        let fullText = '';
        for await (const event of stream) {
            switch (event.type) {
                case 'status':
                    setLlmStatusMessage(event.message);
                    break;
                case 'chunk':
                    fullText += event.text;
                    store.updateChatMessage(aiMsgId, { text: fullText });
                    break;
                case 'sources':
                    store.updateChatMessage(aiMsgId, { groundingSources: event.sources });
                    break;
                case 'error':
                    store.updateChatMessage(aiMsgId, { text: event.error, isError: true, isLoading: false });
                    setIsLoading(false);
                    setLlmStatusMessage(null);
                    return;
                case 'final':
                    store.updateChatMessage(aiMsgId, { 
                        text: event.fullText, 
                        isLoading: false, 
                        isInitialSIFTReport: event.isInitialSIFTReport,
                        originalQueryReportType: event.originalQueryReportType,
                        modelId: event.modelId || store.selectedModelId
                    });
                    
                    if (event.isInitialSIFTReport) {
                        const assessments = parseSourceAssessmentsFromMarkdown(event.fullText);
                        const indexedAssessments = assessments.map((a, i) => ({ ...a, index: i + 1 }));
                        store.setSourceAssessments(indexedAssessments);
                        
                        // Async check links
                        indexedAssessments.forEach(async (assessment) => {
                            const status = await checkLinkStatus(assessment.url);
                            store.updateSourceAssessments([{ ...assessment, linkValidationStatus: status }]);
                        });
                    }

                    // Generate follow-up queries
                    setLlmStatusMessage("Generating follow-up suggestions...");
                    api.suggestFollowUpQueries(event.fullText).then(queries => {
                        if (queries.length > 0) {
                            store.updateChatMessage(aiMsgId, { followUpQueries: queries });
                        }
                    }).catch(err => console.error("Follow-up error:", err)).finally(() => {
                        setLlmStatusMessage(null);
                        handleSaveSession();
                    });

                    break;
            }
        }
    } catch (e) {
        console.error("Stream error:", e);
        store.updateChatMessage(aiMsgId, { text: "An unexpected connection error occurred.", isError: true, isLoading: false });
    } finally {
        setIsLoading(false);
        // llmStatusMessage is cleared and saveSession is called in the follow-up then block
    }
  }, [store, isLoading]);

  const handleStartSession = useCallback(() => {
    const hasTopic = store.sessionTopic.trim().length > 0;
    const hasFiles = store.sessionFiles.length > 0;

    if (!hasTopic && !hasFiles) {
        alert("Please enter a topic or upload at least one file to begin.");
        return;
    }

    setMainView('chat');
    if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
    
    if (store.chatMessages.length === 0) {
        store.setCurrentSiftQueryDetails({
            sessionTopic: store.sessionTopic,
            sessionContext: store.sessionContext,
            sessionFiles: store.sessionFiles,
            sessionUrls: store.sessionUrls.split('\n').filter(u => u.trim())
        });
        const initialText = hasTopic 
            ? store.sessionTopic 
            : "Please analyze the attached files using the SIFT methodology and provide a full report.";
        handleSendMessage(initialText, undefined, true);
    }
  }, [store.sessionTopic, store.sessionFiles, store.sessionContext, store.sessionUrls, store.chatMessages.length, store.setCurrentSiftQueryDetails, handleSendMessage]);

  const handleSaveSession = useCallback(async () => {
    setSaveStatus('saving');
    try {
        const res = await SessionManager.saveSession({
            sessionId: store.sessionId,
            chatMessages: store.chatMessages,
            sessionTopic: store.sessionTopic,
            sessionContext: store.sessionContext,
            sessionFiles: store.sessionFiles,
            sessionUrls: store.sessionUrls,
            currentSiftQueryDetails: store.currentSiftQueryDetails,
            originalQueryForRestart: store.originalQueryForRestart,
            sourceAssessments: store.sourceAssessments,
            selectedProviderKey: store.selectedProviderKey,
            selectedModelId: store.selectedModelId,
            modelConfigParams: store.modelConfigParams,
            enableGeminiPreprocessing: store.enableGeminiPreprocessing,
            userApiKeys: store.userApiKeys,
            apiKeyValidation: store.apiKeyValidation,
            customSystemPrompt: store.customSystemPrompt,
            customCommands: store.customCommands
        }, user?.uid, store.sessionId);

        if (res && res.sessionId && res.sessionId !== store.sessionId) {
          store.setSessionId(res.sessionId);
        }
        setSaveStatus('saved');
        setLastSaveTime(new Date());
        setHasSavedSession(true);
        refreshRecentSessions();
    } catch (e) {
        console.error("Autosave/save error:", e);
        setSaveStatus('error');
    }
  }, [store, user, refreshRecentSessions]);

  const handleRetryMessage = useCallback(async (messageId: string) => {
    if (isLoading) return;

    const msgIndex = store.chatMessages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const aiMsg = store.chatMessages[msgIndex];
    if (aiMsg.sender !== 'ai') return;

    // Find the preceding user message to get the query
    const historyBefore = store.chatMessages.slice(0, msgIndex);
    const userMsg = historyBefore[historyBefore.length - 1];
    if (!userMsg || userMsg.sender !== 'user') return;

    const text = userMsg.text;
    const isInitial = msgIndex === 1; // Assuming initial query is the first AI message (index 1)

    setIsLoading(true);
    setLlmStatusMessage("Preparing analysis...");

    // Resolve task-specific model routing and parameters
    const taskKey: LLMTaskKey = isInitial ? 'fact_check' : 'interactive_chat';
    const taskSetting = store.taskModelAssignments?.[taskKey];
    const taskProvider = taskSetting?.provider || store.selectedProviderKey;
    const taskModelId = taskSetting?.modelId || store.selectedModelId;
    const taskParams = taskSetting?.parameters || store.modelConfigParams;

    // Reset the AI message
    store.updateChatMessage(messageId, { 
        text: '', 
        isLoading: true, 
        isError: false,
        modelId: taskModelId,
        groundingSources: undefined,
        followUpQueries: undefined
    });

    abortControllerRef.current = new AbortController();

    const api = new AgenticApiService(
        taskProvider,
        taskModelId,
        store.userApiKeys,
        store.enableGeminiPreprocessing,
        store.availableModels,
        store.mcpSearchConfig
    );

    const queryInfo: OriginalQueryInfo = {
        text: text,
        files: isInitial ? store.sessionFiles : [],
        urls: isInitial ? store.sessionUrls.split('\n').filter(u => u.trim()) : [],
        reportType: ReportType.FULL_CHECK
    };

    try {
        const stream = api.streamSiftAnalysis({
            isInitialQuery: isInitial,
            query: isInitial ? queryInfo : text,
            fullChatHistory: historyBefore,
            modelConfigParams: taskParams,
            signal: abortControllerRef.current.signal,
            customSystemPrompt: store.customSystemPrompt,
            mcpSearchConfig: store.mcpSearchConfig,
            sessionTopic: store.sessionTopic,
            sessionContext: store.sessionContext,
            sourceAssessments: store.sourceAssessments,
            sessionUrls: store.sessionUrls
        });

        let fullText = '';
        for await (const event of stream) {
            switch (event.type) {
                case 'status':
                    setLlmStatusMessage(event.message);
                    break;
                case 'chunk':
                    fullText += event.text;
                    store.updateChatMessage(messageId, { text: fullText });
                    break;
                case 'sources':
                    store.updateChatMessage(messageId, { groundingSources: event.sources });
                    break;
                case 'error':
                    store.updateChatMessage(messageId, { text: event.error, isError: true, isLoading: false });
                    setIsLoading(false);
                    setLlmStatusMessage(null);
                    return;
                case 'final':
                    store.updateChatMessage(messageId, { 
                        text: event.fullText, 
                        isLoading: false, 
                        isInitialSIFTReport: event.isInitialSIFTReport,
                        originalQueryReportType: event.originalQueryReportType,
                        modelId: event.modelId || store.selectedModelId
                    });
                    
                    if (event.isInitialSIFTReport) {
                        const assessments = parseSourceAssessmentsFromMarkdown(event.fullText);
                        const indexedAssessments = assessments.map((a, i) => ({ ...a, index: i + 1 }));
                        store.setSourceAssessments(indexedAssessments);
                        
                        // Async check links
                        indexedAssessments.forEach(async (assessment) => {
                            const status = await checkLinkStatus(assessment.url);
                            store.updateSourceAssessments([{ ...assessment, linkValidationStatus: status }]);
                        });
                    }

                    // Generate follow-up queries
                    setLlmStatusMessage("Generating follow-up suggestions...");
                    api.suggestFollowUpQueries(event.fullText).then(queries => {
                        if (queries.length > 0) {
                            store.updateChatMessage(messageId, { followUpQueries: queries });
                        }
                    }).catch(err => console.error("Follow-up error:", err)).finally(() => {
                        setLlmStatusMessage(null);
                        handleSaveSession();
                    });

                    break;
            }
        }
    } catch (e) {
        console.error("Stream error:", e);
        store.updateChatMessage(messageId, { text: "An unexpected connection error occurred.", isError: true, isLoading: false });
    } finally {
        setIsLoading(false);
    }
  }, [store, isLoading, handleSaveSession]);

  // Periodic Autosave
  useEffect(() => {
    const interval = setInterval(() => {
      if (store.chatMessages.length > 0 || store.sessionTopic.trim() || store.sessionFiles.length > 0 || store.sessionUrls.trim()) {
        handleSaveSession();
      }
    }, 20000); // Autosave every 20 seconds
    
    return () => clearInterval(interval);
  }, [handleSaveSession, store.chatMessages.length, store.sessionTopic, store.sessionFiles.length, store.sessionUrls]);

  // Autosave on tab close or background visibility switch
  useEffect(() => {
    const handleAutosave = () => {
      if (store.chatMessages.length > 0 || store.sessionTopic.trim() || store.sessionFiles.length > 0) {
        handleSaveSession();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleAutosave();
      }
    };

    window.addEventListener('beforeunload', handleAutosave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleAutosave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleSaveSession, store.chatMessages.length, store.sessionTopic, store.sessionFiles.length]);

  const handleNewSession = useCallback(async () => {
      if (store.chatMessages.length > 0 || store.sessionTopic.trim() || store.sessionFiles.length > 0) {
          await handleSaveSession();
      }
      store.resetSession();
      setMainView('config');
      refreshRecentSessions();
      if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
  }, [store, handleSaveSession, refreshRecentSessions]);

  const handleRestoreSession = useCallback(async () => {
      const saved = await SessionManager.loadSession(user?.uid);
      if (saved) {
          store.setInitialState(saved);
          if (saved.sessionId) store.setSessionId(saved.sessionId);
          if (saved.chatMessages && saved.chatMessages.length > 0) {
              setMainView('chat');
          } else {
              setMainView('config');
          }
          refreshRecentSessions();
          if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
      }
  }, [store, user, refreshRecentSessions]);

  const handleSelectRecentSession = useCallback(async (sessionId: string) => {
    if ((store.chatMessages.length > 0 || store.sessionTopic.trim()) && store.sessionId !== sessionId) {
      await handleSaveSession();
    }
    const loaded = await SessionManager.loadSessionById(sessionId, user?.uid);
    if (loaded) {
      store.setInitialState(loaded);
      store.setSessionId(sessionId);
      if (loaded.chatMessages && loaded.chatMessages.length > 0) {
        setMainView('chat');
      } else {
        setMainView('config');
      }
      refreshRecentSessions();
      if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
    }
  }, [store, user?.uid, handleSaveSession, refreshRecentSessions]);

  const handleDeleteRecentSession = useCallback(async (sessionId: string) => {
    await SessionManager.deleteRecentSession(sessionId, user?.uid);
    if (store.sessionId === sessionId) {
      store.resetSession();
      setMainView('config');
    }
    refreshRecentSessions();
  }, [store, user?.uid, refreshRecentSessions]);

  const handleClearAllRecentSessions = useCallback(async () => {
    await SessionManager.clearAllRecentSessions(user?.uid);
    store.resetSession();
    setMainView('config');
    setRecentSessions([]);
    setHasSavedSession(false);
  }, [store, user?.uid]);

  const handleExportSession = useCallback((format: 'pdf' | 'md' | 'html' | 'json') => {
    const sessionTopic = store.sessionTopic || "Unnamed Investigation";
    const dateStr = new Date().toISOString().split('T')[0];
    const filenameBase = `SIFT_Session_${sessionTopic.replace(/\s+/g, '_')}_${dateStr}`;

    if (format === 'json') {
      const data = {
        topic: store.sessionTopic,
        context: store.sessionContext,
        timestamp: new Date().toISOString(),
        messages: store.chatMessages,
        sources: store.sourceAssessments
      };
      DownloadUtils.downloadJson(data, `${filenameBase}.json`);
      setIsExportModalOpen(false);
      return;
    }

    // Accumulate Markdown for other formats
    let fullMd = `# SIFT Investigation: ${sessionTopic}\n\n`;
    if (store.sessionContext) fullMd += `**Context:** ${store.sessionContext}\n\n`;
    fullMd += `--- \n\n`;

    store.chatMessages.forEach(msg => {
      const role = msg.sender === 'user' ? 'USER' : 'SIFT ASSISTANT';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      fullMd += `### [${time}] ${role}\n\n`;
      if (msg.sender === 'ai' && msg.modelId) fullMd += `*Model: ${msg.modelId}*\n\n`;
      fullMd += `${msg.text}\n\n`;
      
      if (msg.groundingSources && msg.groundingSources.length > 0) {
        fullMd += `**Sources:**\n`;
        msg.groundingSources.forEach(s => {
          if (s.web) fullMd += `- [${s.web.title || s.web.uri}](${s.web.uri})\n`;
        });
        fullMd += `\n`;
      }
      fullMd += `--- \n\n`;
    });

    if (format === 'md') {
      DownloadUtils.downloadMarkdown(fullMd, `${filenameBase}.md`);
    } else if (format === 'html') {
      const html = marked.parse(fullMd) as string;
      DownloadUtils.downloadHtml(html, `${filenameBase}.html`);
    } else if (format === 'pdf') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        DownloadUtils.downloadPdfWithBrowserPrint(fullMd, `${filenameBase}.pdf`, printWindow);
      } else {
        alert("Pop-up blocked. Please allow pop-ups to export as PDF.");
      }
    }
    
    setIsExportModalOpen(false);
  }, [store.chatMessages, store.sessionTopic, store.sessionContext, store.sourceAssessments]);

  const handleNavClick = useCallback((view: 'config' | 'chat' | 'about') => {
    setMainView(view);
    if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-main text-main font-sans">
      {/* Left Sidebar */}
      <LeftSidebar 
        isOpen={isLeftSidebarOpen}
        onToggle={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
        onNewSession={handleNewSession}
        onOpenAbout={() => handleNavClick('about')}
        onOpenLearnSift={() => setIsLearnSiftModalOpen(true)}
        onOpenSettings={() => {
            setIsSettingsModalOpen(true);
            if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
        }}
        onOpenExport={() => setIsExportModalOpen(true)}
        currentView={mainView}
        onOpenConfig={() => handleNavClick('config')}
        onOpenRecentSessions={() => {
            setIsRecentSessionsModalOpen(true);
            if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
        }}
        recentSessions={recentSessions}
        currentSessionId={store.sessionId}
        onSelectSession={handleSelectRecentSession}
      />

      {/* Main Workspace */}
      <main className={`flex-grow flex flex-col min-w-0 transition-all duration-300 relative`}>
        {/* Mobile Header Toggle */}
        <div className="md:hidden p-4 border-b border-border flex justify-between items-center bg-background-secondary">
            <button onClick={() => setIsLeftSidebarOpen(true)} className="p-1 text-text-light" aria-label="Open sidebar">
                <Menu size={24} />
            </button>
            <div className="flex items-center">
              <span className="text-lg mr-2">{SIFT_ICON}</span>
              <h1 className="font-bold text-text text-sm uppercase tracking-widest">SIFT BOX</h1>
            </div>
            <button onClick={() => setIsRightSidebarOpen(true)} className="p-1 text-text-light" aria-label="Open sources">
                <BarChart3 size={24} />
            </button>
        </div>

        <div className="flex-grow overflow-hidden relative">
            {mainView === 'config' && (
                <div className="h-full overflow-y-auto py-8 px-4 sm:px-8 max-w-4xl mx-auto">
                    <SessionConfigurationView 
                        isApiKeyValid={true}
                        onOpenSettings={() => setIsSettingsModalOpen(true)}
                        onOpenLearnSift={() => setIsLearnSiftModalOpen(true)}
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
                        showRestoreButton={hasSavedSession}
                        recentSessions={recentSessions}
                        onSelectSession={handleSelectRecentSession}
                        onOpenRecentSessions={() => setIsRecentSessionsModalOpen(true)}
                    />
                </div>
            )}

            {mainView === 'chat' && (
                <ChatInterface 
                    messages={store.chatMessages}
                    sourceAssessments={store.sourceAssessments}
                    onSendMessage={handleSendMessage}
                    isLoading={isLoading}
                    onStopGeneration={() => abortControllerRef.current?.abort()}
                    onRetryMessage={handleRetryMessage}
                    onSourceIndexClick={(idx) => {
                        const source = store.sourceAssessments.find(s => s.index === idx);
                        if (source) setSelectedSourceForModal(source);
                    }}
                    onToggleLiveConversation={() => setIsLiveConversationOpen(true)}
                    llmStatusMessage={llmStatusMessage}
                    saveStatus={saveStatus}
                    lastSaveTime={lastSaveTime}
                    onSaveSession={handleSaveSession}
                    customCommands={store.customCommands}
                />
            )}

            {mainView === 'about' && (
                <div className="h-full overflow-y-auto p-4 sm:p-8 max-w-4xl mx-auto">
                    <AboutContent />
                </div>
            )}
        </div>
      </main>

      {/* Right Sidebar (Sources) */}
      {mainView === 'chat' && (
          <RightSidebar 
            isOpen={isRightSidebarOpen}
            onToggle={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            sources={store.sourceAssessments}
            onSelectSource={setSelectedSourceForModal}
          />
      )}

      {/* Modals */}
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
            availableModels={store.availableModels}
            onModelsUpdate={(provider, models) => {
                store.setAvailableModels(prev => {
                    const filtered = prev.filter(m => m.provider !== provider);
                    return [...filtered, ...models];
                });
            }}
            selectedModelId={store.selectedModelId}
            onSelectModelId={store.setSelectedModelId}
            modelConfigParams={store.modelConfigParams}
            onModelConfigParamChange={store.setModelConfigParams}
            customSystemPrompt={store.customSystemPrompt}
            setCustomSystemPrompt={store.setCustomSystemPrompt}
            customCommands={store.customCommands}
            addCustomCommand={store.addCustomCommand}
            updateCustomCommand={store.updateCustomCommand}
            deleteCustomCommand={store.deleteCustomCommand}
            mcpSearchConfig={store.mcpSearchConfig}
            onMcpSearchConfigChange={store.setMcpSearchConfig}
            taskModelAssignments={store.taskModelAssignments}
            onTaskModelAssignmentsChange={store.setTaskModelAssignments}
            onUpdateTaskAssignment={store.updateTaskAssignment}
            onUpdateTaskParameters={store.updateTaskParameters}
            onApplyModelToAllTasks={store.applyModelToAllTasks}
          />
      )}

      {isExportModalOpen && (
          <ExportSessionModal 
            onClose={() => setIsExportModalOpen(false)}
            onExport={handleExportSession}
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

      {isLearnSiftModalOpen && (
          <LearnSiftModal
            isOpen={isLearnSiftModalOpen}
            onClose={() => setIsLearnSiftModalOpen(false)}
          />
      )}

      {isRecentSessionsModalOpen && (
          <RecentSessionsModal 
            isOpen={isRecentSessionsModalOpen}
            onClose={() => setIsRecentSessionsModalOpen(false)}
            sessions={recentSessions}
            currentSessionId={store.sessionId}
            onSelectSession={handleSelectRecentSession}
            onDeleteSession={handleDeleteRecentSession}
            onClearAllSessions={handleClearAllRecentSessions}
            onNewSession={handleNewSession}
          />
      )}
    </div>
  );
};
