
import React, { useState, useEffect } from 'react';
import { AgenticApiService } from '../services/agenticApiService.ts';
import { AIProvider, ApiKeyValidationStates, AIModelConfig, ConfigurableParams, ModelParameter } from '../types.ts';
import { SliderInput } from './SliderInput.tsx'; 
import { SIFT_CHAT_SYSTEM_PROMPT, SIFT_BIAS_FOCUS_PROMPT, SIFT_MISINFORMATION_FOCUS_PROMPT, SIFT_DEEP_BACKGROUND_PROMPT } from '../prompts.ts';

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
    onModelsUpdate: (provider: AIProvider, newModels: AIModelConfig[]) => void;
    selectedModelId: string;
    onSelectModelId: (modelId: string) => void;
    modelConfigParams: ConfigurableParams;
    onModelConfigParamChange: React.Dispatch<React.SetStateAction<ConfigurableParams>>;
    customSystemPrompt: string;
    setCustomSystemPrompt: (prompt: string) => void;
}

const uniqueProviders = Array.from(new Set(Object.values(AIProvider)));

const promptPresets = [
    { name: 'Default SIFT', prompt: SIFT_CHAT_SYSTEM_PROMPT },
    { name: 'Bias Analysis Focus', prompt: SIFT_BIAS_FOCUS_PROMPT },
    { name: 'Misinformation Focus', prompt: SIFT_MISINFORMATION_FOCUS_PROMPT },
    { name: 'Deep Background', prompt: SIFT_DEEP_BACKGROUND_PROMPT },
];


