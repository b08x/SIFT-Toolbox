import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ReasoningModalProps {
  reasoning: string;
  onClose: () => void;
}

export const ReasoningModal: React.FC<ReasoningModalProps> = ({ reasoning, onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-content text-main rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-ui"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-ui">
                    <h2 className="text-lg font-bold text-primary-accent flex items-center">
                        <span className="mr-2">🧠</span> Model's Reasoning
                    </h2>
                    <button 
                        onClick={onClose} 
                        className="p-1 rounded-full text-light hover:bg-border hover:text-main transition-colors"
                        aria-label="Close modal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <main className="p-6 overflow-y-auto">
                    <div className="markdown-content prose-sm sm:prose-base max-w-none bg-main p-4 rounded-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoning}</ReactMarkdown>
                    </div>
                </main>

                <footer className="p-4 border-t border-ui text-right">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors"
                    >
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};
