import React, { useState } from 'react';
import { X, Hand, Search, Compass, Share2 } from 'lucide-react';

interface LearnSiftModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SIFT_STEPS = [
    {
        id: 'stop',
        letter: 'S',
        title: 'Stop',
        icon: <Hand size={24} className="text-status-warning" />,
        description: "Don't read or share a source until you know what it is. The goal is to prevent yourself from being influenced by or amplifying misinformation.",
        details: "When you feel strong emotion (surprise, anger, validation), that's your cue to stop. Take a breath and check your emotions before you engage."
    },
    {
        id: 'investigate',
        letter: 'I',
        title: 'Investigate the Source',
        icon: <Search size={24} className="text-primary-accent" />,
        description: "Look up the publication, author, or creator. Understand their expertise, perspective, and potential biases before you engage with their content.",
        details: "Use Wikipedia or a quick web search to find out who is behind the information. What is their track record? Are they a known source of reliable reporting?"
    },
    {
        id: 'find',
        letter: 'F',
        title: 'Find Better Coverage',
        icon: <Compass size={24} className="text-status-success" />,
        description: "Instead of analyzing a single source, find what other trusted sources say about the claim. This is often called 'lateral reading'.",
        details: "Don't just read down a page. Read across tabs. Open new tabs to see what consensus exists among fact-checkers and reliable news outlets regarding the claim."
    },
    {
        id: 'trace',
        letter: 'T',
        title: 'Trace Claims',
        icon: <Share2 size={24} className="text-accent" />,
        description: "Find the original context for claims, quotes, and media. Content is often stripped of its context to mislead. Tracing it back reveals the truth.",
        details: "Follow links back to the source. Do reverse image searches. Read the quote in the context of the full speech or document to ensure it hasn't been misrepresented."
    }
];

export const LearnSiftModal: React.FC<LearnSiftModalProps> = ({ isOpen, onClose }) => {
    const [activeStep, setActiveStep] = useState(SIFT_STEPS[0].id);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-main w-full max-w-3xl rounded-2xl border border-ui shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-ui bg-content">
                    <h2 className="text-lg font-bold text-main flex items-center">
                        <span className="mr-2">🔍</span> Learn About SIFT
                    </h2>
                    <button onClick={onClose} className="p-1 text-light hover:text-main transition-colors rounded-lg hover:bg-ui">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 flex flex-col md:flex-row gap-6">
                    {/* Tabs */}
                    <div className="flex flex-row md:flex-col gap-2 md:w-1/3 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                        {SIFT_STEPS.map(step => (
                            <button
                                key={step.id}
                                onClick={() => setActiveStep(step.id)}
                                className={`flex items-center p-3 rounded-xl transition-all text-left flex-shrink-0 md:flex-shrink-0 ${
                                    activeStep === step.id 
                                        ? 'bg-primary/10 border-primary border text-primary' 
                                        : 'bg-content border border-transparent text-main hover:bg-ui'
                                }`}
                            >
                                <span className={`text-xl font-bold w-8 text-center ${activeStep === step.id ? 'text-primary' : 'text-light'}`}>
                                    {step.letter}
                                </span>
                                <span className="font-semibold text-sm">{step.title}</span>
                            </button>
                        ))}
                    </div>
                    
                    {/* Content */}
                    <div className="md:w-2/3 bg-content rounded-xl p-6 border border-ui min-h-[250px]">
                        {SIFT_STEPS.map(step => (
                            <div 
                                key={step.id} 
                                className={`transition-opacity duration-300 h-full flex flex-col ${activeStep === step.id ? 'opacity-100 block' : 'opacity-0 hidden'}`}
                            >
                                <div className="flex items-center mb-4">
                                    <div className="p-3 bg-main rounded-xl border border-ui mr-4 shadow-sm">
                                        {step.icon}
                                    </div>
                                    <h3 className="text-xl font-bold text-main">{step.title}</h3>
                                </div>
                                <p className="text-main font-medium mb-6 leading-relaxed flex-grow">
                                    {step.description}
                                </p>
                                <div className="bg-main/50 p-4 rounded-lg border border-ui/50 mt-auto">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-light mb-2">Pro Tip</h4>
                                    <p className="text-sm text-light leading-relaxed">
                                        {step.details}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="p-4 border-t border-ui bg-content/50 text-center">
                    <p className="text-xs text-light">
                        Methodology by digital literacy expert Mike Caulfield.
                    </p>
                </div>
            </div>
        </div>
    );
};
