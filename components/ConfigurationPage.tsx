

import React, { useState, useEffect, DragEvent } from 'react';
import { AgenticApiService } from '../services/agenticApiService.ts';
import { AIProvider, ApiKeyValidationStates, ApiKeyValidationStatus, AIModelConfig, ConfigurableParams, ModelParameter, UploadedFile } from '../types';
import { SliderInput } from './SliderInput'; 
import { AVAILABLE_PROVIDERS_MODELS } from '../models.config';

interface ConfigurationPageProps {
    userApiKeys: { [key in AIProvider]?: string };
    setUserApiKeys: (keys: { [key in AIProvider]?: string }) => void;
    apiKeyValidation: ApiKeyValidationStates;
    setApiKeyValidation: (validation: ApiKeyValidationStates | ((prevState: ApiKeyValidationStates) => ApiKeyValidationStates)) => void;
    
    selectedProviderKey: AIProvider;
    setSelectedProviderKey: (provider: AIProvider) => void;
    enableGeminiPreprocessing: boolean;
    setEnableGeminiPreprocessing: (enabled: boolean) => void;

    availableModels: AIModelConfig[];
    selectedModelId: string;
    onSelectModelId: (modelId: string) => void;
    modelConfigParams: ConfigurableParams;
    onModelConfigParamChange: React.Dispatch<React.SetStateAction<ConfigurableParams>>;

    sessionTopic: string;
    setSessionTopic: (topic: string) => void;
    sessionContext: string;
    setSessionContext: (context: string) => void;
    sessionFiles: UploadedFile[];
    setSessionFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    sessionUrls: string;
    setSessionUrls: (urls: string) => void;
    
    onStartSession: () => void;
    onResetApp: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const uniqueProviders = Array.from(new Set(AVAILABLE_PROVIDERS_MODELS.map(m => m.provider)));

export const ConfigurationPage: React.FC<ConfigurationPageProps> = ({
    userApiKeys, setUserApiKeys, apiKeyValidation, setApiKeyValidation,
    selectedProviderKey, setSelectedProviderKey, enableGeminiPreprocessing, setEnableGeminiPreprocessing,
    availableModels, selectedModelId, onSelectModelId, modelConfigParams, onModelConfigParamChange,
    sessionTopic, setSessionTopic, sessionContext, setSessionContext, sessionFiles, setSessionFiles,
    sessionUrls, setSessionUrls,
    onStartSession, onResetApp
}) => {
    const [isValidationLoading, setIsValidationLoading] = useState<Partial<Record<AIProvider, boolean>>>({});
    const [localKeys, setLocalKeys] = useState<{ [key in AIProvider]?: string }>(userApiKeys);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    useEffect(() => {
        setLocalKeys(userApiKeys);
    }, [userApiKeys]);

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


    const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newProvider = event.target.value as AIProvider;
        setSelectedProviderKey(newProvider);
        const firstModel = availableModels.find(m => m.provider === newProvider);
        if (firstModel) {
            onSelectModelId(firstModel.id);
        }
    };

    const updateApiKey = (provider: AIProvider, key: string) => {
        setLocalKeys(prev => ({ ...prev, [provider]: key }));
        setUserApiKeys({ ...userApiKeys, [provider]: key });
        setApiKeyValidation(prev => ({ ...prev, [provider]: 'unchecked' }));
    };

    const validateKey = async (provider: AIProvider) => {
        const key = localKeys[provider] || '';
        if (!key.trim()) {
            setApiKeyValidation(prev => ({ ...prev, [provider]: 'invalid' }));
            return;
        }
        setIsValidationLoading(prev => ({ ...prev, [provider]: true }));
        setApiKeyValidation(prev => ({ ...prev, [provider]: 'pending' }));
        const { isValid, error } = await AgenticApiService.validateApiKey(provider, key);
        setApiKeyValidation(prev => ({ ...prev, [provider]: isValid ? 'valid' : 'invalid' }));
        setIsValidationLoading(prev => ({ ...prev, [provider]: false }));
        if (!isValid) {
            alert(`API Key validation failed for ${provider}: ${error || 'Please check the key and try again.'}`);
        }
    };

