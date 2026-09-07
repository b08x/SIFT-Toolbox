
import OpenAI from 'openai';
import { Content } from '@google/genai';
import { AIProvider, AIModelConfig, ChatMessage, SourceAssessment, ParsedReportSection, GroundingChunk, LinkValidationStatus } from '../types.ts';
import { SIFT_CHAT_SYSTEM_PROMPT } from '../prompts.ts';

const MAX_RECENT_TURNS = 5; // Number of recent user/AI message PAIRS to keep for context

export interface SessionContextOptions {
    sessionTopic?: string;
    sessionContext?: string;
    sourceAssessments?: SourceAssessment[];
    sessionUrls?: string;
}

/**
 * Creates an authoritative, compact executive distillation of a SIFT report.
 * Retains essential verdicts, verified facts, corrections, and source ratings without
 * bloating the context window with thousands of tokens of table markdown and boilerplate.
 */
export const compactSiftReportForContext = (rawReport: string): string => {
    if (!rawReport || rawReport.length < 1200) {
        return rawReport;
    }

    const sections: string[] = [];

    // 1. Extract Fact-Checker Verdict
    const verdictMatch = rawReport.match(/(?:###|##)?\s*(?:🏆|7\.)\s*What a Fact-Checker Might Say:?\s*\n+([\s\S]*?)(?=\n+(?:###|##|\*\*\*|💡|$))/i);
    if (verdictMatch && verdictMatch[1].trim()) {
        sections.push(`**Fact-Checker Verdict:**\n${verdictMatch[1].trim().slice(0, 500)}`);
    }

    // 2. Extract Revised Summary
    const summaryMatch = rawReport.match(/(?:###|##)?\s*(?:📜|6\.|8\.)\s*Revised Summary[^:\n]*:?\s*\n+([\s\S]*?)(?=\n+(?:###|##|\*\*\*|🏆|$))/i);
    if (summaryMatch && summaryMatch[1].trim()) {
        sections.push(`**Corrected Summary:**\n${summaryMatch[1].trim().slice(0, 700)}`);
    }

    // 3. Extract Corrections Summary or Errors
    const correctionsMatch = rawReport.match(/(?:###|##)?\s*(?:🛠️|3\.|5\.)\s*Corrections Summary:?\s*\n+([\s\S]*?)(?=\n+(?:###|##|\*\*\*|📌|$))/i);
    if (correctionsMatch && correctionsMatch[1].trim()) {
        sections.push(`**Key Corrections:**\n${correctionsMatch[1].trim().slice(0, 500)}`);
    }

    // 4. Extract Verified Facts (bullet points or top rows)
    const verifiedMatch = rawReport.match(/(?:###|##)?\s*(?:✅|1\.|2\.)\s*Verified Facts[^:\n]*:?\s*\n+([\s\S]*?)(?=\n+(?:###|##|\*\*\*|⚠️|$))/i);
    if (verifiedMatch && verifiedMatch[1].trim()) {
        const rows = verifiedMatch[1].trim().split('\n').filter(r => r.includes('|') && !r.includes('---'));
        const summaryRows = rows.slice(1, 6).map(r => {
            const parts = r.split('|').map(p => p.trim()).filter(Boolean);
            return parts.length >= 2 ? `• ${parts[0]}: ${parts[1]}` : null;
        }).filter(Boolean);
        if (summaryRows.length > 0) {
            sections.push(`**Verified Facts:**\n${summaryRows.join('\n')}`);
        }
    }

    if (sections.length > 0) {
        return `[Initial SIFT Analysis - Distilled Findings]\n${sections.join('\n\n')}`;
    }

    // Fallback: preserve first 1500 chars cleanly
    return rawReport.slice(0, 1500) + '\n\n[...Report synthesized for session continuity]';
};

/**
 * Builds a structured, compact session context anchor block.
 */
export const formatSessionContextAnchor = (options?: SessionContextOptions): string => {
    if (!options) return '';
    const parts: string[] = [];

    if (options.sessionTopic && options.sessionTopic.trim()) {
        parts.push(`Topic: "${options.sessionTopic.trim()}"`);
    }
    if (options.sessionContext && options.sessionContext.trim()) {
        parts.push(`Background Context & Investigation Angle: "${options.sessionContext.trim()}"`);
    }
    if (options.sessionUrls && options.sessionUrls.trim()) {
        const urls = options.sessionUrls.split('\n').map(u => u.trim()).filter(Boolean);
        if (urls.length > 0) {
            parts.push(`Referenced Target URLs:\n${urls.map(u => `• ${u}`).join('\n')}`);
        }
    }
    if (options.sourceAssessments && options.sourceAssessments.length > 0) {
        const sourcesList = options.sourceAssessments.slice(0, 8).map(s => 
            `• [${s.index || '?'}] ${s.name || 'Source'} (${s.rating || 'N/A'}/5) - ${s.assessment || s.notes || s.url}`
        ).join('\n');
        parts.push(`Verified Session Sources (${options.sourceAssessments.length} logged):\n${sourcesList}`);
    }

    if (parts.length === 0) return '';
    return `[ACTIVE SIFT SESSION CONTINUITY ANCHOR]\n${parts.join('\n\n')}`;
};

export const getSystemPromptForSelectedModel = (
    modelConfig: AIModelConfig | undefined, 
    customPrompt?: string,
    sessionOptions?: SessionContextOptions
): string => {
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

    // Append session continuity instruction if a specific topic or context is active
    if (sessionOptions?.sessionTopic?.trim()) {
        basePrompt += `\n\n--- ACTIVE SESSION CONTINUITY ---\nYou are working on an active SIFT fact-checking investigation regarding: "${sessionOptions.sessionTopic.trim()}". Maintain strict continuity across all turns with the findings, sources, and verified facts established in this session.`;
        if (sessionOptions.sessionContext?.trim()) {
            basePrompt += `\nInvestigation Focus / Background: "${sessionOptions.sessionContext.trim()}".`;
        }
    }

    return basePrompt;
  };

export const getTruncatedHistoryForApi = (
    fullChatMessages: ChatMessage[],
    systemPrompt: string, // For OpenAI/OpenRouter/Mistral
    provider: AIProvider,
    contextOptions?: SessionContextOptions
  ): { openai?: OpenAI.Chat.Completions.ChatCompletionMessageParam[]; gemini?: Content[] } => {
    
    const recentMessagesToKeepCount = MAX_RECENT_TURNS * 2; // user + ai messages
  
    let processedMessages: { id: string; sender: 'user' | 'ai'; text: string }[] = [];
    const addedIds = new Set<string>();

    // 1. Identify the first user query (regardless of whether originalQuery property was set)
    const firstUserMsg = fullChatMessages.find(msg => msg.sender === 'user');
    // 2. Identify the first AI report (or initial comprehensive report)
    const firstAIReport = fullChatMessages.find(msg => msg.sender === 'ai' && (msg.isInitialSIFTReport || msg.text.length > 500));
  
    // Anchor block representing the ongoing session context (topic, notes, sources)
    const sessionAnchor = formatSessionContextAnchor(contextOptions);

    // Always anchor the session with the initial user query
    if (firstUserMsg && firstUserMsg.text?.trim()) {
      let initialUserText = firstUserMsg.originalQuery?.text || firstUserMsg.text.trim();
      if (sessionAnchor) {
        initialUserText = `${sessionAnchor}\n\n[Initial Query]: ${initialUserText}`;
      }
      processedMessages.push({
        id: firstUserMsg.id,
        sender: 'user',
        text: initialUserText
      });
      addedIds.add(firstUserMsg.id);
    } else if (sessionAnchor) {
      // If no initial user query found yet, anchor session context
      processedMessages.push({
        id: 'session-anchor',
        sender: 'user',
        text: sessionAnchor
      });
      addedIds.add('session-anchor');
    }

    // Always include the initial SIFT analysis, intelligently compacted to prevent context bloat
    if (firstAIReport && !addedIds.has(firstAIReport.id) && firstAIReport.text?.trim()) {
      const compactedReport = compactSiftReportForContext(firstAIReport.text);
      processedMessages.push({
        id: firstAIReport.id,
        sender: 'ai',
        text: compactedReport
      });
      addedIds.add(firstAIReport.id);
    }
    
    // Determine the starting point for slicing recent messages
    let lastEssentialMessageIndex = -1;
    if (firstAIReport) {
      lastEssentialMessageIndex = fullChatMessages.findIndex(m => m.id === firstAIReport.id);
    } else if (firstUserMsg) {
      lastEssentialMessageIndex = fullChatMessages.findIndex(m => m.id === firstUserMsg.id);
    }
  
    const subsequentMessages = fullChatMessages.slice(lastEssentialMessageIndex + 1);
    const recentSubsequentMessages = subsequentMessages.slice(Math.max(0, subsequentMessages.length - recentMessagesToKeepCount));
    
    recentSubsequentMessages.forEach(msg => {
      if (!addedIds.has(msg.id) && !msg.isLoading && !msg.isError && typeof msg.text === 'string' && msg.text.trim().length > 0) { 
          // Bound intermediate turns so they don't blow the context window
          let text = msg.text.trim();
          if (text.length > 2500) {
            text = text.slice(0, 1200) + '\n\n[...intermediate analysis condensed for context...]\n\n' + text.slice(-1000);
          }
          processedMessages.push({
            id: msg.id,
            sender: msg.sender === 'user' ? 'user' : 'ai',
            text
          });
          addedIds.add(msg.id);
      }
    });

    // Consolidate consecutive messages of the same sender to ensure strictly alternating roles
    const consolidatedTurns: { sender: 'user' | 'ai', text: string }[] = [];
    for (const msg of processedMessages) {
      const sender = msg.sender;
      const last = consolidatedTurns[consolidatedTurns.length - 1];
      if (last && last.sender === sender) {
        last.text += '\n\n' + msg.text.trim();
      } else {
        consolidatedTurns.push({ sender, text: msg.text.trim() });
      }
    }
  
    if (provider === AIProvider.GOOGLE_GEMINI) {
      const turns = [...consolidatedTurns];
      // Gemini multiturn must start with a user message
      if (turns.length > 0 && turns[0].sender === 'ai') {
        turns.unshift({ sender: 'user', text: 'Context from previous SIFT analysis:' });
      }
      const geminiHistory: Content[] = turns.map(turn => ({
          role: turn.sender === 'user' ? 'user' : 'model',
          parts: [{ text: turn.text }],
      }));
      return { gemini: geminiHistory };
    } else { // OpenAI, OpenRouter, Mistral, Anthropic, Groq, Ollama
      const openaiHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = consolidatedTurns.map(turn => ({
          role: turn.sender === 'user' ? 'user' : 'assistant',
          content: turn.text,
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
    new URL(url); // Basic syntax validation
  } catch (_) {
    return 'invalid';
  }

  if (!url.startsWith('http')) {
    return 'invalid';
  }

  const TIMEOUT = 6000; // 6 seconds for each attempt

  // --- Attempt 1: Standard CORS-enabled HEAD request ---
  // This is the cleanest method. It will succeed if the server has permissive CORS headers.
  const headController = new AbortController();
  const headTimeoutId = setTimeout(() => headController.abort(), TIMEOUT);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: headController.signal,
      mode: 'cors',
      cache: 'no-cache',
    });
    clearTimeout(headTimeoutId);

    if (response.status >= 200 && response.status < 400) {
      return 'valid'; // Success or redirect
    } else {
      return 'invalid'; // 4xx, 5xx client/server errors
    }
  } catch (headError) {
    clearTimeout(headTimeoutId);
    // Failure here is expected for sites without permissive CORS headers.
    // It could also be a network error or a timeout. We proceed to the next check.
  }

  // --- Attempt 2 & 3: Fallback to 'no-cors' GET request with a retry ---
  // We can't read the response, but if the request promise fails, it's a strong signal of a network error.
  // If it succeeds, the server is likely up, and the first failure was a CORS issue.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const getController = new AbortController();
    const getTimeoutId = setTimeout(() => getController.abort(), TIMEOUT);

    try {
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        signal: getController.signal,
        cache: 'no-cache',
      });
      
      clearTimeout(getTimeoutId);
      // If this request resolves, it means the server is reachable. The browser is just blocking us from reading the response due to CORS.
      // This is the classic scenario for 'error_checking'. We can confidently return this status.
      return 'error_checking';

    } catch (getError) {
      clearTimeout(getTimeoutId);

      // If this is the last attempt and it failed, we assume the link is truly inaccessible.
      if (attempt === 2) {
        // The 'no-cors' request itself failed, which strongly indicates a network-level issue (DNS, server down, etc.).
        return 'invalid';
      }
      
      // Wait a moment before retrying to handle transient network hiccups.
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Fallback in case the loop logic somehow fails to return, which shouldn't happen.
  return 'invalid';
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
