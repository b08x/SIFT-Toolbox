import React, { useRef, useEffect, forwardRef } from 'react';
import { ChatMessage, SourceAssessment } from '../types.ts';
import { ChatMessageItem } from './ChatMessageItem.tsx';
import { ChatInputArea } from './ChatInputArea.tsx';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  sourceAssessments: SourceAssessment[];
  onSendMessage: (messageText: string, command?: 'another round' | 'read the room' | 'web_search' | 'trace_claim' | 'generate_context_report' | 'generate_community_note') => void;
  isLoading: boolean;
  onStopGeneration?: () => void;
  onRestartGeneration?: () => void; // New prop for restarting
  onSourceIndexClick: (index: number) => void;
  canRestart?: boolean; // New prop to enable/disable restart button
  supportsWebSearch?: boolean;
  llmStatusMessage: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSaveTime: Date | null;
  onSaveSession: () => void;
}

export const ChatInterface = forwardRef<HTMLDivElement, ChatInterfaceProps>(({ 
    messages, sourceAssessments, onSendMessage, isLoading, onStopGeneration, 
    onRestartGeneration, canRestart, supportsWebSearch, onSourceIndexClick,
    llmStatusMessage, saveStatus, lastSaveTime, onSaveSession
}, ref) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-main shadow-2xl rounded-xl overflow-hidden">
      {/* Chat Messages Area */}
      <div ref={ref} className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg) => (
          <ChatMessageItem key={msg.id} message={msg} sourceAssessments={sourceAssessments} onSourceIndexClick={onSourceIndexClick} />
        ))}
        <div ref={messagesEndRef} /> {/* For auto-scrolling */}
      </div>

      {/* Chat Input Area */}
      <div className="shrink-0 p-3 sm:p-4 border-t border-ui bg-main">
        <ChatInputArea 
            onSendMessage={onSendMessage}
            isLoading={isLoading}
            onStopGeneration={onStopGeneration}
            onRestartGeneration={onRestartGeneration}
            canRestart={canRestart}
            supportsWebSearch={supportsWebSearch}
            llmStatusMessage={llmStatusMessage}
            saveStatus={saveStatus}
            lastSaveTime={lastSaveTime}
            onSaveSession={onSaveSession}
        />
      </div>
    </div>
  );
});