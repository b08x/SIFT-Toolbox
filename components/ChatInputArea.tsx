import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { CustomCommand } from '../types.ts';
import { 
  SendHorizontal, 
  Mic, 
  Globe, 
  RotateCcw, 
  Square, 
  Save, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Zap,
  Sparkles
} from 'lucide-react';

interface ChatInputAreaProps {
  onSendMessage: (messageText: string, command?: 'another round' | 'read the room' | 'web_search' | 'trace_claim' | 'generate_context_report' | 'generate_community_note' | 'discourse_map' | 'explain_like_im_in_high_school' | CustomCommand) => void;
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
  customCommands: CustomCommand[];
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({ 
    onSendMessage, isLoading, onStopGeneration, onRestartGeneration, onToggleLiveConversation, canRestart, supportsWebSearch,
    llmStatusMessage, onSaveSession, saveStatus, lastSaveTime, customCommands
}) => {
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(200, textareaRef.current.scrollHeight)}px`;
    }
  }, [inputText]);

  const handleSend = () => {
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleCommand = (command: 'another round' | 'read the room' | 'web_search' | 'trace_claim' | 'generate_context_report' | 'generate_community_note' | 'discourse_map' | 'explain_like_im_in_high_school' | CustomCommand) => {
    if (!isLoading) {
      let queryText = inputText.trim();
      if (!queryText) {
        if (typeof command === 'string') {
          queryText = command.replace(/_/g, ' ');
        } else {
          queryText = command.name;
        }
      }
      onSendMessage(queryText, command); 
      setInputText(''); 
    }
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isLoading) {
      event.preventDefault();
      handleSend();
    }
  };

  const renderSaveStatus = () => {
    switch (saveStatus) {
      case 'saving':
        return <div className="flex items-center text-[10px] text-primary"><Loader2 size={10} className="animate-spin mr-1" /> SAVING</div>;
      case 'saved':
        return <div className="flex items-center text-[10px] text-status-success"><CheckCircle2 size={10} className="mr-1" /> {lastSaveTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>;
      case 'error':
        return <div className="flex items-center text-[10px] text-status-error"><AlertCircle size={10} className="mr-1" /> ERROR</div>;
      default:
        return <div className="text-[10px] text-text-light/50">AUTO-SAVING</div>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-4 pb-6 px-4">
      <div className="flex flex-wrap gap-2 justify-center">
        <CommandButton onClick={() => handleCommand('web_search')} disabled={isLoading || !supportsWebSearch} icon={<Globe size={14} />} label="Web Search" />
        <CommandButton onClick={() => handleCommand('read the room')} disabled={isLoading} label="Read Room" />
        <CommandButton onClick={() => handleCommand('trace_claim')} disabled={isLoading} label="Trace Claim" />
        <CommandButton onClick={() => handleCommand('another round')} disabled={isLoading} label="Another Round" />
        {customCommands.slice(0, 2).map(cmd => (
            <CommandButton key={cmd.id} onClick={() => handleCommand(cmd)} disabled={isLoading} icon={<Sparkles size={14} />} label={cmd.name} />
        ))}
      </div>

      <div className="relative bg-background-secondary border border-border rounded-2xl shadow-sm focus-within:border-primary/50 transition-all">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isLoading ? "Analyzing..." : "Ask follow-up questions..."}
          className="w-full p-4 pr-32 bg-transparent text-text placeholder-text-light/50 resize-none outline-none min-h-[56px] max-h-[200px]"
          rows={1}
          disabled={isLoading}
        />
        
        <div className="absolute right-2 bottom-2 flex items-center space-x-1">
          <button
            onClick={onToggleLiveConversation}
            disabled={isLoading}
            className="p-2 text-text-light hover:text-text hover:bg-border/50 rounded-xl transition-colors disabled:opacity-30"
            title="Voice Conversation"
          >
            <Mic size={20} />
          </button>
          
          {canRestart && !isLoading && onRestartGeneration && (
            <button
              onClick={onRestartGeneration}
              className="p-2 text-text-light hover:text-text hover:bg-border/50 rounded-xl transition-colors"
              title="Regenerate"
            >
              <RotateCcw size={20} />
            </button>
          )}

          <button
            onClick={isLoading ? onStopGeneration : handleSend}
            disabled={!isLoading && !inputText.trim()}
            className={`p-2 rounded-xl transition-all ${
                isLoading 
                ? 'text-status-error hover:bg-status-error/10' 
                : 'text-primary hover:bg-primary/10 disabled:opacity-30'
            }`}
          >
            {isLoading ? <Square size={20} fill="currentColor" /> : <SendHorizontal size={20} />}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center px-2">
        <div className="flex items-center space-x-3 text-[11px] text-text-light/70 tracking-tight">
          <div className="flex items-center">
            <div className={`w-1.5 h-1.5 rounded-full mr-2 ${isLoading ? 'bg-primary animate-pulse' : 'bg-status-success'}`}></div>
            <span>{llmStatusMessage || (isLoading ? 'SIFTing...' : 'Ready')}</span>
          </div>
          {renderSaveStatus()}
        </div>
        
        <button 
          onClick={onSaveSession}
          disabled={isLoading || saveStatus === 'saving'}
          className="text-[11px] text-text-light hover:text-text flex items-center transition-colors disabled:opacity-30 uppercase font-bold tracking-tighter"
        >
          <Save size={12} className="mr-1" /> Save
        </button>
      </div>
    </div>
  );
};

const CommandButton: React.FC<{ 
    onClick: () => void; 
    disabled: boolean; 
    icon?: React.ReactNode; 
    label: string; 
    title?: string;
}> = ({ onClick, disabled, icon, label, title }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className="flex items-center px-3 py-1.5 bg-background-secondary border border-border text-text-light text-xs font-medium rounded-full hover:bg-border/50 hover:text-text transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
        {icon && <span className="mr-1.5">{icon}</span>}
        {label}
    </button>
);