

import React, { useState, KeyboardEvent } from 'react';

interface ChatInputAreaProps {
  onSendMessage: (messageText: string, command?: 'another round' | 'read the room') => void;
  isLoading: boolean;
  onStopGeneration?: () => void;
  onRestartGeneration?: () => void;
  canRestart?: boolean;
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({ onSendMessage, isLoading, onStopGeneration, onRestartGeneration, canRestart }) => {
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleCommand = (command: 'another round' | 'read the room') => {
    if (!isLoading) {
      onSendMessage(command, command); 
      setInputText(''); 
    }
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isLoading) { // Don't send if loading
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end space-x-2">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isLoading ? "The model is responding..." : "Type your message or select a command..."}
          className="flex-grow p-3 bg-[#333e48] border border-[#5c6f7e] rounded-lg shadow-sm focus:ring-[#e2a32d] focus:border-[#e2a32d] text-gray-200 placeholder-[#95aac0]/70 resize-none scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48] disabled:bg-[#2b3541] disabled:cursor-not-allowed"
          rows={Math.min(3, Math.max(1, inputText.split('\n').length))} 
          disabled={isLoading}
          aria-label="Chat message input"
        />
        {canRestart && !isLoading && onRestartGeneration && (
          <button
            onClick={onRestartGeneration}
            className="px-4 py-3 text-white font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212934] bg-[#e2a32d] hover:bg-[#f5b132] focus:ring-[#f5b132] disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-full flex items-center justify-center"
            aria-label="Restart last generation"
            title="Restart last generation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        )}
        <button
          onClick={isLoading ? onStopGeneration : handleSend}
          disabled={isLoading ? false : !inputText.trim()}
          className={`px-4 py-3 text-white font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212934] disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-full flex items-center justify-center
            ${isLoading
              ? 'bg-red-600 hover:bg-red-500 focus:ring-red-500'
              : 'bg-[#c36e26] hover:bg-[#d67e2a] focus:ring-[#d67e2a]'}`}
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
      <div className="flex space-x-2">
        <button
          onClick={() => handleCommand('another round')}
          disabled={isLoading} // Disable command buttons while AI is responding
          className="flex-1 px-3 py-2 text-sm bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212934] focus:ring-[#95aac0] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-label="Send 'another round' command"
        >
          Another Round 🔁
        </button>
        <button
          onClick={() => handleCommand('read the room')}
          disabled={isLoading} // Disable command buttons while AI is responding
          className="flex-1 px-3 py-2 text-sm bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212934] focus:ring-[#95aac0] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-label="Send 'read the room' command"
        >
          Read the Room 🧐
        </button>
      </div>
    </div>
  );
};