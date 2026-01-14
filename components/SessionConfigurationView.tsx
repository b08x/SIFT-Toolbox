
import React, { useState, DragEvent } from 'react';
import { UploadedFile } from '../types.ts';

interface SessionConfigurationViewProps {
    isApiKeyValid: boolean;
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
    onRestoreSession: () => void;
    showRestoreButton: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const SessionConfigurationView: React.FC<SessionConfigurationViewProps> = ({
    isApiKeyValid, onOpenSettings,
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

    const canStart = sessionTopic.trim().length > 0 || sessionFiles.length > 0;

    const renderContent = () => {
        if (!isApiKeyValid) {
            return (
                <div className="flex flex-col items-center justify-center text-center p-8 h-full bg-main/50 rounded-lg">
                    <span className="text-6xl mb-4">🔑</span>
                    <h2 className="text-2xl font-bold text-main">API Key Required</h2>
                    <p className="text-light mt-2 max-w-md">
                        Please configure and validate a valid API key in the settings to enable the SIFT session controls.
                    </p>
                    <button 
                        onClick={onOpenSettings}
                        className="mt-6 px-5 py-2.5 bg-primary hover:brightness-110 text-on-primary font-bold text-base rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-primary/50"
                    >
                        Open Settings
                    </button>
                </div>
            );
        }

        return (
            <div className="p-4 space-y-6">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="session-topic" className="block text-sm font-medium text-main mb-1">Topic / Subject</label>
                        <input
                            id="session-topic"
                            type="text"
                            value={sessionTopic}
                            onChange={(e) => setSessionTopic(e.target.value)}
                            placeholder="e.g., Analysis of a viral video"
                            className="w-full p-2 bg-main border border-ui rounded-md shadow-sm"
                        />
                        <p className="text-xs text-light mt-1">A clear, concise title or claim for your investigation.</p>
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
                        <p className="text-xs text-light mt-1">Provide any specific instructions for the AI analyst.</p>
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
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-6 space-y-3">
                    <button
                        onClick={onStartSession}
                        disabled={!isApiKeyValid || !canStart}
                        className="px-8 py-3 w-full bg-primary hover:brightness-110 text-on-primary font-bold text-base rounded-lg shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title={isApiKeyValid ? "Begin the SIFT session" : "Please validate the required API key(s) in Settings."}
                    >
                        Start SIFT Session
                    </button>
                    {showRestoreButton && (
                        <button 
                            onClick={onRestoreSession}
                            className="w-full px-8 py-3 bg-content border border-ui hover:bg-border text-main font-bold text-sm rounded-lg shadow-xl transition-all"
                        >
                            Restore Previous Session ↩
                        </button>
                    )}
                </div>
            </div>
        );
    }
    
    return renderContent();
};
