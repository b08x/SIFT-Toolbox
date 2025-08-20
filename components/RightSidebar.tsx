import React from 'react';
import { SourceAssessment } from '../types';

interface RightSidebarProps {
  llmStatusMessage: string | null;
  onGenerateContextReport: () => void;
  onGenerateCommunityNote: () => void;
  isLoading: boolean; // To disable buttons and show pulse
  isGeneratingDossier: boolean;
  onExportDossier: (format: 'md' | 'pdf') => void;
  sourceAssessments: SourceAssessment[];
  onSelectSource: (source: SourceAssessment) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  llmStatusMessage,
  onGenerateContextReport,
  onGenerateCommunityNote,
  isLoading,
  isGeneratingDossier,
  onExportDossier,
  sourceAssessments,
  onSelectSource,
}) => {
  const anyLoading = isLoading || isGeneratingDossier;

  return (
    <aside className="w-64 md:w-72 bg-[#333e48]/90 p-4 shadow-lg flex-shrink-0 h-full overflow-y-auto border-l border-[#5c6f7e] scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50">
      <div className="sticky top-0 bg-[#333e48]/80 backdrop-blur-sm -mt-4 -mx-4 px-4 py-3 z-10 border-b border-[#5c6f7e]">
        <h2 className="text-lg font-semibold text-[#e2a32d]">
          Session Tools
        </h2>
      </div>
      
      {/* LLM Status Box */}
      <div className="my-4">
        <h3 className="text-sm font-medium text-[#e2a32d] mb-1">🤖 LLM Status:</h3>
        <div className="min-h-[60px] p-2.5 bg-[#212934] border border-[#5c6f7e] rounded-md text-xs text-gray-200 overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48] flex items-start">
          {anyLoading && <span className="status-pulse flex-shrink-0 mt-0.5"></span>}
          <span className="flex-grow">
            {llmStatusMessage ? llmStatusMessage : <span className="italic text-[#95aac0]/70">Idle. Waiting for your input.</span>}
          </span>
        </div>
      </div>

      {/* Source Reliability Section */}
      {sourceAssessments.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-[#e2a32d] mb-1">🧐 Source Reliability</h3>
          <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48] bg-[#212934] p-2 rounded-md border border-[#5c6f7e]">
            <ul className="space-y-1">
              {sourceAssessments.map((assessment) => (
                <li key={assessment.index}>
                  <button
                    onClick={() => onSelectSource(assessment)}
                    className="w-full text-left text-xs p-1.5 rounded hover:bg-[#5c6f7e]/60 transition-colors focus:outline-none focus:ring-1 focus:ring-[#e2a32d]"
                    title={`Click to view details for: ${assessment.name}`}
                  >
                    <span className="font-semibold text-gray-200 truncate flex items-center">
                       <span className="inline-block text-center w-6 mr-2 py-0.5 bg-[#212934] border border-[#5c6f7e] rounded text-xs font-bold text-[#e2a32d] flex-shrink-0">{assessment.index}</span>
                       <span className="truncate">{assessment.name}</span>
                    </span>
                    <span className="text-[#95aac0]/80 truncate block pl-8">{assessment.assessment}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-[#e2a32d] mb-2">⚡ Actions:</h3>
          <button
            onClick={onGenerateContextReport}
            disabled={anyLoading}
            className="w-full p-2.5 text-sm bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#333e48] focus:ring-[#95aac0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Generate SIFT Context Report based on current chat"
          >
            📊 Generate Context Report
          </button>
        </div>
        <div>
          <button
            onClick={onGenerateCommunityNote}
            disabled={anyLoading}
            className="w-full p-2.5 text-sm bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#333e48] focus:ring-[#95aac0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Generate SIFT Community Note based on current chat"
          >
            📝 Generate Community Note
          </button>
        </div>
        {/* Session Export Buttons */}
        <div className="pt-3 border-t border-[#5c6f7e]/50">
            <h3 className="text-sm font-medium text-[#e2a32d] mb-2">📤 Export:</h3>
            <div className="space-y-3">
                 <button
                    onClick={() => onExportDossier('md')}
                    disabled={anyLoading}
                    className="w-full flex items-center justify-center p-2.5 text-sm bg-[#c36e26] hover:bg-[#d67e2a] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#333e48] focus:ring-[#d67e2a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label="Export dossier as a Markdown file"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Export Dossier (MD)
                </button>
                 <button
                    onClick={() => onExportDossier('pdf')}
                    disabled={anyLoading}
                    className="w-full flex items-center justify-center p-2.5 text-sm bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#333e48] focus:ring-[#95aac0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label="Export dossier as a PDF file"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9.75 6.75h9.75c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v10.25c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                    Export Dossier (PDF)
                </button>
            </div>
        </div>
      </div>

      <div className="mt-auto pt-6 text-center text-xs text-[#95aac0]/70">
        <p>SIFT Toolbox Actions</p>
      </div>
    </aside>
  );
};