export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen, onClose, userApiKeys, setUserApiKeys, apiKeyValidation, setApiKeyValidation,
    selectedProviderKey, setSelectedProviderKey, enableGeminiPreprocessing, setEnableGeminiPreprocessing,
    availableModels, onModelsUpdate, selectedModelId, onSelectModelId, modelConfigParams, onModelConfigParamChange,
    customSystemPrompt, setCustomSystemPrompt
}) => {
    const [isValidationLoading, setIsValidationLoading] = useState<Partial<Record<AIProvider, boolean>>>({});
    const [isRefreshLoading, setIsRefreshLoading] = useState(false);
    const [localKeys, setLocalKeys] = useState<{ [key in AIProvider]?: string }>(userApiKeys);
    const [selectedPreset, setSelectedPreset] = useState<string>('custom');

    useEffect(() => {
        setLocalKeys(userApiKeys);
    }, [userApiKeys]);

    useEffect(() => {
      const model = availableModels.find(m => m.id === selectedModelId);
      if (model && !model.supportsGoogleSearch) {
        setEnableGeminiPreprocessing(true);
      }
    }, [selectedModelId, availableModels, setEnableGeminiPreprocessing]);
    
    useEffect(() => {
      const matchingPreset = promptPresets.find(p => p.prompt === customSystemPrompt);
      if (matchingPreset) {
        setSelectedPreset(matchingPreset.name);
      } else if (customSystemPrompt === '') {
        setSelectedPreset('Default SIFT');
      } else {
        setSelectedPreset('custom');
      }
    }, [customSystemPrompt]);


    const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newProvider = event.target.value as AIProvider;
        setSelectedProviderKey(newProvider);
        const firstModel = availableModels.find(m => m.provider === newProvider);
        if (firstModel) {
            onSelectModelId(firstModel.id);
        } else {
            onSelectModelId(''); 
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

        if (isValid) {
            await fetchModels(provider, key);
        } else {
            alert(`API Key validation failed for ${provider}: ${error || 'Please check the key and try again.'}`);
        }
        setIsValidationLoading(prev => ({ ...prev, [provider]: false }));
    };

    const fetchModels = async (provider: AIProvider, key: string) => {
        setIsRefreshLoading(true);
        try {
            const newModels = await AgenticApiService.fetchAvailableModels(provider, key);
            if (newModels.length > 0) {
                onModelsUpdate(provider, newModels);
                // If current model isn't in the new list, pick the first one
                if (!newModels.find(m => m.id === selectedModelId)) {
                    onSelectModelId(newModels[0].id);
                }
            }
        } catch (fetchError) {
            console.error(`Failed to fetch models for ${provider}:`, fetchError);
            alert(`Failed to fetch the model list for ${provider}. Using existing list.`);
        } finally {
            setIsRefreshLoading(false);
        }
    };

    const handleRefreshModels = () => {
        const key = selectedProviderKey === AIProvider.GOOGLE_GEMINI ? (process.env.API_KEY || '') : (localKeys[selectedProviderKey] || '');
        if (!key && selectedProviderKey !== AIProvider.GOOGLE_GEMINI) {
            alert("Please provide an API key first.");
            return;
        }
        fetchModels(selectedProviderKey, key);
    };

    const getValidationStatusUI = (provider: AIProvider) => {
        const status = apiKeyValidation[provider];
        if (isValidationLoading[provider]) return <span className="text-xs text-primary-accent animate-pulse">Validating...</span>;
        if (status === 'valid') return <span className="text-xs text-status-success">Key is valid.</span>;
        if (status === 'invalid') return <span className="text-xs text-status-error">Invalid or empty key.</span>;
        return <span className="text-xs text-light/70">Key is unchecked.</span>;
    };
    
    const modelsForSelectedProvider = availableModels.filter(m => m.provider === selectedProviderKey);
    const selectedModelConfig = modelsForSelectedProvider.find(m => m.id === selectedModelId);

    const handleModelConfigChange = (key: string, value: number | string) => {
        onModelConfigParamChange(prev => ({ ...prev, [key]: value }));
    };

    const handlePresetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const presetName = event.target.value;
        setSelectedPreset(presetName);
        if (presetName === 'custom') return;

        const preset = promptPresets.find(p => p.name === presetName);
        if (preset) {
            if (preset.name === 'Default SIFT') {
                setCustomSystemPrompt('');
            } else {
                setCustomSystemPrompt(preset.prompt);
            }
        }
    };

    const renderApiKeyInput = (provider: AIProvider, label: string, placeholder: string, instructions?: React.ReactNode) => (
        <div>
            <label htmlFor={`modal-${provider}-key`} className="block text-sm font-medium text-main mb-1">{label}</label>
            <div className="flex items-center space-x-2">
                <input
                    id={`modal-${provider}-key`}
                    type="password"
                    value={localKeys[provider] || ''}
                    onChange={(e) => updateApiKey(provider, e.target.value)}
                    placeholder={placeholder}
                    className="flex-grow p-2 bg-main border border-ui rounded-md shadow-sm focus:ring-primary focus:border-primary text-main"
                />
                <button
                    onClick={() => validateKey(provider)}
                    disabled={isValidationLoading[provider] || !localKeys[provider]?.trim()}
                    className="px-3 py-2 text-sm bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Validate
                </button>
            </div>
            {instructions}
            <div className="mt-1 h-4">{getValidationStatusUI(provider)}</div>
        </div>
    );

    if (!isOpen) return null;

    const isCurrentProviderValidated = selectedProviderKey === AIProvider.GOOGLE_GEMINI || apiKeyValidation[selectedProviderKey] === 'valid';

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-content text-main rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-ui"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-ui flex-shrink-0">
                    <h2 className="text-lg font-bold text-primary-accent">Settings</h2>
                    <button 
                        onClick={onClose} 
                        className="p-1 rounded-full text-light hover:bg-border hover:text-main transition-colors"
                        aria-label="Close settings"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </header>
                
                <main className="p-6 overflow-y-auto space-y-8">
                    <section>
                        <h2 className="text-xl font-semibold text-primary-accent mb-4 border-b border-ui/50 pb-2">Language Model Provider & API Keys</h2>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="provider-select-modal" className="block text-sm font-medium text-main mb-1">Language Model Provider</label>
                                <select
                                    id="provider-select-modal"
                                    value={selectedProviderKey}
                                    onChange={handleProviderChange}
                                    className="w-full p-2 bg-main border border-ui rounded-md shadow-sm"
                                >
                                    {uniqueProviders.map(p => <option key={p} value={p}>{(p as string).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                                </select>
                            </div>
                            
                            {selectedProviderKey === AIProvider.OPENAI && renderApiKeyInput(AIProvider.OPENAI, "OpenAI API Key", "Enter your OpenAI API Key")}
                            {selectedProviderKey === AIProvider.MISTRAL && renderApiKeyInput(AIProvider.MISTRAL, "Mistral API Key", "Enter your Mistral API Key")}
                            {selectedProviderKey === AIProvider.OPENROUTER && renderApiKeyInput(AIProvider.OPENROUTER, "OpenRouter API Key", "Enter your OpenRouter API Key")}
                            
                            {selectedProviderKey !== AIProvider.GOOGLE_GEMINI && (
                                <div className="pt-2">
                                    <label htmlFor="gemini-preproc" className="flex items-center space-x-2 cursor-pointer">
                                        <input type="checkbox" id="gemini-preproc" checked={enableGeminiPreprocessing} onChange={(e) => setEnableGeminiPreprocessing(e.target.checked)} className="h-4 w-4 rounded border-gray-500 text-primary focus:ring-primary accent-primary" />
                                        <span className="text-sm font-medium text-main">Enable Gemini Preprocessing</span>
                                    </label>
                                    <p className="text-xs text-light mt-1">Use Gemini for web search grounding with non-Google models. The API key is managed automatically.</p>
                                </div>
                            )}
                        </div>
                    </section>
                    
                    <section>
                         <h2 className="text-xl font-semibold text-primary-accent mb-4 border-b border-ui/50 pb-2">Model Configuration</h2>
                         <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label htmlFor="model-select-modal" className="block text-sm font-medium text-main">Model</label>
                                    <button 
                                        onClick={handleRefreshModels}
                                        disabled={isRefreshLoading || !isCurrentProviderValidated}
                                        className="text-xs text-primary-accent hover:underline flex items-center disabled:opacity-50 disabled:no-underline"
                                    >
                                        <span className={`material-symbols-outlined text-sm mr-1 ${isRefreshLoading ? 'animate-spin' : ''}`}>refresh</span>
                                        {isRefreshLoading ? 'Refreshing...' : 'Refresh Models'}
                                    </button>
                                </div>
                                <select id="model-select-modal" value={selectedModelId} onChange={(e) => onSelectModelId(e.target.value)} className="w-full p-2 bg-main border border-ui rounded-md shadow-sm">
                                    {modelsForSelectedProvider.length > 0 ? (
                                        modelsForSelectedProvider.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                                    ) : (
                                        <option disabled>No models loaded. Please validate API key.</option>
                                    )}
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
                    
                    <section>
                        <h2 className="text-xl font-semibold text-primary-accent mb-4 border-b border-ui/50 pb-2">Prompt & Analysis Configuration</h2>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="prompt-preset-select" className="block text-sm font-medium text-main mb-1">Load Preset Prompt</label>
                                <select
                                    id="prompt-preset-select"
                                    onChange={handlePresetChange}
                                    value={selectedPreset}
                                    className="w-full p-2 bg-main border border-ui rounded-md shadow-sm"
                                >
                                    <option value="custom">Custom</option>
                                    {promptPresets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                                </select>
                                <p className="text-xs text-light mt-1">Select a preset to guide the AI's analysis style. This will replace the content of the text area below.</p>
                            </div>
                            <div>
                                <label htmlFor="custom-system-prompt" className="block text-sm font-medium text-main mb-1">System Prompt</label>
                                <textarea
                                    id="custom-system-prompt"
                                    rows={8}
                                    value={customSystemPrompt}
                                    onChange={(e) => setCustomSystemPrompt(e.target.value)}
                                    placeholder={SIFT_CHAT_SYSTEM_PROMPT}
                                    className="w-full p-2 bg-main border border-ui rounded-md shadow-sm text-sm"
                                />
                                <p className="text-xs text-light mt-1">Leave this empty to use the default SIFT prompt. This provides high-level instructions to the model for the entire session.</p>
                            </div>
                        </div>
                    </section>
                </main>

                <footer className="p-4 border-t border-ui text-right flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-content focus:ring-primary transition-colors"
                    >
                        Done
                    </button>
                </footer>
            </div>
        </div>
    );
};
