
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
import { LiveConversationView } from './components/LiveConversationView.tsx';
import * as SessionManager from './utils/sessionManager.ts';
import { useAppStore } from './store.ts';
import { 
  ReportType, 
  ChatMessage, 
  OriginalQueryInfo, 
  AIProvider, 
  SourceAssessment,
} from './types.ts';
import { parseSourceAssessmentsFromMarkdown, checkLinkStatus } from './utils/apiHelpers.ts';

export const App = (): React.ReactElement => {
  const store = useAppStore();
  
  // View State
  const [mainView, setMainView] = useState<'config' | 'chat' | 'about'>('config');
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(window.innerWidth >= 768);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(window.innerWidth >= 1280);
  
  // Modal States
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLiveConversationOpen, setIsLiveConversationOpen] = useState(false);
  const [selectedSourceForModal, setSelectedSourceForModal] = useState<SourceAssessment | null>(null);

  // Operational State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [llmStatusMessage, setLlmStatusMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Initial setup: auto-fetch Gemini models if API key exists
  useEffect(() => {
    const initGeminiModels = async () => {
        const apiKey = process.env.API_KEY;
        if (apiKey) {
            try {
                const models = await AgenticApiService.fetchAvailableModels(AIProvider.GOOGLE_GEMINI, apiKey);
                if (models.length > 0) {
                    store.setAvailableModels(prev => {
                        const filtered = prev.filter(m => m.provider !== AIProvider.GOOGLE_GEMINI);
                        return [...filtered, ...models];
                    });
                }
            } catch (e) {
                console.warn("Auto-fetch Gemini models failed during initialization:", e);
            }
        }
    };
    initGeminiModels();
  }, []);

  const handleSendMessage = useCallback(async (
      text: string, 
      command?: 'another round' | 'read the room' | 'web_search' | 'trace_claim' | 'generate_context_report' | 'generate_community_note' | 'discourse_map' | 'explain_like_im_in_high_school',
      isInitial: boolean = false
  ) => {
    if (isLoading) return;

    const userMsgId = uuidv4();
    const userMsg: ChatMessage = {
        id: userMsgId,
        sender: 'user',
        text: text,
        timestamp: new Date(),
        uploadedFiles: isInitial ? store.sessionFiles : []
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
        modelId: store.selectedModelId
    };
    store.addChatMessage(aiMsg);

    abortControllerRef.current = new AbortController();

    const api = new AgenticApiService(
        store.selectedProviderKey,
        store.selectedModelId,
        store.userApiKeys,
        store.enableGeminiPreprocessing,
        store.availableModels
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
            fullChatHistory: store.chatMessages,
            modelConfigParams: store.modelConfigParams,
            signal: abortControllerRef.current.signal,
            customSystemPrompt: store.customSystemPrompt,
            command: command
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
                        originalQueryReportType: event.originalQueryReportType
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
                    break;
            }
        }
    } catch (e) {
        console.error("Stream error:", e);
        store.updateChatMessage(aiMsgId, { text: "An unexpected connection error occurred.", isError: true, isLoading: false });
    } finally {
        setIsLoading(false);
        setLlmStatusMessage(null);
        handleSaveSession();
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
    // Auto-close sidebar on mobile after starting
    if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
    
    if (store.chatMessages.length === 0) {
        // If topic is empty but files are present, use a generic prompt to start the multimodal analysis
        const initialText = hasTopic 
            ? store.sessionTopic 
            : "Please analyze the attached files using the SIFT methodology and provide a full report.";
        handleSendMessage(initialText, undefined, true);
    }
  }, [store.sessionTopic, store.sessionFiles, store.chatMessages.length, handleSendMessage]);

  const handleSaveSession = useCallback(() => {
    setSaveStatus('saving');
    try {
        SessionManager.saveSession({
            chatMessages: store.chatMessages,
            currentSiftQueryDetails: store.currentSiftQueryDetails,
            originalQueryForRestart: store.originalQueryForRestart,
            sourceAssessments: store.sourceAssessments,
            selectedProviderKey: store.selectedProviderKey,
            selectedModelId: store.selectedModelId,
            modelConfigParams: store.modelConfigParams,
            enableGeminiPreprocessing: store.enableGeminiPreprocessing,
            userApiKeys: store.userApiKeys,
            apiKeyValidation: store.apiKeyValidation,
            customSystemPrompt: store.customSystemPrompt
        });
        setSaveStatus('saved');
        setLastSaveTime(new Date());
    } catch (e) {
        setSaveStatus('error');
    }
  }, [store]);

  const handleNewSession = useCallback(() => {
      if (store.chatMessages.length > 0) {
          if (!window.confirm("Start a new session? Current progress will be saved but cleared from the view.")) return;
      }
      store.resetSession();
      setMainView('config');
      if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
  }, [store]);

  const handleRestoreSession = useCallback(() => {
      const saved = SessionManager.loadSession();
      if (saved) {
          store.setInitialState(saved);
          setMainView('chat');
          if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
      }
  }, [store]);

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
        onOpenSettings={() => {
            setIsSettingsModalOpen(true);
            if (window.innerWidth < 768) setIsLeftSidebarOpen(false);
        }}
        currentView={mainView}
        onOpenConfig={() => handleNavClick('config')}
      />

      {/* Main Workspace */}
      <main className={`flex-grow flex flex-col min-w-0 transition-all duration-300 relative`}>
        {/* Mobile Header Toggle */}
        <div className="md:hidden p-2 border-b border-ui flex justify-between items-center bg-content">
            <button onClick={() => setIsLeftSidebarOpen(true)} className="p-2 text-primary-accent" aria-label="Open sidebar">
                <span className="material-symbols-outlined">menu</span>
            </button>
            <h1 className="font-bold text-primary-accent">SIFT Toolbox</h1>
            <button onClick={() => setIsRightSidebarOpen(true)} className="p-2 text-primary-accent" aria-label="Open sources">
                <span className="material-symbols-outlined">analytics</span>
            </button>
        </div>

        <div className="flex-grow overflow-hidden relative">
            {mainView === 'config' && (
                <div className="h-full overflow-y-auto py-8 px-4 sm:px-8 max-w-4xl mx-auto">
                    <SessionConfigurationView 
                        isApiKeyValid={true}
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
                        showRestoreButton={SessionManager.hasSavedSession()}
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
                    onSourceIndexClick={(idx) => {
                        const source = store.sourceAssessments.find(s => s.index === idx);
                        if (source) setSelectedSourceForModal(source);
                    }}
                    onToggleLiveConversation={() => setIsLiveConversationOpen(true)}
                    llmStatusMessage={llmStatusMessage}
                    saveStatus={saveStatus}
                    lastSaveTime={lastSaveTime}
                    onSaveSession={handleSaveSession}
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
