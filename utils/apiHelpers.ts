import OpenAI from 'openai';
import { Content } from '@google/genai';
import { AIProvider, AIModelConfig, ChatMessage, SourceAssessment } from '../types';
import { SIFT_CHAT_SYSTEM_PROMPT } from '../prompts';
import { AVAILABLE_PROVIDERS_MODELS } from '../models.config';

const MAX_RECENT_TURNS = 5; // Number of recent user/AI message PAIRS to keep for context

export const getSystemPromptForSelectedModel = (modelConfig: AIModelConfig | undefined): string => {
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