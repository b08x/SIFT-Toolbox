



import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, GroundingChunk, ReportType, ParsedReportSection, UploadedFile, SourceAssessment } from '../types';
import { SIFT_ICON } from '../constants'; 
import { downloadMarkdown } from '../utils/download';

interface ChatMessageItemProps {
  message: ChatMessage;
  sourceAssessments: SourceAssessment[];
}

const KNOWN_SECTION_MARKERS_TO_TITLES: Array<{marker: string, title: string}> = [
  { marker: "| Statement | Plausibility | Path for Investigation |", title: "📌 Potential Leads" },
  { marker: "| Statement | Status | Clarification & Correction | Confidence (1-5) |", title: "✅ Verified Facts" },
  { marker: "| Statement | Issue | Correction | Correction Confidence (1-5) |", title: "⚠️ Errors and Corrections" },
  { marker: "| Source | Usefulness Assessment | Notes | Rating (1-5) |", title: "🔴 Assessment of Source Reliability" }
];

// Parser for SIFT Full Check report
const parseSiftFullCheckReport = (markdownText: string): ParsedReportSection[] => {
  const sections: ParsedReportSection[] = [];
  // Normalize line endings and trim whitespace to prevent parsing issues
  let remainingText = markdownText.replace(/\r\n/g, '\n').trim();

  // 1. Extract Preamble more robustly
  const preambleRegex = /^(Generated .*?)\n(AI-Generated: .*?)\n*/is;
  const preambleMatch = remainingText.match(preambleRegex);
  if (preambleMatch) {
    sections.push({ 
      title: "Report Information", 
      rawTitle: "Report Information", 
      content: `${preambleMatch[1]}\n${preambleMatch[2]}`, 
      level: 0 
    });
    remainingText = remainingText.substring(preambleMatch[0].length).trim();
  }

  // Look for the main sections using a more robust splitter
  const sectionSplitRegex = /(?=^\s*(?:##|###)\s*(?:✅|⚠️|🛠️|📌|🔴|📜|🏆|💡|\d+\.)?.*$)/m;
  const parts = remainingText.split(sectionSplitRegex).filter(part => part.trim() !== '');

  for (const part of parts) {
    const trimmedPart = part.trim();
    // Match headers like ## 1. ✅ Title or ### Title
    const headerMatch = trimmedPart.match(/^\s*(##|###)\s*(?:\d+\.\s*)?((?:✅|⚠️|🛠️|📌|🔴|📜|🏆|💡)?\s*[^:\n]*?):?\s*$/);
    
    if (headerMatch) {
      const headerLevelTag = headerMatch[1]; // '##' or '###'
      const rawTitleLine = headerMatch[0].trim();
      let extractedTitleText = headerMatch[2]?.trim() || "Untitled Section";

      const content = trimmedPart.substring(rawTitleLine.length).trim();
      
      let currentSectionTitle = extractedTitleText;
      // If title is blank, try to infer it from table headers
      if (currentSectionTitle === "Untitled Section" || !currentSectionTitle) {
        const trimmedContent = content.trim();
        for (const mapping of KNOWN_SECTION_MARKERS_TO_TITLES) {
          if (trimmedContent.startsWith(mapping.marker)) {
            currentSectionTitle = mapping.title;
            break;
          }
        }
      }
      
      sections.push({
        title: currentSectionTitle,
        rawTitle: rawTitleLine,
        content: content,
        level: headerLevelTag === '##' ? 2 : 3,
      });
    } else if (trimmedPart && sections.length > 0) {
      // Append to the content of the last section if no new header is found
      sections[sections.length - 1].content += `\n\n${trimmedPart}`;
    } else if (trimmedPart) {
      // If it's not a header and no sections exist, treat as miscellaneous preamble content
      sections.push({ title: "Miscellaneous", rawTitle: "Miscellaneous", content: trimmedPart, level: 0 });
    }
  }

  // List of regex patterns to detect and filter out common, unwanted code injections.
  const JUNK_CODE_PATTERNS: RegExp[] = [
      // C++ tic-tac-toe or similar console applications
      /^\s*#include\s*<iostream>.*using\s*namespace\s*std;/is,
      // Python Flask/Django web server boilerplate
      /^\s*```(python)?\s*(from\s*flask\s*import|from\s*django\.|import\s*uvicorn)/is,
      /if\s*__name__\s*==\s*['"]__main__['"]:\s*app\.run\(/is,
      // Basic HTML document structure
      /^\s*<!DOCTYPE\s*html>.*<head>.*<title>/is,
      // Node.js Express server boilerplate
      /^\s*```(javascript)?\s*const\s*express\s*=\s*require\('express'\);.*app\.listen\(/is,
      // Malformed table header from model hallucination
      /^\|\s*Statement\s*\|\s*Plausibility\s*\|\s*Path\s*for\s*Investigation\s*return\s*render_template/i,
      // Generic React component boilerplate
      /^\s*```(jsx|javascript)\s*import\s*React\s*from\s*['"]react['"];.*export\s*default/is,
  ];

  // Filter out unwanted sections
  let filteredSectionsResult = sections.filter(section => {
      const content = section.content.trim();

      // Filter out sections identified as junk
      for (const pattern of JUNK_CODE_PATTERNS) {
          if (pattern.test(content)) {
              console.warn(`[SIFT Parser] Filtering section "${section.title}" due to junk code pattern match:`, pattern);
              return false;
          }
      }
      
      // Filter out the source reliability section as it's now handled in the sidebar
      if (section.title.includes("Assessment of Source Reliability")) {
          return false;
      }
      
      return true;
  });

  return filteredSectionsResult.filter(s => s.content.trim() !== '' || s.title === "Report Information");
};

const FilePreview = ({ file }: { file: UploadedFile }) => {
    const fileType = file.type.split('/')[0];
    const isImage = fileType === 'image';
    const isVideo = fileType === 'video';

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

const injectSourceIndices = (markdownText: string, assessments: SourceAssessment[]): string => {
  if (!assessments || assessments.length === 0) {
    return markdownText;
  }

  const urlToIndexMap = new Map<string, number>();
  assessments.forEach(a => {
    if (a.url) urlToIndexMap.set(a.url, a.index);
  });

  if (urlToIndexMap.size === 0) return markdownText;

  // This regex finds Markdown links `[text](url)` but avoids image links `![text](url)`
  const linkRegex = /(?<!\!)\[([^\]]+)\]\(([^)]+?)\)/g;

  return markdownText.replace(linkRegex, (match, _linkText, url) => {
    const trimmedUrl = url.trim();
    if (urlToIndexMap.has(trimmedUrl)) {
      const index = urlToIndexMap.get(trimmedUrl);
      // Append a superscripted index number after the link
      return `${match}[${index}]`;
    }
    return match;
  });
};


export const ChatMessageItem = ({ message, sourceAssessments }: ChatMessageItemProps): React.ReactElement => {
  const { sender, text, timestamp, isLoading, isError, groundingSources, uploadedFiles, modelId, isInitialSIFTReport, originalQueryReportType, isFromCache, structuredData } = message;
  const isUser = sender === 'user';

  const textWithIndices = useMemo(() => {
    return injectSourceIndices(text, sourceAssessments);
  }, [text, sourceAssessments]);


  const handleCopyText = (contentToCopy: string) => {
    navigator.clipboard.writeText(contentToCopy)
      .then(() => alert('Message content copied to clipboard!'))
      .catch(err => console.error('Failed to copy message: ', err));
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


  const renderContent = (): JSX.Element | null => {
    if (isInitialSIFTReport && originalQueryReportType === ReportType.FULL_CHECK && !isError && !isLoading) {
      const parsedSections = parseSiftFullCheckReport(textWithIndices);
      if (parsedSections.length > 0) {
        return (
          <div className="space-y-4">
            {parsedSections.map((section, index) => (
              <div key={index} className='bg-[#212934]/70 p-3 rounded-lg shadow'>
                <h3 className={`text-base font-semibold mb-2 text-gray-200`}>
                  {section.title !== "Report Information" && section.title !== "Miscellaneous" && section.level > 0 && (section.rawTitle.match(/^(##\s*\d*\.?\s*|###\s*)/)?.[0] || (section.level === 2 ? "## " : "### "))}
                  <span className={section.level === 2 ? 'text-[#e2a32d]' : 'text-[#c36e26]'}>{section.title}</span>
                </h3>
                <div className="markdown-content prose-sm sm:prose-base max-w-none text-gray-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        );
      }
    }
    
    if (text.trim() || isLoading) { 
      return (
        <div className="markdown-content prose-sm sm:prose-base max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{textWithIndices}</ReactMarkdown>
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
                 <button
                    onClick={() => handleCopyText(textWithIndices)}
                    title="Copy message"
                    className={`p-1 rounded ${isUser ? 'text-orange-200 hover:bg-orange-500/50' : 'text-[#95aac0] hover:bg-[#5c6f7e]'}`}
                    aria-label="Copy message text"
                >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 4.625-2.25-2.25m0 0L15.75 12m2.25 2.25L15.75 12M9 11.25h6M9 13.5h3.75m-3.75 2.25h1.5m1.5 0h1.5" />
                    </svg>
                </button>
            )}
        </div>
      </div>
    </div>
  );
};