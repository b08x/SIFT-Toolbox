

import React from 'react';
import { UploadedFile } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface UserQueryPanelProps {
  sessionTopic: string;
  sessionContext: string;
  sessionFiles: UploadedFile[];
  sessionUrls: string[];
  aiReasoningStream: string;
  isProcessingReasoning: boolean;
}

export const UserQueryPanel: React.FC<UserQueryPanelProps> = ({
  sessionTopic,
  sessionContext,
  sessionFiles,
  sessionUrls,
  aiReasoningStream,
  isProcessingReasoning,
}) => {
  return (
    <aside className="w-64 md:w-80 bg-[#333e48]/90 p-4 shadow-lg flex-shrink-0 h-full overflow-y-auto border-r border-[#5c6f7e] scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50">
      <div className="sticky top-0 bg-[#333e48]/80 backdrop-blur-sm py-3 -mt-4 -mx-4 px-4 border-b border-[#5c6f7e] z-10">
        <h2 className="text-lg font-semibold text-[#e2a32d] mb-0">
          Session Details
        </h2>
      </div>

      <div className="space-y-5 mt-4">
        {sessionTopic && (
          <div>
            <h3 className="text-sm font-medium text-[#e2a32d] mb-1">Topic/Subject:</h3>
            <p className="text-sm text-gray-200 bg-[#212934] p-2 rounded-md max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48]">
              {sessionTopic}
            </p>
          </div>
        )}

        {sessionContext && (
          <div>
            <h3 className="text-sm font-medium text-[#e2a32d] mb-1">Additional Context:</h3>
            <p className="text-sm text-gray-200 bg-[#212934] p-2 rounded-md max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48]">
              {sessionContext}
            </p>
          </div>
        )}

        {sessionUrls && sessionUrls.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-[#e2a32d] mb-1">Context URLs:</h3>
            <ul className="text-sm text-gray-200 bg-[#212934] p-2 rounded-md max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48] space-y-1">
              {sessionUrls.map((url, index) => (
                <li key={index} className="flex items-center text-xs truncate" title={url}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#95aac0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.596a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-[#e2a32d] hover:underline">{url}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {sessionFiles && sessionFiles.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-[#e2a32d] mb-1">Uploaded Files:</h3>
            <ul className="text-sm text-gray-200 bg-[#212934] p-2 rounded-md max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48] space-y-1">
              {sessionFiles.map((file, index) => (
                <li key={index} className="flex items-center text-xs truncate" title={file.name}>
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#95aac0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                   </svg>
                   <span className="truncate">{file.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(aiReasoningStream || isProcessingReasoning) && (
          <div className="pt-4 mt-4 border-t border-[#5c6f7e]">
             <h3 className="text-sm font-medium text-[#e2a32d] mb-1 flex items-center">
                Model's Reasoning Process
                {isProcessingReasoning && <span className="status-pulse ml-2 !w-2 !h-2"></span>}
             </h3>
             <div className="text-sm text-gray-300 bg-[#212934] p-2 rounded-md max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48] markdown-content prose-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiReasoningStream}</ReactMarkdown>
             </div>
          </div>
        )}
      </div>
    </aside>
  );
};