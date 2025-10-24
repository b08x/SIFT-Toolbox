import OpenAI from 'openai';
import { Content } from '@google/genai';
import { AIProvider, AIModelConfig, ChatMessage, SourceAssessment, ParsedReportSection, GroundingChunk, LinkValidationStatus } from '../types';
import { SIFT_CHAT_SYSTEM_PROMPT } from '../prompts';
import { AVAILABLE_PROVIDERS_MODELS } from '../models.config';

const MAX_RECENT_TURNS = 5; // Number of recent user/AI message PAIRS to keep for context

export const getSystemPromptForSelectedModel = (modelConfig: AIModelConfig | undefined, customPrompt?: string): string => {
    if (customPrompt && customPrompt.trim()) {
        return customPrompt;
    }
    
    let basePrompt: string = SIFT_CHAT_SYSTEM_PROMPT; 

    if (modelConfig) {
        if (typeof modelConfig.defaultSystemPrompt === 'string' && modelConfig.defaultSystemPrompt.trim() !== '') {
            basePrompt = modelConfig.defaultSystemPrompt;
        } else if (modelConfig.provider === AIProvider.OPENAI || modelConfig.provider === AIProvider.OPENROUTER || modelConfig.provider === AIProvider.MISTRAL) {
            basePrompt = `You are a SIFT (Stop, Investigate, Find, Trace) methodology assistant. You help users fact-check claims, understand context, and analyze information. Follow instructions for specific report types when requested. Provide structured, well-cited responses. Ensure all tables are in Markdown format.`;
        }
    }
    return basePrompt;
  };

export const getTruncatedHistoryForApi = (
    fullChatMessages: ChatMessage[],
    systemPrompt: string, // For OpenAI/OpenRouter/Mistral
    provider: AIProvider
  ): { openai?: OpenAI.Chat.Completions.ChatCompletionMessageParam[]; gemini?: Content[] } => {
    
    const recentMessagesToKeepCount = MAX_RECENT_TURNS * 2; // user + ai messages
  
    let processedMessages: ChatMessage[] = [];
    const addedIds = new Set<string>();
  
    // Find the first user query and the first AI report
    const firstUserMessage = fullChatMessages.find(msg => msg.sender === 'user' && msg.originalQuery);
    const firstAIReport = fullChatMessages.find(msg => msg.sender === 'ai' && msg.isInitialSIFTReport);
  
    // Always include the first query and report if they exist
    if (firstUserMessage) {
      processedMessages.push(firstUserMessage);
      addedIds.add(firstUserMessage.id);
    }
    if (firstAIReport && !addedIds.has(firstAIReport.id)) {
      processedMessages.push(firstAIReport);
      addedIds.add(firstAIReport.id);
    }
    
    // Determine the starting point for slicing recent messages
    let lastEssentialMessageIndex = -1;
    if (firstAIReport) {
      lastEssentialMessageIndex = fullChatMessages.findIndex(m => m.id === firstAIReport.id);
    } else if (firstUserMessage) {
      lastEssentialMessageIndex = fullChatMessages.findIndex(m => m.id === firstUserMessage.id);
    }
  
    const subsequentMessages = fullChatMessages.slice(lastEssentialMessageIndex + 1);
    const recentSubsequentMessages = subsequentMessages.slice(Math.max(0, subsequentMessages.length - recentMessagesToKeepCount));
    
    recentSubsequentMessages.forEach(msg => {
      if (!addedIds.has(msg.id)) { 
          processedMessages.push(msg);
      }
    });
    
    // Filter out any error or loading messages before final conversion
    const validMessagesForHistory = processedMessages.filter(
      msg => !msg.isError && !msg.isLoading
    );
  
    if (provider === AIProvider.GOOGLE_GEMINI) {
      const geminiHistory: Content[] = validMessagesForHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }],
      }));
      return { gemini: geminiHistory };
    } else { // OpenAI, OpenRouter or Mistral
      const openaiHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = validMessagesForHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
      }));
      return { openai: [{ role: 'system', content: systemPrompt }, ...openaiHistory] };
    }
  };

