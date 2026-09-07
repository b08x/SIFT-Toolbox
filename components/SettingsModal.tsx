import React, { useState, useEffect, useMemo } from 'react';
import { AgenticApiService } from '../services/agenticApiService.ts';
import { 
    AIProvider, 
    ApiKeyValidationStates, 
    AIModelConfig, 
    ConfigurableParams, 
    CustomCommand,
    McpSearchConfig,
    TaskModelAssignments,
    LLMTaskKey,
    TaskModelSetting,
    GroundedSearchResult
} from '../types.ts';
import { SliderInput } from './SliderInput.tsx'; 
import { v4 as uuidv4 } from 'uuid';
import { 
    SIFT_CHAT_SYSTEM_PROMPT, 
    SIFT_BIAS_FOCUS_PROMPT, 
    SIFT_MISINFORMATION_FOCUS_PROMPT, 
    SIFT_DEEP_BACKGROUND_PROMPT 
} from '../prompts.ts';
import { 
    DEFAULT_MCP_CONFIG, 
    detectEnvironmentSecrets, 
    McpSearchService 
} from '../services/mcpSearchService.ts';
import { DEFAULT_TASK_ASSIGNMENTS, isModelSIFTCompliant } from '../models.config.ts';
import { 
    Cpu, 
    Key, 
    SlidersHorizontal, 
    Terminal, 
    FileText, 
    CheckCircle2, 
    AlertCircle, 
    AlertTriangle, 
    RefreshCw, 
    Eye, 
    EyeOff, 
    ChevronDown, 
    ChevronRight, 
    X, 
    Sparkles, 
    Lock, 
    Globe, 
    ListFilter, 
    Plus, 
    Trash2, 
    Edit3, 
    Check, 
    RotateCcw,
    Search,
    ShieldCheck,
    HelpCircle,
    Maximize2,
    Minimize2
} from 'lucide-react';

export interface SettingsModalProps {
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
    onModelConfigParamChange: React.Dispatch<React.SetStateAction<ConfigurableParams>> | ((params: ConfigurableParams | ((prev: ConfigurableParams) => ConfigurableParams)) => void);
    customSystemPrompt: string;
    setCustomSystemPrompt: (prompt: string) => void;
    customCommands: CustomCommand[];
    addCustomCommand: (command: CustomCommand) => void;
    updateCustomCommand: (id: string, updates: Partial<CustomCommand>) => void;
    deleteCustomCommand: (id: string) => void;

    // MCP & Task routing props
    mcpSearchConfig?: McpSearchConfig;
    onMcpSearchConfigChange?: (config: McpSearchConfig | ((prev: McpSearchConfig) => McpSearchConfig)) => void;
    taskModelAssignments?: TaskModelAssignments;
    onTaskModelAssignmentsChange?: (assignments: TaskModelAssignments | ((prev: TaskModelAssignments) => TaskModelAssignments)) => void;
    onUpdateTaskAssignment?: (taskKey: LLMTaskKey, updates: Partial<TaskModelSetting>) => void;
    onUpdateTaskParameters?: (taskKey: LLMTaskKey, params: ConfigurableParams) => void;
    onApplyModelToAllTasks?: (provider: AIProvider, modelId: string) => void;
}

type TabType = 'tasks' | 'providers' | 'mcp' | 'prompts' | 'commands';

const promptPresets = [
    { name: 'Default SIFT', prompt: SIFT_CHAT_SYSTEM_PROMPT, desc: 'Balanced 4-pillar analysis focusing on lateral reading and contextual verification.' },
    { name: 'Bias Analysis Focus', prompt: SIFT_BIAS_FOCUS_PROMPT, desc: 'Prioritizes ideological leanings, partisan framing, and editorial stance evaluation.' },
    { name: 'Misinformation Focus', prompt: SIFT_MISINFORMATION_FOCUS_PROMPT, desc: 'Highlights known hoaxes, out-of-context images, doctored claims, and deceptive techniques.' },
    { name: 'Deep Background', prompt: SIFT_DEEP_BACKGROUND_PROMPT, desc: 'Traces claims to original academic papers, legal transcripts, or government gazettes.' },
];

