import React, { useRef, useEffect, useState, useMemo, useCallback, forwardRef } from 'react';
import { 
  BookOpen, 
  BookOpenCheck, 
  ArrowLeft, 
  Copy, 
  Check, 
  Printer, 
  ExternalLink,
  ShieldCheck,
  FileText
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, SourceAssessment, CustomCommand, ReportType } from '../types.ts';
import { ChatMessageItem } from './ChatMessageItem.tsx';
import { ChatInputArea } from './ChatInputArea.tsx';
import { SiftStepTracker } from './SiftStepTracker.tsx';
import { useAppStore } from '../store.ts';
import { parseSiftFullCheckReport } from '../utils/apiHelpers.ts';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  sourceAssessments: SourceAssessment[];
  onSendMessage: (messageText: string, command?: 'another round' | 'read the room' | 'web_search' | 'trace_claim' | 'generate_context_report' | 'generate_community_note' | 'discourse_map' | 'explain_like_im_in_high_school' | CustomCommand) => void;
  isLoading: boolean;
  onStopGeneration?: () => void;
  onRestartGeneration?: () => void;
  onRetryMessage?: (messageId: string) => void;
  onSourceIndexClick: (index: number) => void;
  onToggleLiveConversation: () => void;
  canRestart?: boolean;
  supportsWebSearch?: boolean;
  llmStatusMessage: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSaveTime: Date | null;
  onSaveSession: () => void;
  customCommands: CustomCommand[];
  onOpenSettings?: () => void;
  isReaderMode?: boolean;
  onToggleReaderMode?: () => void;
  sessionTopic?: string;
  sessionContext?: string;
}

type ReaderFontSize = 'sm' | 'base' | 'lg';
type ReaderFontFamily = 'sans' | 'serif' | 'mono';

const fontSizeClasses: Record<ReaderFontSize, string> = {
  sm: 'text-sm leading-relaxed',
  base: 'text-base sm:text-lg leading-relaxed',
  lg: 'text-lg sm:text-xl leading-loose',
};

const fontFamilyClasses: Record<ReaderFontFamily, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
};

