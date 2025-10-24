import React, { useState, DragEvent } from 'react';
import { AIProvider, ApiKeyValidationStates, UploadedFile } from '../types';

interface SessionConfigurationPanelProps {
    apiKeyValidation: ApiKeyValidationStates;
    onOpenSettings: () => void;
    
    selectedProviderKey: AIProvider;
    enableGeminiPreprocessing: boolean;

    sessionTopic: string;
    setSessionTopic: (topic: string) => void;
    sessionContext: string;
    setSessionContext: (context: string) => void;
    sessionFiles: UploadedFile[];
    setSessionFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    sessionUrls: string;
    setSessionUrls: (urls: string) => void;
    
    onStartSession: () => void;
    onRestoreSession: () => void;
    showRestoreButton: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const SessionConfigurationPanel: React.FC<SessionConfigurationPanelProps> = ({
    apiKeyValidation, onOpenSettings, selectedProviderKey, enableGeminiPreprocessing,
    sessionTopic, setSessionTopic, sessionContext, setSessionContext, sessionFiles, setSessionFiles,
    sessionUrls, setSessionUrls,
    onStartSession, onRestoreSession, showRestoreButton
}) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const handleFileChange = (files: FileList | null) => {
        if (!files) return;

        Array.from(files).forEach(file => {
            if (file.size > MAX_FILE_SIZE) {
                alert(`File "${file.name}" is too large (max 10MB).`);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const newFile: UploadedFile = {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    base64Data: e.target?.result as string,
                };
                setSessionFiles(prev => [...prev, newFile]);
            };
            reader.onerror = (err) => {
                console.error("FileReader error: ", err);
                alert(`Error reading file "${file.name}".`);
            };
            reader.readAsDataURL(file);
        });
    };

    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
    };
    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };
    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };
    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileChange(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const removeFile = (indexToRemove: number) => {
        setSessionFiles(sessionFiles.filter((_, index) => index !== indexToRemove));
    };
    
    const isReadyToStart = () => {
        if (!sessionTopic.trim()) return false;
        if (selectedProviderKey === AIProvider.OPENROUTER && enableGeminiPreprocessing) {
            return apiKeyValidation[AIProvider.OPENROUTER] === 'valid' && apiKeyValidation[AIProvider.GOOGLE_GEMINI] === 'valid';
        }
        return apiKeyValidation[selectedProviderKey] === 'valid';
    };

    const getApiKeyStatusIndicator = () => {
        if (isReadyToStart()) {
            return <span className="text-xs text-status-success">API Key Valid</span>;
        }
        return <span className="text-xs text-status-warning">API Key Required</span>;
    }


    return (
        <div className="p-4 space-y-6">
            <div className="space-y-4">
                <div>
                    <label htmlFor="session-topic" className="block text-sm font-medium text-main mb-1">Topic / Subject <span className="text-status-error">*</span></label>
                    <input
                        id="session-topic"
                        type="text"
                        value={sessionTopic}
                        onChange={(e) => setSessionTopic(e.target.value)}
                        placeholder="e.g., Analysis of a viral video"
                        className="w-full p-2 bg-main border border-ui rounded-md shadow-sm"
                    />
                    <p className="text-xs text-light mt-1">A clear, concise title for your investigation.</p>
                </div>
                <div>
                    <label htmlFor="session-context" className="block text-sm font-medium text-main mb-1">Additional Context / Instructions</label>
                    <textarea
                        id="session-context"
                        rows={4}
                        value={sessionContext}
                        onChange={(e) => setSessionContext(e.target.value)}
                        placeholder="e.g., Focus on identifying the original location and date of the video."
                        className="w-full p-2 bg-main border border-ui rounded-md shadow-sm"
                    />
                    <p className="text-xs text-light mt-1">Provide any specific instructions for the language model.</p>
                </div>
                    <div>
                    <label htmlFor="session-urls" className="block text-sm font-medium text-main mb-1">
                        URLs for Context (one per line)
                    </label>
                    <textarea
                        id="session-urls"
                        rows={3}
                        value={sessionUrls}
                        onChange={(e) => setSessionUrls(e.target.value)}
                        placeholder="https://example.com/article1&#10;https://anotherexample.org/report"
                        className="w-full p-2 bg-main border border-ui rounded-md shadow-sm"
                    />
                    <p className="text-xs text-light mt-1">
                        Provide specific web pages for the model to analyze.
                    </p>
                </div>
                    <div>
                    <label className="block text-sm font-medium text-main mb-1">
                        Supporting Files
                    </label>
                    <div
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        className={`relative mt-1 flex justify-center px-6 pt-5 pb-6 border-2 ${isDraggingOver ? 'border-primary' : 'border-ui'} border-dashed rounded-md transition-colors cursor-pointer hover:border-primary/80`}
                    >
                        <div className="space-y-1 text-center">
                            <svg className="mx-auto h-12 w-12 text-light" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="flex text-sm text-light">
                                <label htmlFor="file-upload" className="relative cursor-pointer bg-transparent rounded-md font-medium text-primary-accent hover:brightness-125 focus-within:outline-none">
                                    <span>Upload files</span>
                                </label>
                                <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-light/70">Max 10MB per file</p>
                        </div>
                        <input id="file-upload" name="file-upload" type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" multiple onChange={(e) => handleFileChange(e.target.files)} />
                    </div>
                    {sessionFiles.length > 0 && (
                        <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                            {sessionFiles.map((file, index) => (
                                <div key={index} className="flex items-center justify-between bg-main p-2 rounded-md text-sm">
                                    <div className="flex-1 truncate" title={file.name}>
                                        <span className="font-medium text-main">{file.name}</span>
                                        <span className="text-xs text-light ml-2">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                    </div>
                                    <button onClick={() => removeFile(index)} className="ml-2 text-status-error hover:brightness-110 flex-shrink-0" title="Remove file">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-6 space-y-3">
                <div className="flex items-center space-x-2 w-full">
                    <button
                        onClick={onOpenSettings}
                        className="p-3 bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm"
                        title="Configure API Keys and Model Settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.48.398.668 1.03.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.127c-.332.183-.582.495-.645-.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.127.332-.183.582-.495.645-.87l.213-1.281z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    <div className="flex flex-col flex-grow">
                            <button
                            onClick={onStartSession}
                            disabled={!isReadyToStart()}
                            className="px-8 py-3 w-full bg-primary hover:brightness-110 text-on-primary font-bold text-base rounded-lg shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                            title={isReadyToStart() ? "Begin the SIFT session" : "Please fill in the topic and validate the required API key(s) in Settings."}
                        >
                            Start SIFT Session
                        </button>
                        <div className="text-center mt-1 h-4">{getApiKeyStatusIndicator()}</div>
                    </div>
                </div>
                {showRestoreButton && (
                    <button 
                        onClick={onRestoreSession}
                        className="w-full px-8 py-3 bg-content border border-ui hover:bg-border text-main font-bold text-sm rounded-lg shadow-xl"
                    >
                        Restore Previous Session ↩
                    </button>
                )}
            </div>
        </div>
    );
};