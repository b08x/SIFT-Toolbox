import React, { useState, KeyboardEvent } from 'react';

interface ChatInputAreaProps {
  onSendMessage: (messageText: string, command?: 'another round' | 'read the room' | 'web_search' | 'trace_claim' | 'generate_context_report' | 'generate_community_note' | 'discourse_map' | 'explain_like_im_in_high_school') => void;
  isLoading: boolean;
  onStopGeneration?: () => void;
  onRestartGeneration?: () => void;
  onToggleLiveConversation: () => void;
  canRestart?: boolean;
  supportsWebSearch?: boolean;
  llmStatusMessage: string | null;
  onSaveSession: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSaveTime: Date | null;
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({ 
    onSendMessage, isLoading, onStopGeneration, onRestartGeneration, onToggleLiveConversation, canRestart, supportsWebSearch,
    llmStatusMessage, onSaveSession, saveStatus, lastSaveTime
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleCommand = (command: 'another round' | 'read the room' | 'web_search' | 'trace_claim' | 'generate_context_report' | 'generate_community_note' | 'discourse_map' | 'explain_like_im_in_high_school') => {
    if (!isLoading) {
      const queryText = inputText.trim() || command.replace(/_/g, ' ');
      onSendMessage(queryText, command); 
      setInputText(''); 
    }
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isLoading) { // Don't send if loading
      event.preventDefault();
      handleSend();
    }
  };

  const renderSaveStatus = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <div className="flex items-center text-xs text-primary-accent">
            <svg className="animate-spin h-3 w-3 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving...
          </div>
        );
      case 'saved':
        return (
          <div className="flex items-center text-xs text-status-success">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {lastSaveTime ? `Saved at ${lastSaveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Session saved.'}
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center text-xs text-status-error">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Error saving.
          </div>
        );
      default: // idle
        return (
            <div className="text-xs text-light/70 italic">
                Auto-saves on change.
            </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          onClick={() => handleCommand('another round')}
          disabled={isLoading}
          className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-label="Send 'another round' command"
        >
          Another Round 🔁
        </button>
        <button
          onClick={() => handleCommand('read the room')}
          disabled={isLoading}
          className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-label="Send 'read the room' command"
        >
          Read the Room 🧐
        </button>
        <button
            onClick={() => handleCommand('trace_claim')}
            disabled={isLoading}
            className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            title="Trace the origin of a claim or piece of media using the gathered sources"
            aria-label="Send 'trace claim' command"
        >
            Trace Claim 👣
        </button>
        <button
          onClick={() => handleCommand('web_search')}
          disabled={isLoading || !supportsWebSearch}
          className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          title={supportsWebSearch ? "Search the web for up-to-date information" : "The selected model does not support web search."}
          aria-label="Send 'web search' command"
        >
          Web Search 🌐
        </button>
         <button
            onClick={() => handleCommand('generate_context_report')}
            disabled={isLoading}
            className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Generate SIFT Context Report based on current chat"
        >
            Context Report 📊
        </button>
        <button
            onClick={() => handleCommand('generate_community_note')}
            disabled={isLoading}
            className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Generate SIFT Community Note based on current chat"
        >
            Community Note 📝
        </button>
        <button
            onClick={() => handleCommand('discourse_map')}
            disabled={isLoading}
            className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Map out the claims, evidence, and participants in this discourse space"
            aria-label="Generate a Discourse Map"
        >
            Discourse Map 🗺️
        </button>
        <button
            onClick={() => handleCommand('explain_like_im_in_high_school')}
            disabled={isLoading}
            className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Explain the current topic in simpler terms"
            aria-label="Explain the topic simply"
        >
            Explain Simply 🧑‍🏫
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="min-h-[44px] p-2 bg-main border border-ui rounded-md flex items-center">
            {isLoading && <span className="status-pulse flex-shrink-0"></span>}
            <span className="flex-grow">
              <span className="font-semibold text-primary-accent">Status: </span>
              {llmStatusMessage ? llmStatusMessage : <span className="italic text-light/70">Idle</span>}
            </span>
          </div>
          <div className="min-h-[44px] p-2 bg-main border border-ui rounded-md flex items-center justify-between">
              <div className="flex-grow pr-2">
                  {renderSaveStatus()}
              </div>
              <button
                  onClick={onSaveSession}
                  disabled={isLoading || saveStatus === 'saving'}
                  className="px-3 py-1.5 text-xs bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                  title="Manually save the current session"
              >
                  Save Now
              </button>
          </div>
      </div>

      <div className="flex items-end space-x-2">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isLoading ? "The model is responding..." : "Type your message or select a command..."}
          className="flex-grow p-3 bg-content border border-ui rounded-lg shadow-sm focus:ring-primary focus:border-primary text-main placeholder-light resize-none disabled:bg-content/80 disabled:cursor-not-allowed"
          rows={Math.min(3, Math.max(1, inputText.split('\n').length))} 
          disabled={isLoading}
          aria-label="Chat message input"
        />
        {canRestart && !isLoading && onRestartGeneration && (
          <button
            onClick={onRestartGeneration}
            className="px-4 py-3 text-on-primary font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main bg-primary hover:brightness-110 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-full flex items-center justify-center"
            aria-label="Restart last generation"
            title="Restart last generation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        )}
        <button
            onClick={onToggleLiveConversation}
            disabled={isLoading}
            className="px-4 py-3 text-on-primary font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main bg-border hover:bg-border-hover focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-full flex items-center justify-center"
            aria-label="Start live conversation"
            title="Start live conversation"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
        </button>
        <button
          onClick={isLoading ? onStopGeneration : handleSend}
          disabled={isLoading ? false : !inputText.trim()}
          className={`px-4 py-3 text-white font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-full flex items-center justify-center
            ${isLoading
              ? 'bg-status-error hover:brightness-110 focus:ring-status-error'
              : 'bg-primary hover:brightness-110 focus:ring-primary text-on-primary'}`}
          aria-label={isLoading ? "Stop generation" : "Send message"}
        >
          {isLoading ? (
            // Stop Icon
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            // Send Icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.949a.75.75 0 00.95.579h1.844a.75.75 0 00.659-.41l1.415-2.452a.75.75 0 00-.24-1.025S4.106 2.29 3.105 2.29zM3.105 2.289L1.691 7.238a.75.75 0 00.95.826h1.844a.75.75 0 00.579-.95L3.654 3.202a.75.75 0 00-1.025-.24S2.29 4.106 2.29 3.105zM14.999 2.525a.75.75 0 00-1.025.24L12.559 6.43a.75.75 0 00.659.41h1.844a.75.75 0 00.95-.579l1.414-4.949a.75.75 0 00-.826-.95L14.999 2.525z" />
              <path d="M16.895 10.532l-2.452-1.415a.75.75 0 00-1.025.24S12.29 10.394 12.29 11.395l1.414 4.949a.75.75 0 00.95.579h1.844a.75.75 0 00.579-.95L15.654 12.082a.75.75 0 00-.24-1.025S16.895 10.532 16.895 10.532zM9.25 12.25a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5z" />
              <path fillRule="evenodd" d="M8.25 5.038a.75.75 0 01.75.712v9.5a.75.75 0 01-.75.75A.75.75 0 017.5 16V5.75a.75.75 0 01.75-.712zM11.75 5.038a.75.75 0 01.75.712v9.5a.75.75 0 01-.75.75a.75.75 0 01-.75-.75V5.75a.75.75 0 01.75-.712z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};