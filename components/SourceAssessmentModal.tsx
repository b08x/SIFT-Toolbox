import React from 'react';
import { SourceAssessment, LinkValidationStatus } from '../types';

interface SourceAssessmentModalProps {
  source: SourceAssessment;
  onClose: () => void;
}

const RatingDisplay = ({ rating }: { rating: string }) => {
    const numericRating = parseFloat(rating.split('–')[0]); // Take the lower bound for simplicity
    const fullStars = Math.floor(numericRating);
    const halfStar = numericRating % 1 !== 0;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    return (
        <div className="flex items-center">
            {[...Array(fullStars)].map((_, i) => <span key={`full-${i}`} className="text-yellow-400">★</span>)}
            {halfStar && <span className="text-yellow-400">☆</span>}
            {[...Array(emptyStars)].map((_, i) => <span key={`empty-${i}`} className="text-gray-500">★</span>)}
            <span className="ml-2 text-sm text-gray-400">({rating})</span>
        </div>
    );
};

const LinkStatusIcon: React.FC<{ status: LinkValidationStatus | undefined }> = ({ status }) => {
    switch (status) {
        case 'checking':
            return (
                <svg className="animate-spin h-5 w-5 text-[#95aac0] flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" title="Checking link...">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            );
        case 'valid':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} title="Link appears to be valid.">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'invalid':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} title="Link appears to be broken or inaccessible.">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'error_checking':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} title="Could not verify link status (may be due to CORS restrictions).">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        default: // unchecked or undefined
            return <div className="h-5 w-5 flex-shrink-0" />;
    }
};

const getStatusText = (status: LinkValidationStatus | undefined): string => {
    switch (status) {
        case 'checking': return "Checking link status...";
        case 'valid': return "Link appears to be valid and accessible.";
        case 'invalid': return "Link appears to be broken or inaccessible (e.g., 404 error).";
        case 'error_checking': return "Could not automatically verify this link's status. This can be due to security restrictions (CORS) and doesn't necessarily mean the link is broken. Please verify manually.";
        default: return "Link status has not been checked yet.";
    }
};

export const SourceAssessmentModal: React.FC<SourceAssessmentModalProps> = ({ source, onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-[#333e48] text-gray-200 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-[#5c6f7e]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-[#5c6f7e]">
                    <h2 className="text-lg font-bold text-[#e2a32d]">Source Assessment Details</h2>
                    <button 
                        onClick={onClose} 
                        className="p-1 rounded-full text-gray-400 hover:bg-[#5c6f7e] hover:text-white transition-colors"
                        aria-label="Close modal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <main className="p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[#5c6f7e] scrollbar-track-[#212934]">
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-sm font-medium text-gray-400">Source Name</h3>
                            <p className="text-lg font-semibold text-gray-100">{source.name}</p>
                        </div>

                         <div>
                            <h3 className="text-sm font-medium text-gray-400">URL</h3>
                            <div className="flex items-center space-x-2">
                                <LinkStatusIcon status={source.linkValidationStatus} />
                                <a 
                                    href={source.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-sm text-[#e2a32d] hover:underline break-all"
                                >
                                    {source.url}
                                </a>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 pl-7">{getStatusText(source.linkValidationStatus)}</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-400">Usefulness Assessment</h3>
                                <p className="text-base text-gray-200">{source.assessment}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-400">Reliability Rating</h3>
                                <RatingDisplay rating={source.rating} />
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium text-gray-400">Notes from Model</h3>
                            <div className="mt-1 p-3 bg-[#212934] rounded-md text-sm text-gray-300 whitespace-pre-wrap">
                                {source.notes || <span className="italic">No notes provided.</span>}
                            </div>
                        </div>

                    </div>
                </main>

                <footer className="p-4 border-t border-[#5c6f7e] text-right">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#333e48] focus:ring-[#95aac0] transition-colors"
                    >
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};