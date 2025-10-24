import React from 'react';
import { SourceAssessment, LinkValidationStatus } from '../types.ts';

interface ExportAndSourcesMenuProps {
  isGeneratingReport: boolean;
  onExportReport: (format: 'md' | 'pdf' | 'substack') => void;
  onExportSources: () => void;
  sourceAssessments: SourceAssessment[];
  onSelectSource: (source: SourceAssessment) => void;
  sourceListContainerRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
}

const LinkStatusIcon: React.FC<{ status: LinkValidationStatus | undefined }> = ({ status }) => {
    switch (status) {
        case 'checking':
            return (
                <svg className="animate-spin h-3.5 w-3.5 mr-2 text-light flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <title>Checking link...</title>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            );
        case 'valid':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-status-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <title>Link appears to be valid.</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'invalid':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-status-error flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <title>Link appears to be broken or inaccessible.</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'error_checking':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-2 text-status-warning flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <title>Could not verify link status (may be due to CORS restrictions).</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        default: // unchecked or undefined
            return <div className="h-3.5 w-3.5 mr-2 flex-shrink-0" />; // Placeholder for alignment
    }
};

export const ExportAndSourcesMenu = React.forwardRef<HTMLDivElement, ExportAndSourcesMenuProps>(({
  isGeneratingReport,
  onExportReport,
  onExportSources,
  sourceAssessments,
  onSelectSource,
  sourceListContainerRef,
  onClose,
}, ref) => {

  return (
    <aside ref={ref} className="absolute top-full right-0 mt-2 w-72 md:w-80 bg-content/95 backdrop-blur-sm shadow-2xl rounded-lg border border-ui z-30">
      <header className="flex justify-between items-center p-3 border-b border-ui">
        <h2 className="text-lg font-semibold text-primary-accent">
          Sources & Export
        </h2>
        <button
            onClick={onClose}
            className="p-1 text-light hover:text-main hover:bg-border rounded-full transition-colors"
            title="Close menu"
            aria-label="Close Sources & Export menu"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
        </button>
      </header>
      
      <div className="p-3 max-h-[75vh] overflow-y-auto">
        {/* Source Reliability Section */}
        {sourceAssessments.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-primary-accent mb-1">🧐 Source Reliability</h3>
            <div ref={sourceListContainerRef} className="max-h-60 overflow-y-auto bg-main p-2 rounded-md border border-ui">
              <ul className="space-y-1">
                {sourceAssessments.map((assessment) => (
                  <li key={assessment.index} id={`source-item-${assessment.index}`}>
                    <button
                      onClick={() => onSelectSource(assessment)}
                      className="w-full text-left text-xs p-1.5 rounded hover:bg-border/60 transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                      title={`Click to view details for: ${assessment.name}`}
                    >
                      <div className="font-semibold text-main truncate flex items-center">
                        <LinkStatusIcon status={assessment.linkValidationStatus} />
                        <span className="inline-block text-center w-6 mr-2 py-0.5 bg-main border border-ui rounded text-xs font-bold text-primary-accent flex-shrink-0">{assessment.index}</span>
                        <span className="truncate flex-1">{assessment.name}</span>
                      </div>
                      <span className="text-light/80 truncate block pl-8">{assessment.assessment}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Session Export Buttons */}
        <div className="pt-3 border-t border-ui/50">
            <h3 className="text-sm font-medium text-primary-accent mb-2">📤 Export:</h3>
            <div className="space-y-3">
                <button
                    onClick={onExportSources}
                    disabled={isGeneratingReport || sourceAssessments.length === 0}
                    className="w-full flex items-center justify-center p-2.5 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label="Export assessed sources as a Markdown table"
                    title={sourceAssessments.length === 0 ? "No sources to export" : "Export sources as a Markdown table"}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-8.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125h1.5m12.75 1.5v-1.5c0-.621-.504-1.125-1.125-1.125h-1.5m-10.125 0h7.5c.621 0 1.125.504 1.125 1.125M10.875 5.625h2.25c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504-1.125-1.125-1.125h-2.25c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125z" />
                    </svg>
                    Export Sources (MD)
                </button>
                <button
                    onClick={() => onExportReport('md')}
                    disabled={isGeneratingReport}
                    className="w-full flex items-center justify-center p-2.5 text-sm bg-primary hover:brightness-110 text-on-primary font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label="Export report as a Markdown file"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Export Report (MD)
                </button>
                <button
                    onClick={() => onExportReport('substack')}
                    disabled={isGeneratingReport}
                    className="w-full flex items-center justify-center p-2.5 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label="Export report for Substack as an HTML file"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                    Export for Substack (HTML)
                </button>
                <button
                    onClick={() => onExportReport('pdf')}
                    disabled={isGeneratingReport}
                    className="w-full flex items-center justify-center p-2.5 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label="Export report as a PDF file"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9.75 6.75h9.75c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v10.25c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                    Export Report (PDF)
                </button>
            </div>
        </div>
      </div>
    </aside>
  );
});