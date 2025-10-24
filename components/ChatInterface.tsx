import React, { useRef, useEffect, forwardRef } from 'react';
import { ChatMessage, SourceAssessment } from '../types';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatInputArea } from './ChatInputArea';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  sourceAssessments: SourceAssessment[];
  onSendMessage: (messageText: string, command?: 'another round' | 'read the room' | 'web_search') => void;
  isLoading: boolean;
  onStopGeneration?: () => void;
  onRestartGeneration?: () => void; // New prop for restarting
  onSourceIndexClick: (index: number) => void;
  canRestart?: boolean; // New prop to enable/disable restart button
  supportsWebSearch?: boolean;
}

export const ChatInterface = forwardRef<HTMLDivElement, ChatInterfaceProps>(({ messages, sourceAssessments, onSendMessage, isLoading, onStopGeneration, onRestartGeneration, canRestart, supportsWebSearch, onSourceIndexClick }, ref) => {
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
        />
      </div>
    </div>
  );
});