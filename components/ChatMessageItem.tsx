import React, { useMemo, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { marked } from 'marked';
import { RotateCcw, Sparkles, SlidersHorizontal, AlertCircle } from 'lucide-react';
import { ChatMessage, GroundingChunk, ReportType, ParsedReportSection, UploadedFile, SourceAssessment, LLMTaskKey } from '../types.ts';
import { SIFT_ICON } from '../constants.ts'; 
import { downloadMarkdown } from '../utils/download.ts';
import { parseSiftFullCheckReport, transformMarkdownForSubstack } from '../utils/apiHelpers.ts';
import { CollapsibleReport } from './CollapsibleReport.tsx';
import { useAppStore } from '../store.ts';

interface ChatMessageItemProps {
  message: ChatMessage;
  sourceAssessments: SourceAssessment[];
  onSourceIndexClick: (index: number) => void;
  onFollowUpClick?: (query: string) => void;
  onRetryClick?: () => void;
  onOpenSettings?: () => void;
}

const FilePreview: React.FC<{ file: UploadedFile }> = ({ file }) => {
    const fileType = file.type.split('/')[0];
    const isImage = fileType === 'image' && file.base64Data;
    const isVideo = fileType === 'video' && file.base64Data;

    return (
        <div className="relative group w-24 h-24 bg-main rounded-md overflow-hidden border border-ui flex items-center justify-center">
            {isImage && <img src={file.base64Data} alt={file.name} className="w-full h-full object-cover" />}
            {isVideo && <video src={file.base64Data} className="w-full h-full object-cover" />}
            {!isImage && !isVideo && (
                <div className="flex flex-col items-center text-center p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs text-light mt-1 break-all line-clamp-2">{file.name}</span>
                </div>
            )}
             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                <p className="text-main text-xs text-center line-clamp-3" title={file.name}>{file.name}</p>
            </div>
        </div>
    );
};

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ 
  message, 
  sourceAssessments, 
  onSourceIndexClick, 
  onFollowUpClick, 
  onRetryClick,
  onOpenSettings 
}) => {
  const { sender, text, timestamp, isLoading, isError, groundingSources, uploadedFiles, modelId, isInitialSIFTReport, originalQueryReportType, isFromCache, structuredData, followUpQueries } = message;
  const isUser = sender === 'user';
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);

  const store = useAppStore();

  const isInitial = Boolean(isInitialSIFTReport || message.id === store.chatMessages[1]?.id);
  const taskKey: LLMTaskKey = isInitial ? 'fact_check' : 'interactive_chat';
  const taskSetting = store.taskModelAssignments?.[taskKey];
  const currentProvider = taskSetting?.provider || store.selectedProviderKey;
  const currentModelId = taskSetting?.modelId || store.selectedModelId;
  const currentParams = taskSetting?.parameters || store.modelConfigParams;

  const currentModelObj = useMemo(() => {
    return store.availableModels.find(m => m.id === currentModelId);
  }, [store.availableModels, currentModelId]);
  const friendlyCurrentModelName = currentModelObj?.name || currentModelId?.split('/').pop()?.split(':').shift() || currentModelId;

  const originalModelId = message.appliedConfig?.modelId || modelId;
  const originalModelObj = useMemo(() => {
    return store.availableModels.find(m => m.id === originalModelId);
  }, [store.availableModels, originalModelId]);
  const friendlyOriginalModelName = originalModelObj?.name || originalModelId?.split('/').pop()?.split(':').shift() || originalModelId;

  // Determine if active configuration changed since this message was generated
  const configDiff = useMemo(() => {
    if (isUser) return null;
    const diffs: string[] = [];
    if (originalModelId && currentModelId && originalModelId !== currentModelId) {
      diffs.push(`Model: ${friendlyOriginalModelName} → ${friendlyCurrentModelName}`);
    }
    const origProvider = message.appliedConfig?.provider;
    if (origProvider && currentProvider && origProvider !== currentProvider) {
      diffs.push(`Provider: ${origProvider} → ${currentProvider}`);
    }
    if (message.appliedConfig?.temperature !== undefined && currentParams?.temperature !== undefined) {
      const origTemp = Number(message.appliedConfig.temperature);
      const curTemp = Number(currentParams.temperature);
      if (Math.abs(origTemp - curTemp) > 0.01) {
        diffs.push(`Temp: ${origTemp} → ${curTemp}`);
      }
    }
    return diffs.length > 0 ? diffs : null;
  }, [isUser, originalModelId, currentModelId, friendlyOriginalModelName, friendlyCurrentModelName, message.appliedConfig, currentProvider, currentParams]);

  const urlToIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!sourceAssessments || sourceAssessments.length === 0) return map;
    sourceAssessments.forEach(a => {
        if (a.url) map.set(a.url.trim(), a.index);
    });
    return map;
  }, [sourceAssessments]);

  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(event.target as Node)) {
        setShowCopyMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [copyMenuRef]);

  const handleReadAloud = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      // Basic text extraction from markdown, can be refined further if needed
      const plainText = text.replace(/[#*_\[\]()>]/g, '');
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleCopy = async (format: 'text' | 'substack') => {
    setShowCopyMenu(false); // Close menu after click
    if (format === 'text') {
        navigator.clipboard.writeText(text)
          .then(() => alert('Message content copied to clipboard!'))
          .catch(err => console.error('Failed to copy message: ', err));
    } else if (format === 'substack') {
        const substackMarkdown = transformMarkdownForSubstack(text);
        const htmlContent = marked.parse(substackMarkdown) as string;
        try {
            // Using the Clipboard API to write HTML
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const clipboardItem = new (window as any).ClipboardItem({ 'text/html': blob });
            await navigator.clipboard.write([clipboardItem]);
            alert('Message content copied for Substack (HTML)!');
        } catch (err) {
            console.error('Failed to copy as HTML: ', err);
            alert('Failed to copy as HTML. Your browser might not support this feature.');
        }
    }
  };

  const handleExportReport = () => {
    if (!isInitialSIFTReport || !originalQueryReportType || !text) return;

    const reportDate = new Date(timestamp);
    const displayDate = reportDate.toLocaleString();
    const filenameDate = reportDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const reportTypeSanitized = originalQueryReportType.replace(/\s+/g, '_');
    const filename = `SIFT_Report_${reportTypeSanitized}_${filenameDate}.md`;

    let groundingSourcesText = '**Grounding Sources:** N/A';
    if (groundingSources && groundingSources.length > 0) {
        const sourcesList = groundingSources
            .filter(s => s.web && s.web.uri)
            .map(s => `  - [${s.web?.title || s.web?.uri}](${s.web?.uri})`)
            .join('\n');
        if (sourcesList) {
            groundingSourcesText = `**Grounding Sources:**\n${sourcesList}`;
        }
    }
    
    const metadataHeader = `\
# SIFT Report Export

**Generated:** ${displayDate}
**Report Type:** ${originalQueryReportType}
**Model Used:** ${modelId || 'N/A'}
${isFromCache ? '**Note:** This report was loaded from local cache.\\n' : ''}\
${groundingSourcesText}
---

`;
    // We export the original text, without the injected UI indices
    const fullMarkdownContent = metadataHeader + text;

    downloadMarkdown(fullMarkdownContent, filename);
  };


  const renderContent = (): React.ReactElement | null => {
    if (isInitialSIFTReport && originalQueryReportType === ReportType.FULL_CHECK && !isLoading && !isError) {
      const parsedSections = parseSiftFullCheckReport(text);
      if (parsedSections.length > 0) {
        return <CollapsibleReport sections={parsedSections} reasoning={message.reasoning} />;
      }
    }
    
    if (text.trim() || isLoading) { 
      return (
        <div className="markdown-content prose-sm sm:prose-base max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                a: ({ node, ...props }) => {
                    const url = props.href?.trim();
                    const sourceIndex = url ? urlToIndexMap.get(url) : undefined;
                    
                    if (sourceIndex) {
                        return (
                            <React.Fragment>
                                <a {...props} />
                                <sup className="source-index">
                                    <button
                                        onClick={() => onSourceIndexClick(sourceIndex)}
                                        title={`Go to source assessment #${sourceIndex}`}
                                        className="source-index-button"
                                    >
                                        [{sourceIndex}]
                                    </button>
                                </sup>
                            </React.Fragment>
                        );
                    }
                    return <a {...props} />;
                },
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      );
    }
    
    if (isUser && (!uploadedFiles || uploadedFiles.length === 0)) {
        return <p className="text-sm italic text-status-warning">(Empty message)</p>;
    }

    return null; 
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6 px-2 sm:px-4 group`}>
      <div
        className={`rounded-2xl transition-all ${
          isUser
            ? 'max-w-[85%] sm:max-w-[75%] bg-background-secondary border border-border px-4 py-3 shadow-xs'
            : 'w-full max-w-full bg-background/60 dark:bg-background-secondary/40 border border-border/80 p-4 sm:p-5 shadow-xs'
        } ${
          isError ? 'border-status-error/50 bg-status-error/5 text-status-error' : ''
        }`}
      >
        {!isUser && (
          <div className="flex items-start">
            <div className="w-8 h-8 rounded-full bg-background-secondary border border-border flex items-center justify-center mr-3 flex-shrink-0 text-sm shadow-xs">
              {SIFT_ICON}
            </div>
            <div className="flex-grow min-w-0">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2 pb-2.5 border-b border-border/40">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="font-semibold text-sm mr-1">
                    Assistant
                  </span>
                  {isFromCache && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium" title="Loaded from local cache">
                      CACHED
                    </span>
                  )}
                  {friendlyOriginalModelName && (
                    <span className="text-[10px] text-text-light px-2 py-0.5 rounded-md bg-background-secondary border border-border tracking-wider font-mono" title={`Generated with: ${originalModelId}`}>
                      {friendlyOriginalModelName}
                    </span>
                  )}
                  {configDiff && (
                    <span 
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                      title={`Configuration updated mid-chat:\n${configDiff.join('\n')}\nClick Retry to re-run with current settings.`}
                    >
                      <Sparkles size={11} className="text-amber-500 shrink-0" />
                      <span>Config updated: {friendlyCurrentModelName}</span>
                    </span>
                  )}
                </div>

                {!isLoading && onRetryClick && (
                  <div className="flex items-center gap-1.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={onRetryClick}
                      title={`Retry model output with current config (${friendlyCurrentModelName}${currentParams?.temperature !== undefined ? `, temp: ${currentParams.temperature}` : ''})`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all shadow-xs ${
                        configDiff 
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30' 
                          : 'bg-background-secondary border-border hover:bg-border/60 text-text hover:text-primary'
                      }`}
                      aria-label="Retry model output with current configuration"
                    >
                      <RotateCcw size={11} className={isLoading ? "animate-spin" : ""} />
                      <span>Retry</span>
                      {configDiff && <span className="text-[10px] font-bold">({friendlyCurrentModelName})</span>}
                    </button>
                    {onOpenSettings && (
                      <button
                        onClick={onOpenSettings}
                        title="Adjust model or parameters mid-chat"
                        className="p-1 rounded-lg border border-transparent hover:border-border text-text-light hover:text-text hover:bg-background-secondary transition-colors"
                        aria-label="Adjust model settings"
                      >
                        <SlidersHorizontal size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {isLoading && (
                <div className="thinking-chip">
                  <div className="thinking-dot"></div>
                  <span>Thinking...</span>
                </div>
              )}

              {renderContent()}
            </div>
          </div>
        )}
        
        {isUser && (
          <div>
            {uploadedFiles && uploadedFiles.length > 0 && (
                <div className="mb-3 grid grid-cols-2 gap-2">
                    {uploadedFiles.map((file, index) => (
                        <FilePreview key={index} file={file} />
                    ))}
                </div>
            )}
            <div className="text-[15px] leading-relaxed">
              {renderContent()}
            </div>
          </div>
        )}

        {isError && !isLoading && (
          <div className="mt-3 p-3.5 rounded-xl border border-status-error/30 bg-status-error/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start text-xs text-status-error font-medium">
              <AlertCircle size={16} className="mr-2 shrink-0 mt-0.5 text-status-error" />
              <div>
                <p className="font-semibold">Model generation was interrupted or failed.</p>
                <p className="text-text-light text-[11px] mt-0.5">
                  {configDiff ? `Ready to retry with updated configuration (${friendlyCurrentModelName}).` : `Retry using current settings (${friendlyCurrentModelName})?`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-background text-text hover:bg-border/60 transition-colors flex items-center"
                >
                  <SlidersHorizontal size={12} className="mr-1.5 text-text-light" />
                  Settings
                </button>
              )}
              {onRetryClick && (
                <button
                  onClick={onRetryClick}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition-all flex items-center shadow-xs"
                >
                  <RotateCcw size={12} className="mr-1.5" />
                  Retry with {friendlyCurrentModelName}
                </button>
              )}
            </div>
          </div>
        )}

        {groundingSources && groundingSources.length > 0 && !isLoading && !isError && (
          <div className={`mt-3 pt-2 border-t ${isUser ? 'border-black/20' : 'border-ui'}`}>
            <h4 className={`text-xs font-semibold mb-1 ${isUser ? 'text-on-primary' : 'text-primary-accent'}`}>Grounding Sources:</h4>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              {groundingSources.map((source, index) => (
                source.web && (
                  <li key={index} className={isUser ? "text-on-primary" : 'text-light'}>
                    <a 
                      href={source.web.uri} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      title={source.web.title || source.web.uri}
                      className={`${isUser ? "text-on-primary hover:brightness-125" : "text-primary-accent hover:brightness-125"} hover:underline`}
                    >
                      {source.web.title || source.web.uri}
                    </a>
                  </li>
                )
              ))}
            </ul>
          </div>
        )}
        
        {structuredData && !isLoading && !isError && (
          <div className="mt-3 pt-2 border-t border-ui">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-border text-primary-accent">
              📊 Structured Data Attached
            </span>
          </div>
        )}

        {!isUser && isInitialSIFTReport && !isLoading && !isError && text.trim() && (
          <div className="mt-3 pt-3 border-t border-ui">
            <button
              onClick={handleExportReport}
              className="bg-border hover:bg-border-hover text-main focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-content ring-text-light inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md shadow-sm transition-colors"
              aria-label="Export SIFT report as Markdown"
              title="Export SIFT report as Markdown"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export Report
            </button>
          </div>
        )}
        
        {followUpQueries && followUpQueries.length > 0 && !isLoading && !isError && (
            <div className="mt-4 pt-3 border-t border-ui">
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Deep Dive Queries</p>
                <div className="flex flex-wrap gap-2">
                    {followUpQueries.map((query, index) => (
                        <button
                            key={index}
                            onClick={() => onFollowUpClick && onFollowUpClick(query)}
                            className="bg-primary/5 hover:bg-primary/15 text-primary border border-primary/20 hover:border-primary/40 px-3 py-1.5 text-xs font-medium rounded-full shadow-sm transition-all flex items-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 mr-1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                            {query}
                        </button>
                    ))}
                </div>
            </div>
        )}
        
        <div className="flex justify-between items-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <p className={`text-xs ${isUser ? 'text-on-primary' : 'text-light/70'}`}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {!isLoading && text.trim() && (
                <div className="flex items-center space-x-1">
                    <button
                        onClick={handleReadAloud}
                        title={isSpeaking ? "Stop speaking" : "Read aloud"}
                        className={`p-1 rounded ${isUser ? 'text-on-primary hover:bg-black/20' : 'text-light hover:bg-border'}`}
                        aria-label={isSpeaking ? "Stop speaking" : "Read aloud"}
                    >
                        {isSpeaking ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            </svg>
                        )}
                    </button>
                    <div ref={copyMenuRef} className="relative">
                        <button
                            onClick={() => setShowCopyMenu(prev => !prev)}
                            title="Copy options"
                            className={`p-1 rounded ${isUser ? 'text-on-primary hover:bg-black/20' : 'text-light hover:bg-border'}`}
                            aria-haspopup="true"
                            aria-expanded={showCopyMenu}
                            aria-label="Copy message options"
                        >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 4.625-2.25-2.25m0 0L15.75 12m2.25 2.25L15.75 12M9 11.25h6M9 13.5h3.75m-3.75 2.25h1.5m1.5 0h1.5" />
                            </svg>
                        </button>
                        {showCopyMenu && (
                            <div className="absolute bottom-full right-0 mb-2 w-48 bg-content border border-ui rounded-md shadow-lg z-20 py-1">
                                <button onClick={() => handleCopy('text')} className="flex items-center w-full text-left px-3 py-1.5 text-sm text-main hover:bg-border">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                                    Copy as Plain Text
                                </button>
                                <button onClick={() => handleCopy('substack')} className="flex items-center w-full text-left px-3 py-1.5 text-sm text-main hover:bg-border">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9.75 6.75h9.75c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v10.25c0 .621.504 1.125 1.125 1.125z" /></svg>
                                    Copy for Substack (HTML)
                                </button>
                            </div>
                        )}
                    </div>
                    {!isUser && onRetryClick && (
                        <button
                            onClick={onRetryClick}
                            title={`Retry model output with current config (${friendlyCurrentModelName}${currentParams?.temperature !== undefined ? `, temp: ${currentParams.temperature}` : ''})`}
                            className={`p-1.5 rounded-md ${
                                configDiff 
                                    ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-medium' 
                                    : 'text-text-light hover:text-text hover:bg-border'
                            } ml-1 inline-flex items-center gap-1.5 text-xs transition-colors`}
                            aria-label="Retry model output"
                        >
                            <RotateCcw size={12} />
                            <span className="hidden sm:inline">Retry</span>
                            {configDiff && <span className="text-[10px] hidden md:inline font-bold">({friendlyCurrentModelName})</span>}
                        </button>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};