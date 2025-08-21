import React from 'react';
import { SourceAssessment } from '../types';

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
                            <a 
                                href={source.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-[#e2a32d] hover:underline break-all"
                            >
                                {source.url}
                            </a>
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