export const parseSourceAssessmentsFromMarkdown = (markdownText: string): Omit<SourceAssessment, 'index'>[] => {
    const assessments: Omit<SourceAssessment, 'index'>[] = [];
    const sectionRegex = /(?:##\s*5\.|###)\s*🔴\s*Assessment of Source Reliability:?\s*\n((?:.|\n)*?)(?=\n(?:##\s*\d+\.|###\s*)|$)/;
    const sectionMatch = markdownText.match(sectionRegex);

    if (!sectionMatch || !sectionMatch[1]) {
        return [];
    }

    const tableContent = sectionMatch[1];
    const rows = tableContent.split('\n').filter(row => row.trim().startsWith('|') && row.trim().endsWith('|'));

    // Skip header and separator rows
    for (let i = 2; i < rows.length; i++) {
        const columns = rows[i].split('|').map(col => col.trim()).slice(1, -1); // remove outer empty strings
        if (columns.length < 4) continue;

        const sourceText = columns[0];
        const assessment = columns[1];
        const notes = columns[2];
        const rating = columns[3];
        
        const linkRegex = /\[(.*?)\]\((.*?)\)/;
        const linkMatch = sourceText.match(linkRegex);

        if (linkMatch) {
            const name = linkMatch[1].replace(/\*\*/g, ''); // remove bolding
            const url = linkMatch[2];
            if (name && url) {
              assessments.push({ name, url, assessment, notes, rating });
            }
        }
    }

    return assessments;
};

const KNOWN_SECTION_MARKERS_TO_TITLES: Array<{marker: string, title: string}> = [
  { marker: "| Statement | Plausibility | Path for Investigation |", title: "📌 Potential Leads" },
  { marker: "| Statement | Status | Clarification & Correction | Confidence (1-5) |", title: "✅ Verified Facts" },
  { marker: "| Statement | Issue | Correction | Correction Confidence (1-5) |", title: "⚠️ Errors and Corrections" },
  { marker: "| Source | Usefulness Assessment | Notes | Rating (1-5) |", title: "🔴 Assessment of Source Reliability" }
];

// Parser for SIFT Full Check report
export const parseSiftFullCheckReport = (markdownText: string): ParsedReportSection[] => {
  const sections: ParsedReportSection[] = [];
  // Normalize line endings and trim whitespace to prevent parsing issues
  let remainingText = markdownText.replace(/\r\n/g, '\n').trim();

  // 1. Extract Preamble more robustly
  const preambleRegex = /^(Generated .*?)\n(Language Model-Generated: .*?)\n*/is;
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
      // If it's not a header and no sections exist, this is likely preamble text
      // that came after the initial preamble block. Instead of a "Miscellaneous" tab,
      // we'll append it to the initial "Report Information" section if it exists.
      const preambleSection = sections.find(s => s.title === "Report Information");
      if (preambleSection) {
        preambleSection.content += `\n\n${trimmedPart}`;
      }
      // Otherwise, we discard it to avoid creating an unwanted "Miscellaneous" tab.
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

export const correctRedirectLinksInMarkdown = (markdownText: string, groundingSources: GroundingChunk[]): string => {
    if (!groundingSources || groundingSources.length === 0) {
        return markdownText;
    }

    const directSourcesMap = new Map<string, string>(); // Map from normalized title to direct URL
    groundingSources.forEach(source => {
        if (source.web?.title && source.web?.uri) {
            // Normalize title by removing extra spaces and making it lowercase
            const normalizedTitle = source.web.title.trim().toLowerCase();
            if (!directSourcesMap.has(normalizedTitle)) {
                directSourcesMap.set(normalizedTitle, source.web.uri);
            }
        }
    });

    if (directSourcesMap.size === 0) {
        return markdownText;
    }

    // Regex to find Markdown links `[text](url)` but not image links `![text](url)`
    const linkRegex = /(?<!\!)\[([^\]]+)\]\((https?:\/\/vertexaisearch\.cloud\.google\.com[^)]+)\)/g;

    return markdownText.replace(linkRegex, (match, linkText, url) => {
        const linkTitleNormalized = linkText.trim().toLowerCase();
        
        // 1. Exact match on title
        if (directSourcesMap.has(linkTitleNormalized)) {
            const directUrl = directSourcesMap.get(linkTitleNormalized);
            return `[${linkText}](${directUrl})`;
        }

        // 2. Partial match for cases where titles are slightly different
        let bestMatchUrl: string | null = null;
        let highestMatchScore = 0;

        for (const [sourceTitle, directUrl] of directSourcesMap.entries()) {
            let score = 0;
            // Simple substring matching score
            if (linkTitleNormalized.includes(sourceTitle)) {
                score = sourceTitle.length / linkTitleNormalized.length;
            } else if (sourceTitle.includes(linkTitleNormalized)) {
                score = linkTitleNormalized.length / sourceTitle.length;
            }
            
            if (score > highestMatchScore) {
                highestMatchScore = score;
                bestMatchUrl = directUrl;
            }
        }
        
        // Use a threshold to avoid incorrect replacements
        if (bestMatchUrl && highestMatchScore > 0.7) {
            return `[${linkText}](${bestMatchUrl})`;
        }

        // If no confident match is found, return the original link to avoid breaking it
        return match; 
    });
};

