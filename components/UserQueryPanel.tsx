import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AiReasoningPanelProps {
  aiReasoningStream: string;
  isProcessingReasoning: boolean;
}

export const AiReasoningPanel: React.FC<AiReasoningPanelProps> = ({
  aiReasoningStream,
  isProcessingReasoning,
}) => {
  return (
    <aside className="w-64 md:w-80 bg-[#333e48]/90 p-4 shadow-lg flex-shrink-0 h-full overflow-y-auto border-r border-[#5c6f7e] scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50">
      <div className="sticky top-0 bg-[#333e48]/80 backdrop-blur-sm py-3 -mt-4 -mx-4 px-4 border-b border-[#5c6f7e] z-10">
        <h2 className="text-lg font-semibold text-[#e2a32d] mb-0 flex items-center">
            Model's Reasoning
            {isProcessingReasoning && <span className="status-pulse ml-2 !w-2 !h-2"></span>}
        </h2>
      </div>

        <div className="text-sm text-gray-300 bg-[#212934] p-2 mt-4 rounded-md h-[calc(100%-4rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48] markdown-content prose-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiReasoningStream}</ReactMarkdown>
            {!aiReasoningStream && !isProcessingReasoning && (
                <div className="flex items-center justify-center h-full text-center text-[#95aac0]/70 italic">
                    The model's internal monologue and plan will appear here during generation.
                </div>
            )}
        </div>
    </aside>
  );
};