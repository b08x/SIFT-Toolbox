

import React, { useState, useEffect, DragEvent } from 'react';
import { AgenticApiService } from '../services/agenticApiService.ts';
import { AIProvider, ApiKeyValidationStates, ApiKeyValidationStatus, AIModelConfig, ConfigurableParams, UploadedFile } from '../types';
import { SliderInput } from './SliderInput'; 
import { AVAILABLE_PROVIDERS_MODELS } from '../models.config';

interface ConfigurationPageProps {
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
    onGoHome: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ConfigurationPage: React.FC<ConfigurationPageProps> = ({
    apiKeyValidation, onOpenSettings, selectedProviderKey, enableGeminiPreprocessing,
    sessionTopic, setSessionTopic, sessionContext, setSessionContext, sessionFiles, setSessionFiles,
    sessionUrls, setSessionUrls,
    onStartSession, onGoHome
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
            return <span className="text-xs text-green-400">API Key Valid</span>;
        }
        return <span className="text-xs text-yellow-400">API Key Required</span>;
    }


    return (
        <div className="bg-[#212934] text-gray-200 min-h-screen p-4 sm:p-8 flex flex-col items-center overflow-y-auto">
            <div className="w-full max-w-3xl">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-[#e2a32d] mb-2">Session Configuration</h1>
                    <p className="text-lg text-[#95aac0]">Set up your SIFT analysis session.</p>
                </header>

                <div className="space-y-8">
                    {/* Section 1: Session Details */}
                    <section className="bg-[#333e48]/60 p-6 rounded-lg shadow-lg border border-[#5c6f7e]/50">
                        <h2 className="text-xl font-semibold text-[#e2a32d] mb-4 border-b border-[#5c6f7e]/50 pb-2">Session Details</h2>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="session-topic" className="block text-sm font-medium text-gray-200 mb-1">Topic / Subject <span className="text-red-400">*</span></label>
                                <input
                                    id="session-topic"
                                    type="text"
                                    value={sessionTopic}
                                    onChange={(e) => setSessionTopic(e.target.value)}
                                    placeholder="e.g., Analysis of a viral video about a protest"
                                    className="w-full p-2 bg-[#212934] border border-[#5c6f7e] rounded-md shadow-sm"
                                />
                                <p className="text-xs text-[#95aac0] mt-1">A clear, concise title for your investigation.</p>
                            </div>
                            <div>
                                <label htmlFor="session-context" className="block text-sm font-medium text-gray-200 mb-1">Additional Context / Instructions</label>
                                <textarea
                                    id="session-context"
                                    rows={4}
                                    value={sessionContext}
                                    onChange={(e) => setSessionContext(e.target.value)}
                                    placeholder="e.g., Focus on identifying the original location and date of the video. Prioritize official statements from law enforcement."
                                    className="w-full p-2 bg-[#212934] border border-[#5c6f7e] rounded-md shadow-sm"
                                />
                                <p className="text-xs text-[#95aac0] mt-1">Provide any specific instructions, perspectives, or background information for the language model.</p>
                            </div>
                             <div>
                                <label htmlFor="session-urls" className="block text-sm font-medium text-gray-200 mb-1">
                                    URLs for Context (one per line)
                                </label>
                                <textarea
                                    id="session-urls"
                                    rows={3}
                                    value={sessionUrls}
                                    onChange={(e) => setSessionUrls(e.target.value)}
                                    placeholder="https://example.com/article1&#10;https://anotherexample.org/report"
                                    className="w-full p-2 bg-[#212934] border border-[#5c6f7e] rounded-md shadow-sm"
                                />
                                <p className="text-xs text-[#95aac0] mt-1">
                                    Provide specific web pages for the language model to analyze. Supported by models like Gemini 2.5 Pro.
                                </p>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-200 mb-1">
                                    Supporting Files (Images, Videos, Docs)
                                </label>
                                <div
                                    onDragEnter={handleDragEnter}
                                    onDragLeave={handleDragLeave}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    className={`relative mt-1 flex justify-center px-6 pt-5 pb-6 border-2 ${isDraggingOver ? 'border-[#e2a32d]' : 'border-[#5c6f7e]'} border-dashed rounded-md transition-colors cursor-pointer hover:border-[#e2a32d]/80`}
                                >
                                    <div className="space-y-1 text-center">
                                        <svg className="mx-auto h-12 w-12 text-[#95aac0]" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <div className="flex text-sm text-[#95aac0]">
                                            <label htmlFor="file-upload" className="relative cursor-pointer bg-transparent rounded-md font-medium text-[#e2a32d] hover:text-[#f5b132] focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[#c36e26]">
                                                <span>Upload files</span>
                                            </label>
                                            <p className="pl-1">or drag and drop</p>
                                        </div>
                                        <p className="text-xs text-[#95aac0]/70">Max 10MB per file</p>
                                    </div>
                                    <input id="file-upload" name="file-upload" type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" multiple onChange={(e) => handleFileChange(e.target.files)} />
                                </div>
                                {sessionFiles.length > 0 && (
                                    <div className="mt-4 space-y-2 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-[#95aac0] scrollbar-track-[#333e48]">
                                        {sessionFiles.map((file, index) => (
                                            <div key={index} className="flex items-center justify-between bg-[#212934] p-2 rounded-md text-sm">
                                                <div className="flex-1 truncate" title={file.name}>
                                                    <span className="font-medium text-gray-300">{file.name}</span>
                                                    <span className="text-xs text-[#95aac0] ml-2">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                                </div>
                                                <button onClick={() => removeFile(index)} className="ml-2 text-red-400 hover:text-red-300 flex-shrink-0" title="Remove file">
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
                    </section>
                </div>

                <footer className="mt-8 flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
                    <button
                        onClick={onGoHome}
                        className="px-6 py-3 text-sm text-[#e2a32d] hover:bg-[#333e48] rounded-md transition-colors w-full sm:w-auto"
                    >
                        Back to Home
                    </button>
                    <div className="flex items-center space-x-2 w-full sm:w-auto">
                        <button
                            onClick={onOpenSettings}
                            className="p-3 bg-gray-600 hover:bg-gray-500 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212934] focus:ring-gray-500 transition-colors"
                            title="Configure API Keys and Model Settings"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.48.398.668 1.03.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.127c-.332.183-.582.495-.645.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.127.332-.183.582-.495.645-.87l.213-1.281z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        <div className="flex flex-col flex-grow">
                             <button
                                onClick={onStartSession}
                                disabled={!isReadyToStart()}
                                className="px-8 py-3 w-full bg-gradient-to-r from-[#e2a32d] to-[#c36e26] hover:from-[#f5b132] hover:to-[#d67e2a] text-white font-bold text-base rounded-lg shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                                title={isReadyToStart() ? "Begin the SIFT session" : "Please fill in the topic and validate the required API key(s) in Settings."}
                            >
                                Start SIFT Session →
                            </button>
                            <div className="text-center mt-1 h-4">{getApiKeyStatusIndicator()}</div>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};