export const checkLinkStatus = async (url: string): Promise<LinkValidationStatus> => {
  try {
    // This is a basic check. It won't catch all invalid formats but is a good first pass.
    new URL(url);
  } catch (_) {
    return 'invalid';
  }

  if (!url.startsWith('http')) {
    return 'invalid';
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout

    // We use 'HEAD' to be efficient and not download the whole page.
    // Some servers don't support 'HEAD', but it's a good first try.
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors',
    });

    clearTimeout(timeoutId);

    // 2xx are success, 3xx are redirects (we'll count them as valid for this purpose)
    if (response.status >= 200 && response.status < 400) {
      return 'valid';
    } else { // 4xx and 5xx are client/server errors
      return 'invalid';
    }
  } catch (error) {
    // This block catches CORS errors, network errors, timeouts, etc.
    // It's very difficult to distinguish them reliably on the frontend.
    // We'll mark them as "error_checking".
    return 'error_checking';
  }
};

/**
 * Parses a Markdown table string into headers and rows.
 * @param tableMarkdown The string containing a single Markdown table.
 * @returns An object with headers and rows, or null if parsing fails.
 */
const parseTable = (tableMarkdown: string): { headers: string[]; rows: string[][] } | null => {
    const lines = tableMarkdown.trim().split('\n');
    if (lines.length < 2) return null; // Must have at least a header and separator

    const headerLine = lines[0];
    const separatorLine = lines[1];
    const rowLines = lines.slice(2);

    // Basic validation for table structure
    if (!headerLine.includes('|') || !separatorLine.match(/\|(?:\s*:?-+:?\s*\|)+/)) {
        return null;
    }

    const parseRow = (row: string): string[] => 
        row.split('|').map(s => s.trim()).slice(1, -1);

    const headers = parseRow(headerLine);
    const rows = rowLines.map(parseRow);

    return { headers, rows };
};


/**
 * Transforms Markdown tables into a narrative blockquote format suitable for Substack.
 * @param markdown The input Markdown string.
 * @returns A new Markdown string with tables converted to blockquotes.
 */
export const transformMarkdownForSubstack = (markdown: string): string => {
    // This regex finds blocks that look like Markdown tables.
    const tableRegex = /(?:^|\n\n)((?:\|[^\n]+\|\r?\n){2,})/g;

    return markdown.replace(tableRegex, (tableMatch) => {
        const tableData = parseTable(tableMatch);
        if (!tableData) return tableMatch; // If it's not a valid table, return it unchanged.

        const { headers, rows } = tableData;

        const blockquotes = rows.map(rowCells => {
            const fields = rowCells.map((cell, index) => {
                const header = headers[index];
                // Create a line only if both header and cell have meaningful content.
                if (header && cell && cell.trim() !== '' && cell.trim() !== 'N/A') {
                    return `> **${header}:** ${cell}`;
                }
                return '';
            }).filter(Boolean); // Remove any empty lines

            return fields.join('\n');
        });

        // Join each record with a horizontal rule for separation, and filter out empty records.
        return '\n\n' + blockquotes.filter(Boolean).join('\n\n---\n\n') + '\n\n';
    });
};