const PROVIDER_METADATA: Record<AIProvider, { name: string; desc: string; keyName: string; defaultUrl?: string; isLocal?: boolean }> = {
    [AIProvider.GOOGLE_GEMINI]: { 
        name: 'Google Gemini', 
        desc: 'Native provider with native Google Search grounding, 1M-2M context, and Multimodal Live support.',
        keyName: 'GEMINI_API_KEY'
    },
    [AIProvider.OPENAI]: { 
        name: 'OpenAI', 
        desc: 'GPT-4o and o1 reasoning models for complex fact synthesis and logic audit.',
        keyName: 'OPENAI_API_KEY'
    },
    [AIProvider.MISTRAL]: { 
        name: 'Mistral AI', 
        desc: 'Mistral Large and specialized multilingual reasoning models.',
        keyName: 'MISTRAL_API_KEY'
    },
    [AIProvider.OPENROUTER]: { 
        name: 'OpenRouter', 
        desc: 'Unified gateway to Claude 3.5 Sonnet, Llama 3.3, DeepSeek R1, and 200+ models.',
        keyName: 'OPENROUTER_API_KEY'
    },
    [AIProvider.ANTHROPIC]: { 
        name: 'Anthropic Direct', 
        desc: 'Direct Anthropic API integration for Claude 3.5 Sonnet and Haiku.',
        keyName: 'ANTHROPIC_API_KEY'
    },
    [AIProvider.GROQ]: { 
        name: 'Groq Cloud', 
        desc: 'Ultra low-latency LPU inference for fast query expansion and fact extraction.',
        keyName: 'GROQ_API_KEY'
    },
    [AIProvider.OLLAMA]: { 
        name: 'Ollama (Local)', 
        desc: 'Self-hosted private LLM instance for fully air-gapped local verification.',
        keyName: 'Ollama Base URL',
        defaultUrl: 'http://localhost:11434',
        isLocal: true
    },
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen, onClose, userApiKeys, setUserApiKeys, apiKeyValidation, setApiKeyValidation,
    selectedProviderKey, setSelectedProviderKey, enableGeminiPreprocessing, setEnableGeminiPreprocessing,
    availableModels, onModelsUpdate, selectedModelId, onSelectModelId, modelConfigParams, onModelConfigParamChange,
    customSystemPrompt, setCustomSystemPrompt, customCommands, addCustomCommand, updateCustomCommand, deleteCustomCommand,
    mcpSearchConfig = DEFAULT_MCP_CONFIG, onMcpSearchConfigChange,
    taskModelAssignments = DEFAULT_TASK_ASSIGNMENTS, onTaskModelAssignmentsChange,
    onUpdateTaskAssignment, onUpdateTaskParameters, onApplyModelToAllTasks
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('tasks');
    const [taskCategoryFilter, setTaskCategoryFilter] = useState<'All' | 'Core Analysis' | 'Interactive' | 'Infrastructure'>('All');
    const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({
        fact_check: true,
        claim_verification: false,
        interactive_chat: false,
        preprocessing: false,
        live_voice: false,
        custom_command: false
    });
    const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({
        [AIProvider.GOOGLE_GEMINI]: true
    });
    const [expandedSections, setExpandedSections] = useState({
        reranking: true,
        testSearch: false
    });

    // Local Keys & Passwords
    const [localKeys, setLocalKeys] = useState<{ [key in AIProvider]?: string }>(userApiKeys);
    const [showKey, setShowKey] = useState<Record<string, boolean>>({});
    const [isValidationLoading, setIsValidationLoading] = useState<Partial<Record<AIProvider, boolean>>>({});
    const [isRefreshLoading, setIsRefreshLoading] = useState<Partial<Record<AIProvider, boolean>>>({});
    const [providerLastSynced, setProviderLastSynced] = useState<Record<string, string>>({});
    const [validationErrors, setValidationErrors] = useState<Partial<Record<AIProvider, string>>>({});

    // MCP Test Search state
    const [testQuery, setTestQuery] = useState('latest US AI regulatory executive order 2025');
    const [isTestingMcp, setIsTestingMcp] = useState(false);
    const [testMcpResults, setTestMcpResults] = useState<GroundedSearchResult[] | null>(null);
    const [testMcpError, setTestMcpError] = useState<string | null>(null);

    // Prompt presets
    const [selectedPreset, setSelectedPreset] = useState<string>('custom');

    // Custom Commands
    const [isAddingCommand, setIsAddingCommand] = useState(false);
    const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
    const [commandName, setCommandName] = useState('');
    const [commandPrompt, setCommandPrompt] = useState('');
    const [commandDescription, setCommandDescription] = useState('');
    const [commandParams, setCommandParams] = useState<ConfigurableParams>({
        temperature: 0.7,
        topP: 0.95,
    });

    // Environment Secrets Status
    const secretsStatus = useMemo(() => detectEnvironmentSecrets(), []);

    // Auto-enable Exa MCP if secrets are detected
    useEffect(() => {
        if (secretsStatus.hasExaSecret && (!mcpSearchConfig.enabled || !mcpSearchConfig.apiKey)) {
            if (onMcpSearchConfigChange) {
                onMcpSearchConfigChange(prev => ({
                    ...prev,
                    enabled: true,
                    apiKey: prev.apiKey || secretsStatus.exaApiKey || ''
                }));
            }
        }
    }, [secretsStatus, mcpSearchConfig.enabled, mcpSearchConfig.apiKey, onMcpSearchConfigChange]);

    useEffect(() => {
        setLocalKeys(userApiKeys);
    }, [userApiKeys]);

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

    if (!isOpen) return null;

    // Toggle Task Accordion
    const toggleTask = (taskKey: string) => {
        setExpandedTasks(prev => ({ ...prev, [taskKey]: !prev[taskKey] }));
    };

    const toggleAllTasks = (expand: boolean) => {
        const updated: Record<string, boolean> = {};
        Object.keys(taskModelAssignments).forEach(k => {
            updated[k] = expand;
        });
        setExpandedTasks(updated);
    };

    // Toggle Provider Accordion
    const toggleProvider = (providerKey: string) => {
        setExpandedProviders(prev => ({ ...prev, [providerKey]: !prev[providerKey] }));
    };

    // Handle Local Key Change
    const handleKeyChange = (provider: AIProvider, value: string) => {
        setLocalKeys(prev => ({ ...prev, [provider]: value }));
        setUserApiKeys({ ...userApiKeys, [provider]: value });
    };

    // Validate Key
    const handleValidateKey = async (provider: AIProvider) => {
        const key = localKeys[provider];
        if (!key && provider !== AIProvider.OLLAMA) {
            setApiKeyValidation(prev => ({ ...prev, [provider]: 'invalid' }));
            setValidationErrors(prev => ({ ...prev, [provider]: 'API Key cannot be empty.' }));
            return;
        }

        setIsValidationLoading(prev => ({ ...prev, [provider]: true }));
        setValidationErrors(prev => ({ ...prev, [provider]: undefined }));
        try {
            const res = await AgenticApiService.validateApiKey(provider, key || '');
            setApiKeyValidation(prev => ({ ...prev, [provider]: res.isValid ? 'valid' : 'invalid' }));
            if (!res.isValid && res.error) {
                setValidationErrors(prev => ({ ...prev, [provider]: res.error }));
            }
            if (res.isValid) {
                handleRefreshModels(provider);
            }
        } catch (e: any) {
            setApiKeyValidation(prev => ({ ...prev, [provider]: 'invalid' }));
            setValidationErrors(prev => ({ ...prev, [provider]: e?.message || 'Validation failed.' }));
        } finally {
            setIsValidationLoading(prev => ({ ...prev, [provider]: false }));
        }
    };

    // Refresh Models
    const handleRefreshModels = async (provider: AIProvider) => {
        const key = localKeys[provider];
        setIsRefreshLoading(prev => ({ ...prev, [provider]: true }));
        try {
            const models = await AgenticApiService.fetchAvailableModels(provider, key || '');
            const compliantModels = models || [];
            if (compliantModels && compliantModels.length > 0) {
                onModelsUpdate(provider, compliantModels);
                setProviderLastSynced(prev => ({ ...prev, [provider]: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }));
            }
        } catch (e) {
            console.error(`Failed to refresh models for ${provider}:`, e);
        } finally {
            setIsRefreshLoading(prev => ({ ...prev, [provider]: false }));
        }
    };

    // Run Test MCP Search
    const handleRunTestMcp = async () => {
        if (!testQuery.trim()) return;
        setIsTestingMcp(true);
        setTestMcpError(null);
        setTestMcpResults(null);
        try {
            const res = await McpSearchService.executeSearch(testQuery, mcpSearchConfig);
            setTestMcpResults(res.results);
        } catch (err: any) {
            setTestMcpError(err?.message || 'Search execution failed');
        } finally {
            setIsTestingMcp(false);
        }
    };

    // Filtered Tasks list
    const filteredTasks = Object.values(taskModelAssignments).filter(task => {
        if (taskCategoryFilter === 'All') return true;
        return task.category === taskCategoryFilter;
    });

    // Preset selection change
    const handlePresetChange = (presetName: string) => {
        setSelectedPreset(presetName);
        const preset = promptPresets.find(p => p.name === presetName);
        if (preset) {
            setCustomSystemPrompt(preset.prompt);
        }
    };

    // Save or update custom command
    const handleSaveCustomCommand = () => {
        if (!commandName.trim() || !commandPrompt.trim()) return;
        if (editingCommandId) {
            updateCustomCommand(editingCommandId, {
                name: commandName.trim(),
                prompt: commandPrompt.trim(),
                description: commandDescription.trim(),
                parameters: commandParams,
            });
            setEditingCommandId(null);
        } else {
            addCustomCommand({
                id: uuidv4(),
                name: commandName.trim(),
                prompt: commandPrompt.trim(),
                description: commandDescription.trim(),
                parameters: commandParams,
            });
            setIsAddingCommand(false);
        }
        setCommandName('');
        setCommandPrompt('');
        setCommandDescription('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-main text-main border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
                
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-content shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                            <SlidersHorizontal size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-main tracking-tight flex items-center space-x-2">
                                <span>Settings & AI Engine</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium border border-primary/20">Multi-Provider</span>
                            </h2>
                            <p className="text-xs text-light">
                                Multi-provider routing, task-specific LLM parameters, Exa MCP live search, and custom commands.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-light hover:text-main hover:bg-main border border-transparent hover:border-border transition-colors"
                        aria-label="Close Settings"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-border bg-content px-6 overflow-x-auto scrollbar-none shrink-0">
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={`flex items-center space-x-2 py-3 px-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'tasks'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-light hover:text-main'
                        }`}
                    >
                        <Cpu size={16} />
                        <span>Task Routing</span>
                        <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-main border border-border text-light font-medium">
                            {Object.keys(taskModelAssignments).length}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('providers')}
                        className={`flex items-center space-x-2 py-3 px-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'providers'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-light hover:text-main'
                        }`}
                    >
                        <Key size={16} />
                        <span>Providers & Keys</span>
                        {Object.values(apiKeyValidation).filter(v => v === 'valid').length > 0 && (
                            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-main border border-border text-status-success font-medium">
                                {Object.values(apiKeyValidation).filter(v => v === 'valid').length} Active
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('mcp')}
                        className={`flex items-center space-x-2 py-3 px-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'mcp'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-light hover:text-main'
                        }`}
                    >
                        <Globe size={16} />
                        <span>Exa MCP Search</span>
                        {mcpSearchConfig.enabled ? (
                            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-main border border-border text-status-success font-medium">
                                ON
                            </span>
                        ) : (
                            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-main border border-border text-light">
                                OFF
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('prompts')}
                        className={`flex items-center space-x-2 py-3 px-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'prompts'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-light hover:text-main'
                        }`}
                    >
                        <FileText size={16} />
                        <span>Prompts & Presets</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('commands')}
                        className={`flex items-center space-x-2 py-3 px-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'commands'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-light hover:text-main'
                        }`}
                    >
                        <Terminal size={16} />
                        <span>Custom Commands</span>
                        <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-main border border-border text-light">
                            {customCommands.length}
                        </span>
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-main text-main">

                    {/* ========================================================================= */}
                    {/* TAB 1: TASK ROUTING & MODEL SELECTION */}
                    {/* ========================================================================= */}
                    {activeTab === 'tasks' && (
                        <div className="space-y-5 animate-fade-in">
                            {/* Header Toolbar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-content border border-border">
                                <div>
                                    <h3 className="text-sm font-semibold text-main">Task-Specific Model Routing</h3>
                                    <p className="text-xs text-light mt-0.5">
                                        Assign different LLM models and adjust temperature, top-P, and thinking budget for each specific SIFT analytical step.
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => toggleAllTasks(true)}
                                        className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-main hover:bg-content text-light hover:text-main transition-colors"
                                    >
                                        Expand All
                                    </button>
                                    <button
                                        onClick={() => toggleAllTasks(false)}
                                        className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-main hover:bg-content text-light hover:text-main transition-colors"
                                    >
                                        Collapse All
                                    </button>
                                    {onApplyModelToAllTasks && (
                                        <button
                                            onClick={() => onApplyModelToAllTasks(selectedProviderKey, selectedModelId)}
                                            className="text-xs px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 font-medium transition-colors"
                                            title="Set all tasks to the active model"
                                        >
                                            Sync All to Active
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Category Filter Chips */}
                            <div className="flex items-center space-x-2 text-xs">
                                <span className="text-light flex items-center space-x-1">
                                    <ListFilter size={14} />
                                    <span>Category:</span>
                                </span>
                                {(['All', 'Core Analysis', 'Interactive', 'Infrastructure'] as const).map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setTaskCategoryFilter(cat)}
                                        className={`px-3 py-1 rounded-full text-xs transition-colors ${
                                            taskCategoryFilter === cat
                                                ? 'bg-primary text-on-primary font-medium shadow-xs'
                                                : 'bg-content border border-border text-light hover:text-main'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {/* Task Cards List */}
                            <div className="space-y-3">
                                {filteredTasks.map(task => {
                                    const isExpanded = !!expandedTasks[task.taskKey];
                                    const providerModels = availableModels.filter(m => m.provider === task.provider);
                                    const activeModelConfig = availableModels.find(m => m.id === task.modelId) || providerModels[0];

                                    return (
                                        <div
                                            key={task.taskKey}
                                            className="border border-border rounded-xl overflow-hidden bg-content transition-all shadow-xs"
                                        >
                                            {/* Task Header / Summary Bar */}
                                            <div
                                                onClick={() => toggleTask(task.taskKey)}
                                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-main/50 transition-colors select-none"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className="p-2 rounded-lg bg-main text-primary border border-border">
                                                        <Sparkles size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center space-x-2">
                                                            <h4 className="text-sm font-semibold text-main">{task.label}</h4>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-main text-light font-medium border border-border">
                                                                {task.category}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-light mt-0.5 line-clamp-1">{task.description}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center space-x-3">
                                                    <div className="hidden sm:flex items-center space-x-1.5 text-xs text-light bg-main px-2.5 py-1 rounded-lg border border-border">
                                                        <span className="font-medium text-main">{PROVIDER_METADATA[task.provider]?.name || task.provider}</span>
                                                        <span>•</span>
                                                        <span className="text-primary font-mono font-medium">{task.modelId}</span>
                                                        {task.parameters.temperature !== undefined && (
                                                            <>
                                                                <span>•</span>
                                                                <span>T: {task.parameters.temperature}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="text-light">
                                                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Collapsible Content */}
                                            {isExpanded && (
                                                <div className="p-4 pt-3 border-t border-border bg-main space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* Provider Select */}
                                                        <div>
                                                            <label className="block text-xs font-semibold text-light mb-1.5">
                                                                AI Provider
                                                            </label>
                                                            <select
                                                                value={task.provider}
                                                                onChange={(e) => {
                                                                    const newProv = e.target.value as AIProvider;
                                                                    const firstModel = availableModels.find(m => m.provider === newProv)?.id || '';
                                                                    if (onUpdateTaskAssignment) {
                                                                        onUpdateTaskAssignment(task.taskKey, {
                                                                            provider: newProv,
                                                                            modelId: firstModel
                                                                        });
                                                                    }
                                                                }}
                                                                className="w-full text-xs rounded-lg border border-border bg-content px-3 py-2 text-main focus:outline-hidden focus:border-primary"
                                                            >
                                                                {Object.values(AIProvider).map(p => (
                                                                    <option key={p} value={p}>
                                                                        {PROVIDER_METADATA[p]?.name || p}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {/* Model Select */}
                                                        <div>
                                                            <label className="block text-xs font-semibold text-light mb-1.5">
                                                                Assigned Model
                                                            </label>
                                                            <select
                                                                value={task.modelId}
                                                                onChange={(e) => {
                                                                    if (onUpdateTaskAssignment) {
                                                                        onUpdateTaskAssignment(task.taskKey, { modelId: e.target.value });
                                                                    }
                                                                }}
                                                                className="w-full text-xs rounded-lg border border-border bg-content px-3 py-2 text-main focus:outline-hidden focus:border-primary"
                                                            >
                                                                {providerModels.map(m => (
                                                                    <option key={m.id} value={m.id}>
                                                                        {m.name} {m.contextWindow ? `(${m.contextWindow})` : ''}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* Capabilities badges */}
                                                    {activeModelConfig?.capabilities && (
                                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                                            {activeModelConfig.capabilities.webSearch && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-status-success/15 text-status-success border border-status-success/30">
                                                                    🌐 Search Grounding
                                                                </span>
                                                            )}
                                                            {activeModelConfig.capabilities.thinking && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30">
                                                                    🧠 CoT Reasoning
                                                                </span>
                                                            )}
                                                            {activeModelConfig.capabilities.vision && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                                                    👁️ Multimodal Vision
                                                                </span>
                                                            )}
                                                            {activeModelConfig.capabilities.structuredOutputs && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-content text-light border border-border">
                                                                    📝 Structured JSON
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Parameter Sliders */}
                                                    <div className="pt-2 border-t border-border space-y-3">
                                                        <h5 className="text-xs font-semibold text-light tracking-wide uppercase">
                                                            Task Parameters
                                                        </h5>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            {/* Temperature */}
                                                            <div>
                                                                <SliderInput
                                                                    label="Temperature"
                                                                    id={`temp-${task.taskKey}`}
                                                                    value={Number(task.parameters.temperature ?? 0.2)}
                                                                    min={0}
                                                                    max={2}
                                                                    step={0.05}
                                                                    onChange={(val) => {
                                                                        if (onUpdateTaskParameters) {
                                                                            onUpdateTaskParameters(task.taskKey, { temperature: val });
                                                                        }
                                                                    }}
                                                                    description="Lower values are more analytical and deterministic; higher values are creative."
                                                                />
                                                            </div>

                                                             {/* Top-P */}
                                                            <div>
                                                                <SliderInput
                                                                    label="Top-P (Nucleus Sampling)"
                                                                    id={`topp-${task.taskKey}`}
                                                                    value={Number(task.parameters.topP ?? 0.95)}
                                                                    min={0}
                                                                    max={1}
                                                                    step={0.05}
                                                                    onChange={(val) => {
                                                                        if (onUpdateTaskParameters) {
                                                                            onUpdateTaskParameters(task.taskKey, { topP: val });
                                                                        }
                                                                    }}
                                                                    description="Controls diversity of token pool considered during generation."
                                                                />
                                                            </div>

                                                             {/* Top-K */}
                                                            <div>
                                                                <SliderInput
                                                                    label="Top-K"
                                                                    id={`topk-${task.taskKey}`}
                                                                    value={Number(task.parameters.topK ?? 40)}
                                                                    min={1}
                                                                    max={100}
                                                                    step={1}
                                                                    onChange={(val) => {
                                                                        if (onUpdateTaskParameters) {
                                                                            onUpdateTaskParameters(task.taskKey, { topK: val });
                                                                        }
                                                                    }}
                                                                    description="Limits the token selection pool to the K highest probability tokens."
                                                                />
                                                            </div>

                                                            {/* Thinking Budget (if model supports thinking) */}
                                                            {activeModelConfig?.supportsThinking && (
                                                                <div>
                                                                    <SliderInput
                                                                        label="Thinking Budget (Tokens)"
                                                                        id={`thinking-${task.taskKey}`}
                                                                        value={Number(task.parameters.thinkingBudget ?? 4096)}
                                                                        min={1024}
                                                                        max={24576}
                                                                        step={1024}
                                                                        onChange={(val) => {
                                                                            if (onUpdateTaskParameters) {
                                                                                onUpdateTaskParameters(task.taskKey, { thinkingBudget: val });
                                                                            }
                                                                        }}
                                                                        description="Budget for internal reasoning tokens before output synthesis."
                                                                    />
                                                                </div>
                                                            )}

                                                            {/* Max Output Tokens */}
                                                            <div>
                                                                <SliderInput
                                                                    label="Max Output Tokens"
                                                                    id={`max-tokens-${task.taskKey}`}
                                                                    value={Number(task.parameters.maxOutputTokens ?? 8192)}
                                                                    min={1024}
                                                                    max={32768}
                                                                    step={1024}
                                                                    onChange={(val) => {
                                                                        if (onUpdateTaskParameters) {
                                                                            onUpdateTaskParameters(task.taskKey, { maxOutputTokens: val });
                                                                        }
                                                                    }}
                                                                    description="Maximum length of response generated for this task."
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex justify-end pt-1">
                                                            <button
                                                                onClick={() => {
                                                                    const def = DEFAULT_TASK_ASSIGNMENTS[task.taskKey];
                                                                    if (def && onUpdateTaskAssignment) {
                                                                        onUpdateTaskAssignment(task.taskKey, def);
                                                                    }
                                                                }}
                                                                className="flex items-center space-x-1.5 text-xs text-text-muted hover:text-text-light transition-colors"
                                                            >
                                                                <RotateCcw size={12} />
                                                                <span>Reset to Default</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* TAB 2: PROVIDERS & KEYS */}
                    {/* ========================================================================= */}
                    {activeTab === 'providers' && (
                        <div className="space-y-5 animate-fade-in">
                            <div className="p-4 rounded-xl bg-content border border-border flex items-start space-x-3">
                                <Key className="text-primary mt-0.5 shrink-0" size={18} />
                                <div className="text-xs space-y-1">
                                    <h4 className="font-semibold text-main">Multi-Provider Configuration</h4>
                                    <p className="text-light">
                                        Configure credentials for cloud LLM providers. Keys are stored locally in your browser session and never transmitted to third parties.
                                    </p>
                                </div>
                            </div>

                            {/* Providers Accordion Cards */}
                            <div className="space-y-3">
                                {Object.values(AIProvider).map(provider => {
                                    const meta = PROVIDER_METADATA[provider];
                                    const isExpanded = !!expandedProviders[provider];
                                    const validation = apiKeyValidation[provider];
                                    const isValidating = !!isValidationLoading[provider];
                                    const isRefreshing = !!isRefreshLoading[provider];
                                    const hasSecretInEnv = !!secretsStatus.providerSecrets[provider];
                                    const providerModels = availableModels.filter(m => m.provider === provider);

                                    return (
                                        <div
                                            key={provider}
                                            className="border border-border rounded-xl overflow-hidden bg-content shadow-xs"
                                        >
                                            {/* Provider Header */}
                                            <div
                                                onClick={() => toggleProvider(provider)}
                                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-main/50 transition-colors select-none"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className="p-2 rounded-lg bg-main text-primary border border-border">
                                                        <Cpu size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center space-x-2">
                                                            <h4 className="text-sm font-semibold text-main">{meta.name}</h4>
                                                            {hasSecretInEnv && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium flex items-center space-x-1 border border-primary/20">
                                                                    <Lock size={10} />
                                                                    <span>Env Secret</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-light mt-0.5">{meta.desc}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center space-x-3">
                                                    {/* Status Badge */}
                                                    {validation === 'valid' ? (
                                                        <span className="flex items-center space-x-1 text-xs text-status-success bg-main px-2.5 py-1 rounded-full border border-border font-medium">
                                                            <CheckCircle2 size={12} />
                                                            <span>Connected</span>
                                                        </span>
                                                    ) : validation === 'invalid' ? (
                                                        <span className="flex items-center space-x-1 text-xs text-status-error bg-main px-2.5 py-1 rounded-full border border-border font-medium">
                                                            <AlertCircle size={12} />
                                                            <span>Invalid Key</span>
                                                        </span>
                                                    ) : hasSecretInEnv ? (
                                                        <span className="flex items-center space-x-1 text-xs text-primary bg-main px-2.5 py-1 rounded-full border border-border font-medium">
                                                            <Check size={12} />
                                                            <span>Auto Ready</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-light bg-main px-2.5 py-1 rounded-full border border-border font-medium">
                                                            Not Configured
                                                        </span>
                                                    )}

                                                    <div className="text-light">
                                                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expanded Provider Settings */}
                                            {isExpanded && (
                                                <div className="p-4 pt-3 border-t border-border bg-main space-y-4">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-text-muted mb-1">
                                                            {meta.isLocal ? 'Ollama API URL' : `${meta.name} API Key`}
                                                        </label>
                                                        <div className="flex items-center space-x-2">
                                                            <div className="relative flex-1">
                                                                <input
                                                                    type={showKey[provider] || meta.isLocal ? 'text' : 'password'}
                                                                    value={localKeys[provider] || ''}
                                                                    placeholder={meta.defaultUrl || `Enter ${meta.keyName}`}
                                                                    onChange={(e) => handleKeyChange(provider, e.target.value)}
                                                                    className="w-full text-xs rounded-lg border border-border-color bg-card px-3 py-2 pr-9 text-text-light placeholder-text-muted focus:outline-hidden focus:border-accent-blue font-mono"
                                                                />
                                                                {!meta.isLocal && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setShowKey(prev => ({ ...prev, [provider]: !prev[provider] }))}
                                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-light"
                                                                    >
                                                                        {showKey[provider] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                disabled={isValidating}
                                                                onClick={() => handleValidateKey(provider)}
                                                                className="px-3 py-2 rounded-lg text-xs font-medium bg-card-secondary hover:bg-card border border-border-color text-text-light transition-colors flex items-center space-x-1.5 shrink-0"
                                                            >
                                                                {isValidating ? (
                                                                    <RefreshCw size={13} className="animate-spin text-accent-blue" />
                                                                ) : (
                                                                    <CheckCircle2 size={13} />
                                                                )}
                                                                <span>Verify</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={isRefreshing}
                                                                onClick={() => handleRefreshModels(provider)}
                                                                className="px-3 py-2 rounded-lg text-xs font-medium bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 border border-accent-blue/30 transition-colors flex items-center space-x-1.5 shrink-0"
                                                            >
                                                                <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                                                                <span>Sync Models</span>
                                                            </button>
                                                        </div>
                                                        {validationErrors[provider] && (
                                                            <div className="mt-2 flex items-start space-x-1.5 text-xs text-status-error bg-status-error/10 border border-status-error/20 px-2.5 py-1.5 rounded-lg">
                                                                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                                                                <span>{validationErrors[provider]}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Synced Models List */}
                                                    <div className="pt-2 border-t border-border-color/60">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-xs font-medium text-text-muted">
                                                                Available Models ({providerModels.length})
                                                            </span>
                                                            {providerLastSynced[provider] && (
                                                                <span className="text-[10px] text-text-muted">
                                                                    Synced at {providerLastSynced[provider]}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                                                            {providerModels.map(m => (
                                                                <span
                                                                    key={m.id}
                                                                    className="text-[11px] px-2.5 py-1 rounded-md bg-card border border-border-color text-text-light flex items-center space-x-1"
                                                                >
                                                                    <span>{m.name}</span>
                                                                    {m.contextWindow && (
                                                                        <span className="text-[9px] text-accent-blue font-mono font-normal">
                                                                            [{m.contextWindow}]
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* TAB 3: EXA MCP LIVE SEARCH & GROUNDING */}
                    {/* ========================================================================= */}
                    {activeTab === 'mcp' && (
                        <div className="space-y-5 animate-fade-in">
                            {/* Master Toggle & Secret Detection Alert */}
                            <div className="p-4 rounded-xl border border-border-color bg-card-secondary/40 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-2 rounded-lg bg-accent-blue/15 text-accent-blue">
                                            <Globe size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-text-light">
                                                Exa MCP Real-Time Search & Reranking
                                            </h3>
                                            <p className="text-xs text-text-muted">
                                                Enables live web retrieval through Model Context Protocol (MCP) to overcome model training cutoffs.
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={mcpSearchConfig.enabled}
                                            onChange={(e) => {
                                                if (onMcpSearchConfigChange) {
                                                    onMcpSearchConfigChange(prev => ({ ...prev, enabled: e.target.checked }));
                                                }
                                            }}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-card-secondary peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-blue"></div>
                                    </label>
                                </div>

                                {secretsStatus.hasExaSecret && (
                                    <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-accent-green/10 border border-accent-green/25 text-accent-green text-xs font-medium">
                                        <Lock size={14} className="shrink-0" />
                                        <span>Environment Secret Detected: Exa MCP search was automatically enabled.</span>
                                    </div>
                                )}
                            </div>

                            {/* MCP Engine Configuration */}
                            <div className="p-4 rounded-xl border border-border-color bg-card space-y-4">
                                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                                    Search Engine Connection
                                </h4>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* MCP Provider Type */}
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1.5">
                                            MCP Search Provider
                                        </label>
                                        <select
                                            value={mcpSearchConfig.provider}
                                            onChange={(e) => {
                                                if (onMcpSearchConfigChange) {
                                                    onMcpSearchConfigChange(prev => ({ ...prev, provider: e.target.value as 'exa' | 'generic_mcp' }));
                                                }
                                            }}
                                            className="w-full text-xs rounded-lg border border-border-color bg-card px-3 py-2 text-text-light focus:outline-hidden focus:border-accent-blue"
                                        >
                                            <option value="exa">Exa AI Neural Search (Recommended)</option>
                                            <option value="generic_mcp">Generic MCP JSON-RPC Server</option>
                                        </select>
                                    </div>

                                    {/* Search Mode */}
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1.5">
                                            Search Mode
                                        </label>
                                        <select
                                            value={mcpSearchConfig.searchType || 'auto'}
                                            onChange={(e) => {
                                                if (onMcpSearchConfigChange) {
                                                    onMcpSearchConfigChange(prev => ({ ...prev, searchType: e.target.value as any }));
                                                }
                                            }}
                                            className="w-full text-xs rounded-lg border border-border-color bg-card px-3 py-2 text-text-light focus:outline-hidden focus:border-accent-blue"
                                        >
                                            <option value="auto">Auto (Hybrid Semantic + Keyword)</option>
                                            <option value="neural">Neural (Deep Semantic Meaning)</option>
                                            <option value="keyword">Keyword (Exact Literal Match)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* API Key / Endpoint */}
                                {mcpSearchConfig.provider === 'exa' ? (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1">
                                            Exa API Key
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKey['exa'] ? 'text' : 'password'}
                                                value={mcpSearchConfig.apiKey || ''}
                                                placeholder="Enter Exa API Key (or set EXA_API_KEY)"
                                                onChange={(e) => {
                                                    if (onMcpSearchConfigChange) {
                                                        onMcpSearchConfigChange(prev => ({ ...prev, apiKey: e.target.value }));
                                                    }
                                                }}
                                                className="w-full text-xs rounded-lg border border-border-color bg-card px-3 py-2 pr-9 text-text-light placeholder-text-muted focus:outline-hidden focus:border-accent-blue font-mono"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowKey(prev => ({ ...prev, exa: !prev.exa }))}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-light"
                                            >
                                                {showKey['exa'] ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1">
                                            Generic MCP Server URL
                                        </label>
                                        <input
                                            type="text"
                                            value={mcpSearchConfig.serverUrl || ''}
                                            placeholder="http://localhost:8000/mcp or stdio:..."
                                            onChange={(e) => {
                                                if (onMcpSearchConfigChange) {
                                                    onMcpSearchConfigChange(prev => ({ ...prev, serverUrl: e.target.value }));
                                                }
                                            }}
                                            className="w-full text-xs rounded-lg border border-border-color bg-card px-3 py-2 text-text-light placeholder-text-muted focus:outline-hidden focus:border-accent-blue font-mono"
                                        />
                                    </div>
                                )}

                                {/* Date Filter & Result Count */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                    <div className="flex items-center space-x-3 p-3 rounded-lg bg-card-secondary/30 border border-border-color">
                                        <input
                                            type="checkbox"
                                            id="useDateFilter"
                                            checked={mcpSearchConfig.useDateFilter ?? true}
                                            onChange={(e) => {
                                                if (onMcpSearchConfigChange) {
                                                    onMcpSearchConfigChange(prev => ({ ...prev, useDateFilter: e.target.checked }));
                                                }
                                            }}
                                            className="h-4 w-4 rounded-sm border-border-color text-accent-blue focus:ring-0"
                                        />
                                        <label htmlFor="useDateFilter" className="text-xs text-text-light cursor-pointer select-none">
                                            <span className="font-semibold block">Recency Filter (Last 18 Months)</span>
                                            <span className="text-[11px] text-text-muted">Filters results to ensure up-to-date fact-checking.</span>
                                        </label>
                                    </div>

                                    <div>
                                        <SliderInput
                                            label="Raw Results Fetched"
                                            id="mcp-num-results"
                                            value={mcpSearchConfig.numResults || 6}
                                            min={3}
                                            max={15}
                                            step={1}
                                            onChange={(val) => {
                                                if (onMcpSearchConfigChange) {
                                                    onMcpSearchConfigChange(prev => ({ ...prev, numResults: val }));
                                                }
                                            }}
                                            description="Number of candidate web pages retrieved prior to reranking."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Collapsible Reranking & Contextual Relevance Engine */}
                            <div className="border border-border-color rounded-xl overflow-hidden bg-card">
                                <div
                                    onClick={() => setExpandedSections(prev => ({ ...prev, reranking: !prev.reranking }))}
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-card-secondary/30 transition-colors select-none"
                                >
                                    <div className="flex items-center space-x-3">
                                        <ShieldCheck className="text-accent-blue" size={18} />
                                        <div>
                                            <h4 className="text-sm font-semibold text-text-light">
                                                Contextual Relevance & Scoring Engine
                                            </h4>
                                            <p className="text-xs text-text-muted">
                                                Weights for reranking candidate results: Recency, Semantic Overlap, and Domain Authority.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${mcpSearchConfig.reranking?.enabled ? 'bg-accent-green/20 text-accent-green' : 'bg-card-secondary text-text-muted'}`}>
                                            {mcpSearchConfig.reranking?.enabled ? 'Reranking ON' : 'Reranking OFF'}
                                        </span>
                                        {expandedSections.reranking ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </div>
                                </div>

                                {expandedSections.reranking && (
                                    <div className="p-4 pt-2 border-t border-border-color bg-card-secondary/20 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-text-muted">Enable Reranking Algorithm</span>
                                            <input
                                                type="checkbox"
                                                checked={mcpSearchConfig.reranking?.enabled ?? true}
                                                onChange={(e) => {
                                                    if (onMcpSearchConfigChange) {
                                                        onMcpSearchConfigChange(prev => ({
                                                            ...prev,
                                                            reranking: {
                                                                ...prev.reranking,
                                                                enabled: e.target.checked
                                                            }
                                                        }));
                                                    }
                                                }}
                                                className="h-4 w-4 rounded-sm text-accent-blue"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <SliderInput
                                                label="Semantic Overlap Weight"
                                                id="rerank-semantic-weight"
                                                value={mcpSearchConfig.reranking?.semanticWeight ?? 0.45}
                                                min={0.0}
                                                max={1.0}
                                                step={0.05}
                                                onChange={(val) => {
                                                    if (onMcpSearchConfigChange) {
                                                        onMcpSearchConfigChange(prev => ({
                                                            ...prev,
                                                            reranking: { ...prev.reranking, semanticWeight: val }
                                                        }));
                                                    }
                                                }}
                                                description="Weight given to claim keyword overlap."
                                            />
                                            <SliderInput
                                                label="Recency Weight"
                                                id="rerank-recency-weight"
                                                value={mcpSearchConfig.reranking?.recencyWeight ?? 0.35}
                                                min={0.0}
                                                max={1.0}
                                                step={0.05}
                                                onChange={(val) => {
                                                    if (onMcpSearchConfigChange) {
                                                        onMcpSearchConfigChange(prev => ({
                                                            ...prev,
                                                            reranking: { ...prev.reranking, recencyWeight: val }
                                                        }));
                                                    }
                                                }}
                                                description="Weight given to newer publication dates."
                                            />
                                            <SliderInput
                                                label="Domain Authority Weight"
                                                id="rerank-authority-weight"
                                                value={mcpSearchConfig.reranking?.authorityWeight ?? 0.20}
                                                min={0.0}
                                                max={1.0}
                                                step={0.05}
                                                onChange={(val) => {
                                                    if (onMcpSearchConfigChange) {
                                                        onMcpSearchConfigChange(prev => ({
                                                            ...prev,
                                                            reranking: { ...prev.reranking, authorityWeight: val }
                                                        }));
                                                    }
                                                }}
                                                description="Weight given to established fact-checking/news domains."
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                            <SliderInput
                                                label="Min Score Cutoff"
                                                id="rerank-min-score"
                                                value={mcpSearchConfig.reranking?.minRelevanceScore ?? 0.25}
                                                min={0.0}
                                                max={0.8}
                                                step={0.05}
                                                onChange={(val) => {
                                                    if (onMcpSearchConfigChange) {
                                                        onMcpSearchConfigChange(prev => ({
                                                            ...prev,
                                                            reranking: { ...prev.reranking, minRelevanceScore: val }
                                                        }));
                                                    }
                                                }}
                                                description="Drops search results scoring below this threshold."
                                            />
                                            <SliderInput
                                                label="Max Grounding Citations"
                                                id="rerank-max-results"
                                                value={mcpSearchConfig.reranking?.maxResults ?? 5}
                                                min={2}
                                                max={10}
                                                step={1}
                                                onChange={(val) => {
                                                    if (onMcpSearchConfigChange) {
                                                        onMcpSearchConfigChange(prev => ({
                                                            ...prev,
                                                            reranking: { ...prev.reranking, maxResults: val }
                                                        }));
                                                    }
                                                }}
                                                description="Maximum top-ranked sources attached to the prompt context."
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Collapsible Live Search Diagnostic Runner */}
                            <div className="border border-border rounded-xl overflow-hidden bg-content">
                                <div
                                    onClick={() => setExpandedSections(prev => ({ ...prev, testSearch: !prev.testSearch }))}
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-main/50 transition-colors select-none"
                                >
                                    <div className="flex items-center space-x-3">
                                        <Search className="text-primary" size={18} />
                                        <div>
                                            <h4 className="text-sm font-semibold text-main">
                                                Live MCP Search Diagnostic Tester
                                            </h4>
                                            <p className="text-xs text-light">
                                                Test your search configuration in real time and inspect reranking scores.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-light">
                                        {expandedSections.testSearch ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </div>
                                </div>

                                {expandedSections.testSearch && (
                                    <div className="p-4 pt-2 border-t border-border bg-content space-y-4">
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="text"
                                                value={testQuery}
                                                onChange={(e) => setTestQuery(e.target.value)}
                                                placeholder="Enter query to test live search..."
                                                className="flex-1 text-xs rounded-lg border border-border bg-content px-3 py-2 text-main placeholder-light/50 focus:outline-hidden focus:border-primary"
                                            />
                                            <button
                                                type="button"
                                                disabled={isTestingMcp}
                                                onClick={handleRunTestMcp}
                                                className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:brightness-110 transition-colors flex items-center space-x-1.5 shrink-0"
                                            >
                                                {isTestingMcp ? (
                                                    <RefreshCw size={13} className="animate-spin" />
                                                ) : (
                                                    <Search size={13} />
                                                )}
                                                <span>Search & Rerank</span>
                                            </button>
                                        </div>

                                        {testMcpError && (
                                            <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs">
                                                {testMcpError}
                                            </div>
                                        )}

                                        {testMcpResults && (
                                            <div className="space-y-2 pt-2">
                                                <div className="text-xs font-semibold text-light">
                                                    Results ({testMcpResults.length} sources returned):
                                                </div>
                                                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                    {testMcpResults.map((r, i) => (
                                                        <div key={i} className="p-2.5 rounded-lg bg-content border border-border text-xs space-y-1">
                                                            <div className="flex items-center justify-between">
                                                                <a
                                                                    href={r.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="font-semibold text-primary hover:underline line-clamp-1"
                                                                >
                                                                    {r.title}
                                                                </a>
                                                                <div className="flex items-center space-x-1 text-[10px] font-mono shrink-0 ml-2">
                                                                    <span className="px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary">
                                                                        Rel: {(r.relevanceScore * 100).toFixed(0)}%
                                                                    </span>
                                                                    <span className="px-1.5 py-0.5 rounded-sm bg-status-success/15 text-status-success">
                                                                        Rec: {(r.recencyScore * 100).toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <p className="text-[11px] text-light line-clamp-2">{r.snippet}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* TAB 4: PROMPTS & PRESETS */}
                    {/* ========================================================================= */}
                    {activeTab === 'prompts' && (
                        <div className="space-y-5 animate-fade-in">
                            <div>
                                <label className="block text-xs font-semibold text-light mb-1.5">
                                    System Prompt Preset
                                </label>
                                <select
                                    value={selectedPreset}
                                    onChange={(e) => handlePresetChange(e.target.value)}
                                    className="w-full text-xs rounded-lg border border-border bg-content px-3 py-2 text-main focus:outline-hidden focus:border-primary"
                                >
                                    {promptPresets.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                    <option value="custom">Custom System Prompt</option>
                                </select>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-semibold text-light">
                                        Active System Instructions
                                    </label>
                                    <span className="text-[10px] text-light">
                                        {customSystemPrompt.length} chars
                                    </span>
                                </div>
                                <textarea
                                    rows={10}
                                    value={customSystemPrompt}
                                    onChange={(e) => {
                                        setCustomSystemPrompt(e.target.value);
                                        setSelectedPreset('custom');
                                    }}
                                    className="w-full text-xs font-mono rounded-lg border border-border bg-content px-3 py-2 text-main placeholder-light/50 focus:outline-hidden focus:border-primary resize-y"
                                    placeholder="Enter system prompt instructions for the SIFT fact-checker..."
                                />
                            </div>

                            <div className="p-4 rounded-xl border border-border bg-content flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-semibold text-main block">
                                        Gemini Query Preprocessing
                                    </span>
                                    <span className="text-[11px] text-light">
                                        Automatically uses Gemini to expand queries and extract web search terms for non-Gemini models.
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={enableGeminiPreprocessing}
                                    onChange={(e) => setEnableGeminiPreprocessing(e.target.checked)}
                                    className="h-4 w-4 rounded-sm text-primary focus:ring-primary accent-primary"
                                />
                            </div>
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* TAB 5: CUSTOM COMMANDS */}
                    {/* ========================================================================= */}
                    {activeTab === 'commands' && (
                        <div className="space-y-5 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-semibold text-main">Custom SIFT Commands</h4>
                                    <p className="text-xs text-light">
                                        Create one-click custom prompts and actions available in the chat interface.
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setIsAddingCommand(true);
                                        setEditingCommandId(null);
                                        setCommandName('');
                                        setCommandPrompt('');
                                        setCommandDescription('');
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:brightness-110 flex items-center space-x-1.5 transition-colors"
                                >
                                    <Plus size={14} />
                                    <span>New Command</span>
                                </button>
                            </div>

                            {/* Add / Edit Form */}
                            {(isAddingCommand || editingCommandId) && (
                                <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                                    <h5 className="text-xs font-bold text-primary uppercase tracking-wider">
                                        {editingCommandId ? 'Edit Command' : 'Create New Command'}
                                    </h5>
                                    <div>
                                        <label className="block text-xs font-semibold text-light mb-1">Name</label>
                                        <input
                                            type="text"
                                            value={commandName}
                                            onChange={(e) => setCommandName(e.target.value)}
                                            placeholder="e.g. Audit Image Provenance"
                                            className="w-full text-xs rounded-lg border border-border bg-content px-3 py-2 text-main focus:outline-hidden focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-light mb-1">Prompt Template</label>
                                        <textarea
                                            rows={3}
                                            value={commandPrompt}
                                            onChange={(e) => setCommandPrompt(e.target.value)}
                                            placeholder="e.g. Verify the metadata, date of first publication, and reverse-image context of..."
                                            className="w-full text-xs rounded-lg border border-border bg-content px-3 py-2 text-main focus:outline-hidden focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-light mb-1">Description (Optional)</label>
                                        <input
                                            type="text"
                                            value={commandDescription}
                                            onChange={(e) => setCommandDescription(e.target.value)}
                                            placeholder="Short description shown on hover"
                                            className="w-full text-xs rounded-lg border border-border bg-content px-3 py-2 text-main focus:outline-hidden focus:border-primary"
                                        />
                                    </div>
                                    <div className="flex justify-end space-x-2 pt-2">
                                        <button
                                            onClick={() => {
                                                setIsAddingCommand(false);
                                                setEditingCommandId(null);
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-content hover:bg-main text-light"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveCustomCommand}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:brightness-110"
                                        >
                                            Save Command
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Commands List */}
                            <div className="space-y-2">
                                {customCommands.length === 0 ? (
                                    <div className="p-8 text-center text-xs text-light border border-dashed border-border rounded-xl">
                                        No custom commands created yet. Click "New Command" to add one.
                                    </div>
                                ) : (
                                    customCommands.map(cmd => (
                                        <div
                                            key={cmd.id}
                                            className="p-3 rounded-xl border border-border bg-content flex items-center justify-between"
                                        >
                                            <div className="space-y-0.5">
                                                <h5 className="text-xs font-bold text-main flex items-center space-x-2">
                                                    <span>{cmd.name}</span>
                                                </h5>
                                                <p className="text-[11px] text-light line-clamp-1">{cmd.prompt}</p>
                                            </div>
                                            <div className="flex items-center space-x-1.5">
                                                <button
                                                    onClick={() => {
                                                        setEditingCommandId(cmd.id);
                                                        setCommandName(cmd.name);
                                                        setCommandPrompt(cmd.prompt);
                                                        setCommandDescription(cmd.description || '');
                                                    }}
                                                    className="p-1.5 rounded-lg text-light hover:text-main hover:bg-main transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => deleteCustomCommand(cmd.id)}
                                                    className="p-1.5 rounded-lg text-status-error/80 hover:text-status-error hover:bg-status-error/10 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-content shrink-0">
                    <div className="text-xs text-light">
                        Settings are automatically saved to your session.
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:brightness-110 shadow-xs transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