    const getValidationStatusUI = (provider: AIProvider) => {
        const status = apiKeyValidation[provider];
        if (isValidationLoading[provider]) return <span className="text-xs text-[#e2a32d]">Validating...</span>;
        if (status === 'valid') return <span className="text-xs text-green-400">Key is valid.</span>;
        if (status === 'invalid') return <span className="text-xs text-red-400">Invalid or empty key.</span>;
        return <span className="text-xs text-[#95aac0]/70">Key is unchecked.</span>;
    };
    
    const isReadyToStart = () => {
        if (!sessionTopic.trim()) return false;
        if (selectedProviderKey === AIProvider.OPENROUTER && enableGeminiPreprocessing) {
            return apiKeyValidation[AIProvider.OPENROUTER] === 'valid' && apiKeyValidation[AIProvider.GOOGLE_GEMINI] === 'valid';
        }
        return apiKeyValidation[selectedProviderKey] === 'valid';
    };

    const modelsForSelectedProvider = availableModels.filter(m => m.provider === selectedProviderKey);
    const selectedModelConfig = modelsForSelectedProvider.find(m => m.id === selectedModelId);

    const handleModelConfigChange = (key: string, value: number | string) => {
        onModelConfigParamChange(prev => ({ ...prev, [key]: value }));
    };

    const renderApiKeyInput = (provider: AIProvider, label: string, placeholder: string, instructions?: React.ReactNode) => (
        <div>
            <label htmlFor={`${provider}-key`} className="block text-sm font-medium text-gray-200 mb-1">{label}</label>
            <div className="flex items-center space-x-2">
                <input
                    id={`${provider}-key`}
                    type="password"
                    value={localKeys[provider] || ''}
                    onChange={(e) => updateApiKey(provider, e.target.value)}
                    placeholder={placeholder}
                    className="flex-grow p-2 bg-[#212934] border border-[#5c6f7e] rounded-md shadow-sm focus:ring-[#e2a32d] focus:border-[#e2a32d] text-gray-200"
                />
                <button
                    onClick={() => validateKey(provider)}
                    disabled={isValidationLoading[provider] || !localKeys[provider]?.trim()}
                    className="px-3 py-2 text-sm bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Validate
                </button>
            </div>
            {instructions}
            <div className="mt-1 h-4">{getValidationStatusUI(provider)}</div>
        </div>
    );

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
                        <h2 className="text-xl font-semibold text-[#e2a32d] mb-4 border-b border-[#5c6f7e]/50 pb-2">1. Session Details</h2>
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

