import React from 'react';
import { SessionConfigurationPanel } from './ConfigurationPage';
import { AboutContent } from './LandingPage';
import { AIProvider, ApiKeyValidationStates, UploadedFile } from '../types';

interface LeftSidebarProps {
    isOpen: boolean;
    onToggleClose: () => void;
    activeView: 'config' | 'about';
    onSwitchView: (view: 'config' | 'about') => void;
    
    // Props for SessionConfigurationPanel
    apiKeyValidation: ApiKeyValidationStates;
    onOpenSettings: () => void;
    sessionTopic: string;
    setSessionTopic: (topic: string) => void;
    sessionContext: string;
    setSessionContext: (context: string) => void;
    sessionFiles: UploadedFile[];
    setSessionFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    sessionUrls: string;
    setSessionUrls: (urls: string) => void;
    onStartSession: () => void;
    selectedProviderKey: AIProvider;
    enableGeminiPreprocessing: boolean;
    onRestoreSession: () => void;
    showRestoreButton: boolean;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
    isOpen, onToggleClose, activeView, onSwitchView, ...configPanelProps
}) => {
    return (
        <aside
            className={`flex-shrink-0 bg-[#333e48]/80 backdrop-blur-sm flex flex-col h-full border-r border-[#5c6f7e] transition-all duration-300 ease-in-out ${
                isOpen ? 'w-80 md:w-96' : 'w-0'
            }`}
        >
            <div className={`overflow-hidden flex-grow flex flex-col ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
                {/* Header with nav and close button */}
                <div className="p-4 flex justify-between items-center border-b border-[#5c6f7e] flex-shrink-0">
                    <div className="flex items-center rounded-md bg-[#212934] p-1">
                        <button
                            onClick={() => onSwitchView('config')}
                            className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${
                                activeView === 'config' ? 'bg-[#e2a32d] text-black' : 'text-gray-300 hover:bg-[#5c6f7e]'
                            }`}
                        >
                            Configuration
                        </button>
                        <button
                            onClick={() => onSwitchView('about')}
                            className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${
                                activeView === 'about' ? 'bg-[#e2a32d] text-black' : 'text-gray-300 hover:bg-[#5c6f7e]'
                            }`}
                        >
                            About
                        </button>
                    </div>
                    <button onClick={onToggleClose} title="Collapse Sidebar" className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-grow scrollbar-thin scrollbar-thumb-[#5c6f7e] scrollbar-track-[#212934]">
                    {activeView === 'config' && <SessionConfigurationPanel {...configPanelProps} />}
                    {activeView === 'about' && <AboutContent />}
                </div>
            </div>
        </aside>
    );
};