import React, { useMemo, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { marked } from 'marked';
import { ChatMessage, GroundingChunk, ReportType, ParsedReportSection, UploadedFile, SourceAssessment } from '../types';
import { SIFT_ICON } from '../constants'; 
import { downloadMarkdown } from '../utils/download';
import { parseSiftFullCheckReport, transformMarkdownForSubstack } from '../utils/apiHelpers.ts';
import { TabbedReport } from './TabbedReport';

interface ChatMessageItemProps {
  message: ChatMessage;
  sourceAssessments: SourceAssessment[];
  onSourceIndexClick: (index: number) => void;
}

// FIX: Changed to React.FC to correctly handle props like `key` when used in a list.
const FilePreview: React.FC<{ file: UploadedFile }> = ({ file }) => {
    const fileType = file.type.split('/')[0];
    const isImage = fileType === 'image' && file.base64Data;
    const isVideo = fileType === 'video' && file.base64Data;

    return (
        <div className="relative group w-24 h-24 bg-[#212934] rounded-md overflow-hidden border border-[#5c6f7e] flex items-center justify-center">
            {isImage && <img src={file.base64Data} alt={file.name} className="w-full h-full object-cover" />}
            {isVideo && <video src={file.base64Data} className="w-full h-full object-cover" />}
            {!isImage && !isVideo && (
                <div className="flex flex-col items-center text-center p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#95aac0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs text-[#95aac0] mt-1 break-all line-clamp-2">{file.name}</span>
                </div>
            )}
             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                <p className="text-white text-xs text-center line-clamp-3" title={file.name}>{file.name}</p>
            </div>
        </div>
    );
};

// FIX: Changed component to be of type React.FC to ensure TypeScript correctly handles it as a React component, resolving issues with the `key` prop.
export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message, sourceAssessments, onSourceIndexClick }) => {
  const { sender, text, timestamp, isLoading, isError, groundingSources, uploadedFiles, modelId, isInitialSIFTReport, originalQueryReportType, isFromCache, structuredData } = message;
  const isUser = sender === 'user';
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);

  const urlToIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!sourceAssessments || sourceAssessments.length === 0) return map;
    sourceAssessments.forEach(a => {
        if (a.url) map.set(a.url.trim(), a.index);
    });
    return map;
  }, [sourceAssessments]);

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
            // The ClipboardItem interface is not available in all TypeScript lib versions.
            // Using `any` to bypass potential type errors while maintaining functionality.
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


  // FIX: Changed return type from JSX.Element to React.ReactElement to resolve "Cannot find namespace 'JSX'" error.
  const renderContent = (): React.ReactElement | null => {
    if (isInitialSIFTReport && originalQueryReportType === ReportType.FULL_CHECK && !isLoading && !isError) {
      const parsedSections = parseSiftFullCheckReport(text);
      if (parsedSections.length > 0) {
        return <TabbedReport sections={parsedSections} />;
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
        return <p className="text-sm italic text-orange-200">(Empty message)</p>;
    }

    return null; 
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group mb-2`}>
      <div
        className={`max-w-full w-full px-4 py-3 rounded-xl shadow ${
          isUser
            ? 'bg-[#c36e26] text-white rounded-br-none ml-8 sm:ml-12'
            : 'bg-[#333e48] text-gray-200 rounded-bl-none mr-8 sm:mr-12'
        } ${
          isError ? 'border border-red-500 bg-red-900/40 text-red-200' : ''
        }`}
      >
        {!isUser && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <span className="text-lg mr-2">{SIFT_ICON}</span>
              <span className="font-semibold text-sm text-[#e2a32d]">
                SIFT Assistant
                {isFromCache && <span className="text-xs ml-1.5 text-[#e2a32d]" title="Loaded from local cache">⚡ Cached</span>}
              </span>
            </div>
            {modelId && <span className="text-xs ml-2 text-[#95aac0]/70">({modelId.split('/').pop()?.split(':').shift()})</span>}
          </div>
        )}
        
        {isUser && <p className="font-semibold mb-1 text-sm text-orange-100">You</p>}

        {isUser && uploadedFiles && uploadedFiles.length > 0 && (
            <div className="my-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {uploadedFiles.map((file, index) => (
                    <FilePreview key={index} file={file} />
                ))}
            </div>
        )}
        
        {renderContent()}

        {isLoading && (
          <div className="flex items-center mt-2">
            <svg className="animate-spin h-4 w-4 mr-2 text-[#95aac0]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-xs text-[#95aac0]">SIFTing...</span>
          </div>
        )}
        {isError && !isLoading && (
            <p className="text-xs text-red-400 mt-1">Failed to generate response.</p>
        )}

        {groundingSources && groundingSources.length > 0 && !isLoading && !isError && (
          <div className={`mt-3 pt-2 border-t ${isUser ? 'border-orange-400/50' : 'border-[#5c6f7e]'}`}>
            <h4 className={`text-xs font-semibold mb-1 ${isUser ? 'text-orange-100' : 'text-[#e2a32d]'}`}>Grounding Sources:</h4>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              {groundingSources.map((source, index) => (
                source.web && (
                  <li key={index} className={isUser ? "text-orange-100" : 'text-[#95aac0]'}>
                    <a 
                      href={source.web.uri} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      title={source.web.title || source.web.uri}
                      className={`${isUser ? "text-orange-200 hover:text-white" : "text-[#e2a32d] hover:text-[#f5b132]"} hover:underline`}
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
          <div className="mt-3 pt-2 border-t border-[#5c6f7e]">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-[#3a5871] text-blue-200">
              📊 Structured Data Attached
            </span>
          </div>
        )}

        {!isUser && isInitialSIFTReport && !isLoading && !isError && text.trim() && (
          <div className="mt-3 pt-3 border-t border-[#5c6f7e]">
            <button
              onClick={handleExportReport}
              className="bg-[#5c6f7e] hover:bg-[#708495] text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#333e48] focus:ring-[#95aac0] inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md shadow-sm transition-colors"
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
        
        <div className="flex justify-between items-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <p className={`text-xs ${isUser ? 'text-orange-200' : 'text-[#95aac0]/70'}`}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {!isLoading && text.trim() && (
                <div ref={copyMenuRef} className="relative">
                    <button
                        onClick={() => setShowCopyMenu(prev => !prev)}
                        title="Copy options"
                        className={`p-1 rounded ${isUser ? 'text-orange-200 hover:bg-orange-500/50' : 'text-[#95aac0] hover:bg-[#5c6f7e]'}`}
                        aria-haspopup="true"
                        aria-expanded={showCopyMenu}
                        aria-label="Copy message options"
                    >
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 4.625-2.25-2.25m0 0L15.75 12m2.25 2.25L15.75 12M9 11.25h6M9 13.5h3.75m-3.75 2.25h1.5m1.5 0h1.5" />
                        </svg>
                    </button>
                    {showCopyMenu && (
                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-[#2b3541] border border-[#5c6f7e] rounded-md shadow-lg z-20 py-1">
                            <button onClick={() => handleCopy('text')} className="flex items-center w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-[#5c6f7e]">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                                Copy as Plain Text
                            </button>
                            <button onClick={() => handleCopy('substack')} className="flex items-center w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-[#5c6f7e]">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9.75 6.75h9.75c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v10.25c0 .621.504 1.125 1.125 1.125z" /></svg>
                                Copy for Substack (HTML)
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};