                    {/* Section 2: AI Provider & API Keys */}
                    <section className="bg-[#333e48]/60 p-6 rounded-lg shadow-lg border border-[#5c6f7e]/50">
                        <h2 className="text-xl font-semibold text-[#e2a32d] mb-4 border-b border-[#5c6f7e]/50 pb-2">2. Language Model Provider & API Keys</h2>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="provider-select" className="block text-sm font-medium text-gray-200 mb-1">Language Model Provider</label>
                                <select
                                    id="provider-select"
                                    value={selectedProviderKey}
                                    onChange={handleProviderChange}
                                    className="w-full p-2 bg-[#212934] border border-[#5c6f7e] rounded-md shadow-sm"
                                >
                                    {uniqueProviders.map(p => <option key={p} value={p}>{(p as string).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                                </select>
                            </div>
                            
                            {selectedProviderKey === AIProvider.GOOGLE_GEMINI && renderApiKeyInput(AIProvider.GOOGLE_GEMINI, "Google Gemini API Key", "Enter your Gemini API Key", <p className="text-xs text-[#95aac0] mt-1">Get key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#e2a32d] underline">Google AI Studio</a>.</p>)}
                            {selectedProviderKey === AIProvider.OPENAI && renderApiKeyInput(AIProvider.OPENAI, "OpenAI API Key", "Enter your OpenAI API Key")}
                            {selectedProviderKey === AIProvider.MISTRAL && renderApiKeyInput(AIProvider.MISTRAL, "Mistral API Key", "Enter your Mistral API Key")}
                            
                            {selectedProviderKey === AIProvider.OPENROUTER && (
                                <>
                                    {renderApiKeyInput(AIProvider.OPENROUTER, "OpenRouter API Key", "Enter your OpenRouter API Key")}
                                    <div className="pt-2">
                                        <label htmlFor="gemini-preproc" className="flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" id="gemini-preproc" checked={enableGeminiPreprocessing} onChange={(e) => setEnableGeminiPreprocessing(e.target.checked)} className="h-4 w-4 rounded border-gray-500 text-[#c36e26] focus:ring-[#c36e26] accent-[#c36e26]" />
                                            <span className="text-sm font-medium text-gray-200">Enable Gemini Preprocessing</span>
                                        </label>
                                        <p className="text-xs text-[#95aac0] mt-1">Use Gemini for SIFT grounding. Requires a valid Google Gemini API key below.</p>
                                    </div>
                                    {enableGeminiPreprocessing && renderApiKeyInput(AIProvider.GOOGLE_GEMINI, "Google Gemini API Key (for Preprocessing)", "Enter your Gemini API Key")}
                                </>
                            )}
                        </div>
                    </section>
                    
                    {/* Section 3: Model Configuration */}
                    <section className="bg-[#333e48]/60 p-6 rounded-lg shadow-lg border border-[#5c6f7e]/50">
                         <h2 className="text-xl font-semibold text-[#e2a32d] mb-4 border-b border-[#5c6f7e]/50 pb-2">3. Model Configuration</h2>
                         <div className="space-y-4">
                            <div>
                                <label htmlFor="model-select" className="block text-sm font-medium text-gray-200 mb-1">Model</label>
                                <select id="model-select" value={selectedModelId} onChange={(e) => onSelectModelId(e.target.value)} className="w-full p-2 bg-[#212934] border border-[#5c6f7e] rounded-md shadow-sm">
                                    {modelsForSelectedProvider.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>
                            {selectedModelConfig && selectedModelConfig.parameters.length > 0 && (
                                <div className="space-y-3 pt-2">
                                    {selectedModelConfig.parameters.map((param: ModelParameter) => (
                                        param.type === 'slider' && param.min !== undefined && param.max !== undefined && param.step !== undefined && (
                                            <SliderInput
                                                key={param.key}
                                                id={`${selectedModelConfig.id}-${param.key}`}
                                                label={param.label}
                                                min={param.min} max={param.max} step={param.step}
                                                value={Number(modelConfigParams[param.key]) || Number(param.defaultValue)}
                                                onChange={(value) => handleModelConfigChange(param.key, value)}
                                                description={param.description} unit={param.unit}
                                            />
                                        )
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <footer className="mt-8 flex items-center justify-between">
                    <button
                        onClick={onResetApp}
                        className="px-6 py-3 text-sm text-[#e2a32d] hover:bg-[#333e48] rounded-md transition-colors"
                    >
                        Back to Home
                    </button>
                    <button
                        onClick={onStartSession}
                        disabled={!isReadyToStart()}
                        className="px-8 py-3 bg-gradient-to-r from-[#e2a32d] to-[#c36e26] hover:from-[#f5b132] hover:to-[#d67e2a] text-white font-bold text-base rounded-lg shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                        title={isReadyToStart() ? "Begin the SIFT session" : "Please fill in the topic and validate the required API key(s)."}
                    >
                        Start SIFT Session →
                    </button>
                </footer>
            </div>
        </div>
    );
};