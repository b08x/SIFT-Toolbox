import React, { useState, useEffect } from 'react';
import { AgenticApiService } from '../services/agenticApiService.ts';
import { AIProvider, ApiKeyValidationStates, AIModelConfig, ConfigurableParams, ModelParameter } from '../types';
import { SliderInput } from './SliderInput'; 
import { AVAILABLE_PROVIDERS_MODELS } from '../models.config';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
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
}

const uniqueProviders = Array.from(new Set(AVAILABLE_PROVIDERS_MODELS.map(m => m.provider)));

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen, onClose, userApiKeys, setUserApiKeys, apiKeyValidation, setApiKeyValidation,
    selectedProviderKey, setSelectedProviderKey, enableGeminiPreprocessing, setEnableGeminiPreprocessing,
    availableModels, selectedModelId, onSelectModelId, modelConfigParams, onModelConfigParamChange
}) => {
    const [isValidationLoading, setIsValidationLoading] = useState<Partial<Record<AIProvider, boolean>>>({});
    const [localKeys, setLocalKeys] = useState<{ [key in AIProvider]?: string }>(userApiKeys);

    useEffect(() => {
        setLocalKeys(userApiKeys);
    }, [userApiKeys]);

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
    
    const modelsForSelectedProvider = availableModels.filter(m => m.provider === selectedProviderKey);
    const selectedModelConfig = modelsForSelectedProvider.find(m => m.id === selectedModelId);

    const handleModelConfigChange = (key: string, value: number | string) => {
        onModelConfigParamChange(prev => ({ ...prev, [key]: value }));
    };

    const renderApiKeyInput = (provider: AIProvider, label: string, placeholder: string, instructions?: React.ReactNode) => (
        <div>
            <label htmlFor={`modal-${provider}-key`} className="block text-sm font-medium text-gray-200 mb-1">{label}</label>
            <div className="flex items-center space-x-2">
                <input
                    id={`modal-${provider}-key`}
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

    if (!isOpen) return null;

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
                <header className="flex items-center justify-between p-4 border-b border-[#5c6f7e] flex-shrink-0">
                    <h2 className="text-lg font-bold text-[#e2a32d]">Settings</h2>
                    <button 
                        onClick={onClose} 
                        className="p-1 rounded-full text-gray-400 hover:bg-[#5c6f7e] hover:text-white transition-colors"
                        aria-label="Close settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                
                <main className="p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[#5c6f7e] scrollbar-track-[#212934] space-y-8">
                    {/* Section 2: AI Provider & API Keys */}
                    <section>
                        <h2 className="text-xl font-semibold text-[#e2a32d] mb-4 border-b border-[#5c6f7e]/50 pb-2">Language Model Provider & API Keys</h2>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="provider-select-modal" className="block text-sm font-medium text-gray-200 mb-1">Language Model Provider</label>
                                <select
                                    id="provider-select-modal"
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
                    <section>
                         <h2 className="text-xl font-semibold text-[#e2a32d] mb-4 border-b border-[#5c6f7e]/50 pb-2">Model Configuration</h2>
                         <div className="space-y-4">
                            <div>
                                <label htmlFor="model-select-modal" className="block text-sm font-medium text-gray-200 mb-1">Model</label>
                                <select id="model-select-modal" value={selectedModelId} onChange={(e) => onSelectModelId(e.target.value)} className="w-full p-2 bg-[#212934] border border-[#5c6f7e] rounded-md shadow-sm">
                                    {modelsForSelectedProvider.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>
                            {selectedModelConfig && selectedModelConfig.parameters.length > 0 && (
                                <div className="space-y-3 pt-2">
                                    {selectedModelConfig.parameters.map((param: ModelParameter) => (
                                        param.type === 'slider' && param.min !== undefined && param.max !== undefined && param.step !== undefined && (
                                            <SliderInput
                                                key={param.key}
                                                id={`modal-${selectedModelConfig.id}-${param.key}`}
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
                </main>

                <footer className="p-4 border-t border-[#5c6f7e] text-right flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-[#5c6f7e] hover:bg-[#708495] text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#333e48] focus:ring-[#95aac0] transition-colors"
                    >
                        Done
                    </button>
                </footer>
            </div>
        </div>
    );
};
