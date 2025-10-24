

import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ParsedReportSection } from '../types';
import { ReasoningModal } from './ReasoningModal';

interface TabbedReportProps {
  sections: ParsedReportSection[];
  reasoning?: string;
}

export const TabbedReport: React.FC<TabbedReportProps> = ({ sections, reasoning }) => {
  const initialTabIndex = useMemo(() => {
    // Default to the "Revised Summary" tab if it exists, otherwise the first tab.
    const summaryIndex = sections.findIndex(s => s.title.includes('Revised Summary'));
    return summaryIndex !== -1 ? summaryIndex : 0;
  }, [sections]);

  const [activeTabIndex, setActiveTabIndex] = useState(initialTabIndex);
  const [isReasoningModalOpen, setIsReasoningModalOpen] = useState(false);

  const activeSection = sections[activeTabIndex];

  return (
    <>
      <div className="tabs-container">
        <nav className="tabs-nav" role="tablist">
          {sections.map((section, index) => (
            <button
              key={index}
              id={`tab-${index}`}
              role="tab"
              aria-selected={activeTabIndex === index}
              aria-controls={`tabpanel-${index}`}
              onClick={() => setActiveTabIndex(index)}
              className={`tab-button ${activeTabIndex === index ? 'active' : ''}`}
            >
              {section.title}
            </button>
          ))}
          {reasoning && (
              <button
                onClick={() => setIsReasoningModalOpen(true)}
                className="tab-button"
                title="Show the model's internal reasoning and planning for this report"
              >
                🧠 Model Reasoning
              </button>
          )}
        </nav>
        {activeSection && (
          <div
            id={`tabpanel-${activeTabIndex}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTabIndex}`}
            className="tab-content"
          >
            <div className="markdown-content prose-sm sm:prose-base max-w-none text-gray-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeSection.content}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
      {isReasoningModalOpen && reasoning && (
        <ReasoningModal reasoning={reasoning} onClose={() => setIsReasoningModalOpen(false)} />
      )}
    </>
  );
};