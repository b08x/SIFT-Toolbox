import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatInterface } from './components/ChatInterface.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { AgenticApiService } from './services/agenticApiService.ts';
import { SessionConfigurationView } from './components/SessionConfigurationView.tsx';
import { LiveConversationView } from './components/LiveConversationView.tsx';
import * as SessionManager from './utils/sessionManager.ts';
import { useAppStore } from './store.ts';
import { 
  ReportType, 
  ChatMessage, 
  OriginalQueryInfo, 
  AIProvider, 
  ConfigurableParams,
  SourceAssessment,
  StreamEvent
} from './types.ts';
import { parseSourceAssessmentsFromMarkdown } from './utils/apiHelpers.ts';

export const App = (): React.ReactElement => {
  const [mainView, setMainView] = useState<'config' | 'chat'>('config');
  const [isLiveConversationOpen, setIsLiveConversationOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const store = useAppStore();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [llmStatusMessage, setLlmStatusMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStartSession = useCallback(() => {
    if (!store.sessionTopic.trim()) {
        alert("Please enter a topic for the session.");
        return;
    }
    setMainView('chat');
    // Trigger initial SIFT analysis if messages are empty
    if (store.chatMessages.length === 0) {
        handleSendMessage(store.sessionTopic, undefined, true);
    }
  }, [store.sessionTopic, store.chatMessages.length]);

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
                    
                    // Parse source assessments if it's a full report
                    if (event.isInitialSIFTReport) {
                        const assessments = parseSourceAssessmentsFromMarkdown(event.fullText);
                        const indexedAssessments = assessments.map((a, i) => ({ ...a, index: i + 1 }));
                        store.setSourceAssessments(indexedAssessments);
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

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
  }, []);

  return (
    <div className="min-h-screen bg-main text-main font-sans selection:bg-primary/30">
      {mainView === 'config' ? (
        <div className="max-w-4xl mx-auto py-12 px-4">
          <SessionConfigurationView 
             isApiKeyValid={true} // Gemini key is environmental
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
             onRestoreSession={() => {
                 const saved = SessionManager.loadSession();
                 if (saved) {
                     store.setInitialState(saved);
                     setMainView('chat');
                 }
             }}
             showRestoreButton={SessionManager.hasSavedSession()}
          />
        </div>
      ) : (
        <div className="h-screen flex flex-col">
          <ChatInterface 
             messages={store.chatMessages}
             sourceAssessments={store.sourceAssessments}
             onSendMessage={handleSendMessage}
             isLoading={isLoading}
             onStopGeneration={handleStopGeneration}
             onSourceIndexClick={() => {}}
             onToggleLiveConversation={() => setIsLiveConversationOpen(true)}
             llmStatusMessage={llmStatusMessage}
             saveStatus={saveStatus}
             lastSaveTime={lastSaveTime}
             onSaveSession={handleSaveSession}
          />
        </div>
      )}

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