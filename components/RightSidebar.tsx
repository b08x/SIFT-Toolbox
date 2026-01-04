
import React from 'react';
import { SourceAssessment, LinkValidationStatus } from '../types.ts';

interface RightSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    sources: SourceAssessment[];
    onSelectSource: (source: SourceAssessment) => void;
}

const LinkStatusDot: React.FC<{ status: LinkValidationStatus | undefined }> = ({ status }) => {
    switch (status) {
        case 'valid': return <div className="w-2 h-2 rounded-full bg-status-success" title="Link Valid" />;
        case 'invalid': return <div className="w-2 h-2 rounded-full bg-status-error" title="Link Invalid" />;
        case 'checking': return <div className="w-2 h-2 rounded-full bg-status-warning animate-pulse" title="Checking Link..." />;
        case 'error_checking': return <div className="w-2 h-2 rounded-full bg-status-warning" title="Link Status Uncertain" />;
        default: return <div className="w-2 h-2 rounded-full bg-border" title="Unchecked" />;
    }
};

export const RightSidebar: React.FC<RightSidebarProps> = ({
    isOpen, onToggle, sources, onSelectSource
}) => {
    return (
        <aside className={`${isOpen ? 'w-80' : 'w-12'} transition-all duration-300 bg-content border-l border-ui flex flex-col z-40 hidden md:flex`}>
            <div className="p-4 border-b border-ui flex items-center justify-between">
                <button onClick={onToggle} className="p-1 rounded-md hover:bg-border text-light">
                    <span className="material-symbols-outlined">
                        {isOpen ? 'chevron_right' : 'chevron_left'}
                    </span>
                </button>
                {isOpen && <h2 className="font-bold text-primary-accent uppercase tracking-wider text-sm">Source Reliability</h2>}
                <div className="w-6" /> {/* Spacer */}
            </div>

            <div className="flex-grow overflow-y-auto">
                {!isOpen ? (
                    <div className="flex flex-col items-center py-4 space-y-4">
                        <span className="material-symbols-outlined text-primary-accent">fact_check</span>
                        <div className="h-px w-6 bg-ui" />
                        {sources.map(s => (
                            <button 
                                key={s.index} 
                                onClick={() => onSelectSource(s)}
                                className="w-8 h-8 rounded-full border border-ui flex items-center justify-center text-xs font-bold text-primary-accent hover:bg-primary/20"
                            >
                                {s.index}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="p-4 space-y-3">
                        {sources.length === 0 ? (
                            <div className="text-center py-10">
                                <span className="material-symbols-outlined text-light/30 text-4xl">search_off</span>
                                <p className="text-xs text-light mt-2 italic">No sources analyzed yet.</p>
                            </div>
                        ) : (
                            sources.map((source) => (
                                <button
                                    key={source.index}
                                    onClick={() => onSelectSource(source)}
                                    className="w-full text-left p-3 rounded-lg border border-ui hover:border-primary/50 hover:bg-main/50 transition-all group"
                                >
                                    <div className="flex items-start justify-between mb-1">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-xs font-bold px-1.5 py-0.5 bg-primary/20 text-primary-accent rounded border border-primary/30">
                                                #{source.index}
                                            </span>
                                            <h4 className="text-sm font-semibold truncate max-w-[180px] text-main group-hover:text-primary-accent">
                                                {source.name}
                                            </h4>
                                        </div>
                                        <LinkStatusDot status={source.linkValidationStatus} />
                                    </div>
                                    <p className="text-xs text-light line-clamp-2 leading-relaxed">
                                        {source.assessment}
                                    </p>
                                    <div className="mt-2 flex items-center justify-between">
                                        <span className={`text-[10px] px-1.5 rounded-full ${
                                            parseFloat(source.rating) >= 4 ? 'bg-status-success/10 text-status-success' : 
                                            parseFloat(source.rating) >= 2.5 ? 'bg-status-warning/10 text-status-warning' : 
                                            'bg-status-error/10 text-status-error'
                                        }`}>
                                            Rating: {source.rating}/5
                                        </span>
                                        <span className="material-symbols-outlined text-xs text-light group-hover:text-primary-accent">open_in_new</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};