export const ChatInterface = forwardRef<HTMLDivElement, ChatInterfaceProps>(({ 
    messages, sourceAssessments, onSendMessage, isLoading, onStopGeneration, 
    onRestartGeneration, onRetryMessage, canRestart, supportsWebSearch, onSourceIndexClick,
    onToggleLiveConversation, llmStatusMessage, saveStatus, lastSaveTime, onSaveSession,
    customCommands, onOpenSettings, isReaderMode: propIsReaderMode, onToggleReaderMode,
    sessionTopic, sessionContext
}, ref) => {
  const store = useAppStore();
  const isReader = propIsReaderMode !== undefined ? propIsReaderMode : store.isReaderMode;
  const handleToggleReaderMode = onToggleReaderMode || store.toggleReaderMode;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [readerFontSize, setReaderFontSize] = useState<ReaderFontSize>('base');
  const [readerFontFamily, setReaderFontFamily] = useState<ReaderFontFamily>('sans');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  useEffect(() => {
    if (!isReader) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isReader]);

  // Keyboard shortcut: Press Escape to exit Reader Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isReader) {
        handleToggleReaderMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReader, handleToggleReaderMode]);

  const loadingMessage = messages.find(m => m.isLoading && m.sender === 'ai');

  // Filter messages for reader mode: all generated AI messages containing SIFT report content
  const aiMessages = useMemo(() => {
    return messages.filter(m => m.sender === 'ai' && (m.text.trim() || m.isLoading));
  }, [messages]);

  const initialUserMessage = useMemo(() => {
    return messages.find(m => m.sender === 'user');
  }, [messages]);

  // Calculate approximate word count and reading time
  const readingStats = useMemo(() => {
    const fullText = aiMessages.map(m => m.text).join(' ');
    const words = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return { words, minutes };
  }, [aiMessages]);

  // Copy full clean SIFT report text to clipboard
  const handleCopyReportText = useCallback(async () => {
    const title = sessionTopic || initialUserMessage?.text || "SIFT Investigation Report";
    let content = `# ${title}\n\n`;
    if (sessionContext) content += `> Context: ${sessionContext}\n\n`;
    
    aiMessages.forEach((m, idx) => {
      if (idx > 0) content += `\n\n---\n\n### Follow-up SIFT Analysis (Turn ${idx + 1})\n\n`;
      content += m.text;
    });

    if (sourceAssessments && sourceAssessments.length > 0) {
      content += `\n\n---\n\n### Sources & Reference Assessments\n\n`;
      sourceAssessments.forEach(s => {
        content += `- [${s.index}] ${s.name || s.url}: ${s.url}\n  ${s.assessment || s.notes || ''}\n`;
      });
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2200);
    } catch (err) {
      console.error("Failed to copy report text:", err);
    }
  }, [sessionTopic, sessionContext, initialUserMessage, aiMessages, sourceAssessments]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ==========================================
  // READER MODE VIEW: Stripped metadata & sidebars
  // ==========================================
  if (isReader) {
    return (
      <div className="flex flex-col h-full bg-main overflow-hidden">
        {/* Sticky Reader Toolbar */}
        <header className="shrink-0 px-4 sm:px-8 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-20 flex items-center justify-between flex-wrap gap-2">
          {/* Left: Exit button & Report Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleToggleReaderMode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-border bg-background-secondary hover:bg-border/60 text-text transition-colors shadow-xs cursor-pointer"
              title="Exit Reader Mode and return to chat interface (Esc)"
              aria-label="Exit Reader Mode"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Exit Reader Mode</span>
            </button>

            <div className="h-4 w-px bg-border/60 hidden sm:block"></div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 shrink-0">
                Reader Mode
              </span>
              <h2 className="text-xs sm:text-sm font-semibold text-text truncate max-w-xs md:max-w-md" title={sessionTopic || "SIFT Report"}>
                {sessionTopic || initialUserMessage?.text || "SIFT Analysis Report"}
              </h2>
            </div>
          </div>

          {/* Right: Reading controls & Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Reading Time Badge */}
            {readingStats.words > 0 && (
              <span className="text-[11px] text-text-light font-mono hidden md:inline px-2 py-1 rounded bg-background-secondary border border-border/50">
                {readingStats.words} words • ~{readingStats.minutes} min read
              </span>
            )}

            {/* Font Size Adjuster */}
            <div className="flex items-center border border-border rounded-md bg-background-secondary p-0.5" title="Reading font size">
              <button
                onClick={() => setReaderFontSize('sm')}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${readerFontSize === 'sm' ? 'bg-primary text-white font-bold shadow-xs' : 'text-text-light hover:text-text'}`}
                aria-label="Small font size"
                title="Small text"
              >
                A-
              </button>
              <button
                onClick={() => setReaderFontSize('base')}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${readerFontSize === 'base' ? 'bg-primary text-white font-bold shadow-xs' : 'text-text-light hover:text-text'}`}
                aria-label="Standard font size"
                title="Normal text"
              >
                A
              </button>
              <button
                onClick={() => setReaderFontSize('lg')}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${readerFontSize === 'lg' ? 'bg-primary text-white font-bold shadow-xs' : 'text-text-light hover:text-text'}`}
                aria-label="Large font size"
                title="Large text"
              >
                A+
              </button>
            </div>

            {/* Font Family Switcher */}
            <div className="hidden lg:flex items-center border border-border rounded-md bg-background-secondary p-0.5" title="Font family">
              <button
                onClick={() => setReaderFontFamily('sans')}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${readerFontFamily === 'sans' ? 'bg-primary text-white font-semibold shadow-xs' : 'text-text-light hover:text-text'}`}
              >
                Sans
              </button>
              <button
                onClick={() => setReaderFontFamily('serif')}
                className={`px-2 py-0.5 text-xs rounded transition-colors font-serif ${readerFontFamily === 'serif' ? 'bg-primary text-white font-semibold shadow-xs' : 'text-text-light hover:text-text'}`}
              >
                Serif
              </button>
              <button
                onClick={() => setReaderFontFamily('mono')}
                className={`px-2 py-0.5 text-xs rounded transition-colors font-mono ${readerFontFamily === 'mono' ? 'bg-primary text-white font-semibold shadow-xs' : 'text-text-light hover:text-text'}`}
              >
                Mono
              </button>
            </div>

            {/* Copy Full Clean Report Button */}
            <button
              onClick={handleCopyReportText}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs rounded-md border border-border bg-background-secondary hover:bg-border/60 text-text transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Copy entire clean SIFT report text to clipboard"
              aria-label="Copy report text"
            >
              {copiedReport ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              <span className="hidden sm:inline">{copiedReport ? "Copied" : "Copy Report"}</span>
            </button>

            {/* Print / Save Report Button */}
            <button
              onClick={handlePrint}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs rounded-md border border-border bg-background-secondary hover:bg-border/60 text-text transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Print or save as PDF"
              aria-label="Print report"
            >
              <Printer size={14} />
              <span className="hidden xl:inline">Print</span>
            </button>

            {/* Toggle Reader Mode Button */}
            <button
              onClick={handleToggleReaderMode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-white hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
              title="Exit Reader Mode and return to chat interface"
              aria-label="Exit Reader Mode"
            >
              <BookOpenCheck size={14} />
              <span>Exit Reader</span>
            </button>
          </div>
        </header>

        {/* Reader Document Body */}
        <div ref={ref} className="flex-grow overflow-y-auto px-4 sm:px-8 py-8 sm:py-12">
          <div className={`max-w-3xl mx-auto w-full transition-all ${fontFamilyClasses[readerFontFamily]}`}>
            {aiMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-md mx-auto">
                <div className="w-12 h-12 rounded-full bg-background-secondary border border-border flex items-center justify-center text-primary mb-4 shadow-xs">
                  <BookOpen size={24} />
                </div>
                <h3 className="font-bold text-lg text-text mb-2">No SIFT Report Yet</h3>
                <p className="text-sm text-text-light mb-6 leading-relaxed">
                  Start an investigation or send a claim in the chat to generate a SIFT verification report, then toggle Reader Mode to read it without distractions.
                </p>
                <button
                  onClick={handleToggleReaderMode}
                  className="px-4 py-2 bg-primary text-white rounded-md font-semibold text-xs transition-colors hover:bg-primary/90 cursor-pointer shadow-xs"
                >
                  Return to Chat
                </button>
              </div>
            ) : (
              <div>
                {/* Clean Editorial Document Header */}
                <header className="mb-10 pb-8 border-b border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck size={16} className="text-primary shrink-0" />
                    <span className="text-[11px] font-bold tracking-widest uppercase text-primary">
                      SIFT Investigation Report
                    </span>
                    <span className="text-text-light">•</span>
                    <span className="text-xs text-text-light">
                      {new Date(aiMessages[0].timestamp).toLocaleDateString(undefined, { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-text leading-tight mb-4">
                    {sessionTopic || initialUserMessage?.text?.slice(0, 140) || "SIFT Verification Analysis"}
                  </h1>

                  {sessionContext && (
                    <div className="p-3.5 my-4 rounded-md bg-background-secondary/70 border border-border/80 text-sm text-text italic">
                      <span className="not-italic font-bold text-xs uppercase tracking-wider text-text-light block mb-1">
                        Investigation Context
                      </span>
                      {sessionContext}
                    </div>
                  )}

                  {initialUserMessage?.text && initialUserMessage.text !== sessionTopic && (
                    <div className="mt-3 p-3 rounded-md bg-background-secondary/40 border border-border/50 text-xs sm:text-sm text-text-light">
                      <span className="font-bold text-text uppercase tracking-wider text-[10px] block mb-1">
                        Original Claim Under Review
                      </span>
                      <p className="text-text">{initialUserMessage.text}</p>
                    </div>
                  )}
                </header>

                {/* SIFT Report Content (Stripped of all chat metadata) */}
                <div className="space-y-12">
                  {aiMessages.map((msg, index) => {
                    const isFullCheck = Boolean(
                      msg.isInitialSIFTReport && msg.originalQueryReportType === ReportType.FULL_CHECK
                    );
                    const sections = isFullCheck ? parseSiftFullCheckReport(msg.text) : [];

                    return (
                      <article key={msg.id} className="relative">
                        {index > 0 && (
                          <div className="mb-8 pt-6 border-t border-dashed border-border/80 flex items-center gap-3">
                            <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-background-secondary border border-border text-text">
                              Round {index + 1}: Extended Analysis
                            </span>
                          </div>
                        )}

                        {sections.length > 0 ? (
                          <div className="space-y-8">
                            {sections.map((section, sIdx) => (
                              <section key={sIdx} className="scroll-mt-6">
                                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text pb-2.5 mb-4 border-b border-border/60">
                                  {section.title}
                                </h2>
                                <div className={`markdown-content max-w-none text-text ${fontSizeClasses[readerFontSize]}`}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {section.content}
                                  </ReactMarkdown>
                                </div>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <div className={`markdown-content max-w-none text-text ${fontSizeClasses[readerFontSize]}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.text}
                            </ReactMarkdown>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                {/* Loading indicator if report is still streaming */}
                {isLoading && (
                  <div className="mt-8 pt-4 border-t border-border/40 flex items-center gap-2 text-xs text-text-light">
                    <div className="w-2 h-2 rounded-full bg-primary animate-ping"></div>
                    <span>Streaming and expanding SIFT report in real-time...</span>
                  </div>
                )}

                {/* Sources & References Bibliography */}
                {sourceAssessments && sourceAssessments.length > 0 && (
                  <footer className="mt-14 pt-8 border-t border-border">
                    <div className="flex items-center gap-2 mb-4">
                      <FileText size={16} className="text-primary" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-text">
                        Sources & Reliability Assessments ({sourceAssessments.length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {sourceAssessments.map((source) => (
                        <div 
                          key={source.index} 
                          className="text-xs sm:text-sm p-3.5 rounded-md bg-background-secondary/50 border border-border/60 flex items-start gap-3"
                        >
                          <span className="font-mono font-bold text-primary shrink-0 text-xs mt-0.5">
                            [{source.index}]
                          </span>
                          <div className="flex-grow min-w-0">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-text hover:text-primary underline inline-flex items-center gap-1 truncate max-w-full"
                            >
                              <span>{source.name || source.url}</span>
                              <ExternalLink size={12} className="shrink-0 opacity-70" />
                            </a>
                            {source.rating !== undefined && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold bg-primary/10 text-primary border border-primary/20">
                                Rating: {source.rating}/5
                              </span>
                            )}
                            {(source.assessment || source.notes) && (
                              <p className="text-xs text-text-light mt-1.5 leading-relaxed">
                                {source.assessment || source.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </footer>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Status / Return Bar */}
        <div className="shrink-0 py-2.5 px-6 bg-background/90 backdrop-blur-xs border-t border-border flex items-center justify-between text-xs text-text-light">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-medium text-text">Reader Mode Active</span>
            <span className="hidden sm:inline text-text-light">— Chat metadata and sidebars hidden. Press Esc to exit.</span>
          </div>
          <button
            onClick={handleToggleReaderMode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 font-medium transition-all shadow-xs cursor-pointer text-xs"
          >
            <ArrowLeft size={13} />
            <span>Return to Chat</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // NORMAL CHAT VIEW: Interactive Chat + Top Toolbar with Reader Mode Button
  // ==========================================
  return (
    <div className="flex flex-col h-full bg-main overflow-hidden">
      {/* Top Header Toolbar with Reader Mode Toggle Button */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border/50 bg-background-secondary/30 backdrop-blur-xs flex items-center justify-between z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-text uppercase tracking-wider truncate">
            {sessionTopic || "SIFT Investigation"}
          </span>
          {sessionContext && (
            <span className="text-xs text-text-light truncate hidden sm:inline" title={sessionContext}>
              — {sessionContext}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Reader Mode Toggle Button */}
          <button
            onClick={handleToggleReaderMode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-border bg-background-secondary hover:bg-border/60 hover:text-primary text-text transition-all shadow-xs cursor-pointer"
            title="Toggle Reader Mode: Strips away chat metadata and sidebar elements, focusing only on the generated SIFT report text"
            aria-label="Toggle Reader Mode"
          >
            <BookOpen size={14} className="text-primary shrink-0" />
            <span>Reader Mode</span>
          </button>
        </div>
      </div>

      {/* Chat Messages Area */}
      <div ref={ref} className="flex-grow overflow-y-auto pt-4 pb-4 space-y-2">
        <div className="max-w-4xl mx-auto w-full">
          {messages.map((msg) => (
            <ChatMessageItem 
                key={msg.id} 
                message={msg} 
                sourceAssessments={sourceAssessments} 
                onSourceIndexClick={onSourceIndexClick} 
                onFollowUpClick={(query) => onSendMessage(query)}
                onRetryClick={() => onRetryMessage?.(msg.id)}
                onOpenSettings={onOpenSettings}
                isReaderMode={false}
            />
          ))}
          {isLoading && <SiftStepTracker isLoading={isLoading} streamedText={loadingMessage?.text} />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input Area */}
      <div className="shrink-0 p-4 bg-gradient-to-t from-main via-main to-transparent">
        <ChatInputArea 
            onSendMessage={onSendMessage}
            isLoading={isLoading}
            onStopGeneration={onStopGeneration}
            onRestartGeneration={onRestartGeneration}
            onToggleLiveConversation={onToggleLiveConversation}
            canRestart={canRestart}
            supportsWebSearch={supportsWebSearch}
            llmStatusMessage={llmStatusMessage}
            saveStatus={saveStatus}
            lastSaveTime={lastSaveTime}
            onSaveSession={onSaveSession}
            customCommands={customCommands}
        />
      </div>
    </div>
  );
});
