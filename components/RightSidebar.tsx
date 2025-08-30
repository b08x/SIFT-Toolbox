
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
  onSaveSession: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSaveTime: Date | null;
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
  onSaveSession,
  saveStatus,
  lastSaveTime,
}) => {
  const anyLoading = isLoading || isGeneratingDossier;

  const renderSaveStatus = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <div className="flex items-center text-xs text-[#e2a32d]">
            <svg className="animate-spin h-3 w-3 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving...
          </div>
        );
      case 'saved':
        return (
          <div className="flex items-center text-xs text-green-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {lastSaveTime ? `Saved at ${lastSaveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Session saved.'}
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center text-xs text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Error saving.
          </div>
        );
      default: // idle
        return (
            <div className="text-xs text-[#95aac0]/70 italic">
                Auto-saves on change.
            </div>
        );
    }
  };

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

      {/* Session State Box */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-[#e2a32d] mb-1">💾 Session State:</h3>
        <div className="min-h-[44px] p-2 bg-[#212934] border border-[#5c6f7e] rounded-md flex items-center justify-between">
            <div className="flex-grow pr-2">
                {renderSaveStatus()}
            </div>
            <button
                onClick={onSaveSession}
                disabled={anyLoading || saveStatus === 'saving'}
                className="px-3 py-1.5 text-xs bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212934] focus:ring-[#95aac0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                title="Manually save the current session"
            >
                Save Now
            </button>
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
