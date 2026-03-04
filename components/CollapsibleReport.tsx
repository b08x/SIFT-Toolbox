


import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ParsedReportSection } from '../types.ts';
import { ReasoningModal } from './ReasoningModal.tsx';

interface CollapsibleReportProps {
  sections: ParsedReportSection[];
  reasoning?: string;
}

export const CollapsibleReport: React.FC<CollapsibleReportProps> = ({ sections, reasoning }) => {
  const initialOpenIndex = useMemo(() => {
    // Default to the "Revised Summary" section if it exists, otherwise the first section.
    const summaryIndex = sections.findIndex(s => s.title.includes('Revised Summary'));
    return summaryIndex !== -1 ? summaryIndex : 0;
  }, [sections]);

  const [openSections, setOpenSections] = useState<Set<number>>(new Set([initialOpenIndex]));
  const [isReasoningModalOpen, setIsReasoningModalOpen] = useState(false);

  const toggleSection = (index: number) => {
    setOpenSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      {sections.map((section, index) => {
        const isOpen = openSections.has(index);
        return (
          <div key={index} className="border border-ui rounded-lg overflow-hidden bg-content shadow-sm transition-all duration-200">
            <button
              onClick={() => toggleSection(index)}
              className="w-full flex justify-between items-center p-3 sm:p-4 bg-content hover:bg-border/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
              aria-expanded={isOpen}
            >
              <span className="font-semibold text-main text-sm sm:text-base">{section.title}</span>
              <svg 
                className={`w-5 h-5 text-light transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isOpen && (
              <div className="p-4 border-t border-ui bg-main">
                <div className="markdown-content prose-sm sm:prose-base max-w-none text-main">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        );
      })}
      
      {reasoning && (
        <div className="border border-ui rounded-lg overflow-hidden bg-content shadow-sm mt-2">
          <button
            onClick={() => setIsReasoningModalOpen(true)}
            className="w-full flex justify-between items-center p-3 sm:p-4 bg-content hover:bg-border/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
            title="Show the model's internal reasoning and planning for this report"
          >
            <span className="font-semibold text-primary-accent text-sm sm:text-base flex items-center">
              <span className="mr-2">🧠</span> Model Reasoning
            </span>
            <svg className="w-5 h-5 text-primary-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
      )}

      {isReasoningModalOpen && reasoning && (
        <ReasoningModal reasoning={reasoning} onClose={() => setIsReasoningModalOpen(false)} />
      )}
    </div>
  );
};