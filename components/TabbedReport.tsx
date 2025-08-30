
import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ParsedReportSection } from '../types';

interface TabbedReportProps {
  sections: ParsedReportSection[];
}

export const TabbedReport: React.FC<TabbedReportProps> = ({ sections }) => {
  const initialTabIndex = useMemo(() => {
    // Default to the "Revised Summary" tab if it exists, otherwise the first tab.
    const summaryIndex = sections.findIndex(s => s.title.includes('Revised Summary'));
    return summaryIndex !== -1 ? summaryIndex : 0;
  }, [sections]);

  const [activeTabIndex, setActiveTabIndex] = useState(initialTabIndex);

  const activeSection = sections[activeTabIndex];

  return (
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
  );
};
