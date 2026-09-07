import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store.ts';
import { AIProvider, AIModelConfig, ConfigurableParams, LLMTaskKey } from '../types.ts';
import { PROVIDER_METADATA } from '../models.config.ts';
import { AgenticApiService } from '../services/agenticApiService.ts';
import { SliderInput } from './SliderInput.tsx';
import { 
  Cpu, 
  SlidersHorizontal, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Sparkles, 
  Zap, 
  Lock, 
  Globe, 
  Brain, 
  Eye, 
  EyeOff, 
  Key, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  ExternalLink 
} from 'lucide-react';

interface ModelSelectionPanelProps {
  onOpenSettings?: () => void;
  className?: string;
}

export const ModelSelectionPanel: React.FC<ModelSelectionPanelProps> = ({
  onOpenSettings,
  className = ''
}) => {
  const store = useAppStore();
  const {
    selectedProviderKey,
    setSelectedProviderKey,
    selectedModelId,
    setSelectedModelId,
    availableModels,
    setAvailableModels,
    modelConfigParams,
    setModelConfigParams,
    userApiKeys,
    setUserApiKeys,
    apiKeyValidation,
    setApiKeyValidation,
    applyModelToAllTasks,
    updateTaskParameters
  } = store;

  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [isTestingHandshake, setIsTestingHandshake] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; message?: string } | null>(null);
  const [showParameters, setShowParameters] = useState(true);
  const [syncToAllTasks, setSyncToAllTasks] = useState(true);
  const [inlineKeyInput, setInlineKeyInput] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Models filtered for current provider
  const providerModels = useMemo(() => {
    return availableModels.filter(m => m.provider === selectedProviderKey);
  }, [availableModels, selectedProviderKey]);

  // Currently active model config
  const activeModel = useMemo(() => {
    return availableModels.find(m => m.id === selectedModelId && m.provider === selectedProviderKey) 
      || providerModels[0] 
      || null;
  }, [availableModels, selectedModelId, selectedProviderKey, providerModels]);

  const currentKey = userApiKeys[selectedProviderKey] || '';
  const isKeyValid = apiKeyValidation[selectedProviderKey] === 'valid';
  const isKeyInvalid = apiKeyValidation[selectedProviderKey] === 'invalid';

  // Current parameter values with safe defaults
  const temperature = Number(modelConfigParams.temperature ?? 0.2);
  const topP = Number(modelConfigParams.topP ?? 0.95);
  const topK = Number(modelConfigParams.topK ?? 40);
  const maxOutputTokens = Number(modelConfigParams.max_tokens ?? modelConfigParams.maxOutputTokens ?? 4096);
  const thinkingBudget = Number(modelConfigParams.thinkingBudget ?? 4096);

  const supportsThinking = Boolean(activeModel?.capabilities?.thinking || activeModel?.supportsThinking);
  const supportsWebSearch = Boolean(activeModel?.capabilities?.webSearch || activeModel?.supportsGoogleSearch);
  const supportsVision = Boolean(activeModel?.capabilities?.vision || activeModel?.supportsVision);
  const supportsStructured = Boolean(activeModel?.capabilities?.structuredOutputs);

  // Switch Provider
  const handleProviderChange = (provider: AIProvider) => {
    setSelectedProviderKey(provider);
    setTestResult(null);

    // Pick first available model for this provider
    const modelsForProvider = availableModels.filter(m => m.provider === provider);
    if (modelsForProvider.length > 0) {
      setSelectedModelId(modelsForProvider[0].id);
      if (syncToAllTasks) {
        applyModelToAllTasks(provider, modelsForProvider[0].id);
      }
    }
  };

  // Switch Model
  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    setTestResult(null);
    if (syncToAllTasks) {
      applyModelToAllTasks(selectedProviderKey, modelId);
    }
  };

  // Update a single parameter
  const updateParam = (key: string, value: number | string | boolean) => {
    setModelConfigParams(prev => ({
      ...prev,
      [key]: value
    }));

    if (syncToAllTasks) {
      const taskKeys: LLMTaskKey[] = [
        'fact_check',
        'claim_verification',
        'interactive_chat',
        'preprocessing',
        'custom_command'
      ];
      taskKeys.forEach(tKey => {
        updateTaskParameters(tKey, { [key]: value });
      });
    }
  };

  // Preset Handlers
  const applyPreset = (presetName: 'analytical' | 'balanced' | 'exploratory') => {
    let newParams: Partial<ConfigurableParams> = {};
    if (presetName === 'analytical') {
      newParams = { temperature: 0.1, topP: 0.85, topK: 40 };
    } else if (presetName === 'balanced') {
      newParams = { temperature: 0.2, topP: 0.95, topK: 40 };
    } else if (presetName === 'exploratory') {
      newParams = { temperature: 0.7, topP: 0.95, topK: 40 };
    }

    setModelConfigParams(prev => ({ ...prev, ...newParams }));
    if (syncToAllTasks) {
      const taskKeys: LLMTaskKey[] = [
        'fact_check',
        'claim_verification',
        'interactive_chat',
        'preprocessing',
        'custom_command'
      ];
      taskKeys.forEach(tKey => {
        updateTaskParameters(tKey, newParams);
      });
    }
  };

  // Live Sync Models from Provider
  const handleSyncModels = async () => {
    setIsRefreshingModels(true);
    try {
      const pulled = await AgenticApiService.fetchAvailableModels(selectedProviderKey, currentKey);
      if (pulled && pulled.length > 0) {
        setAvailableModels(prev => {
          const filtered = prev.filter(m => m.provider !== selectedProviderKey);
          return [...filtered, ...pulled];
        });
      }
    } catch (err) {
      console.warn("Model sync failed:", err);
    } finally {
      setIsRefreshingModels(false);
    }
  };

  // Test Model Handshake Ping
  const handleTestHandshake = async () => {
    setIsTestingHandshake(true);
    setTestResult(null);
    const start = performance.now();
    try {
      const result = await AgenticApiService.validateApiKey(selectedProviderKey, currentKey);
      const latency = Math.round(performance.now() - start);
      if (result.isValid) {
        setTestResult({
          success: true,
          latency,
          message: `Connection confirmed with ${activeModel?.name || selectedModelId} (${latency}ms roundtrip)`
        });
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Authentication error with provider.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Handshake failed.'
      });
    } finally {
      setIsTestingHandshake(false);
    }
  };

  // Save inline API Key
  const handleSaveInlineKey = async () => {
    if (!inlineKeyInput.trim()) return;
    const key = inlineKeyInput.trim();
    setUserApiKeys(prev => ({ ...prev, [selectedProviderKey]: key }));
    
    // Validate
    const res = await AgenticApiService.validateApiKey(selectedProviderKey, key);
    setApiKeyValidation(prev => ({
      ...prev,
      [selectedProviderKey]: res.isValid ? 'valid' : 'invalid'
    }));

    if (res.isValid) {
      handleSyncModels();
      setShowKeyInput(false);
      setInlineKeyInput('');
    }
  };

  return (
    <div className={`border border-border rounded-2xl bg-background-secondary/70 overflow-hidden shadow-xs space-y-0 ${className}`}>
      {/* Section Header */}
      <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface/40">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Cpu size={18} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text">
                AI Model & Investigation Parameters
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-text-light font-mono">
                {PROVIDER_METADATA[selectedProviderKey]?.name || selectedProviderKey}
              </span>
            </div>
            <p className="text-xs text-text-light mt-0.5">
              Select your LLM engine and calibrate temperature, reasoning budget, and fact-checking controls
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleSyncModels}
            disabled={isRefreshingModels}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface hover:bg-background-secondary border border-border text-text hover:text-primary transition-all flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
            title="Fetch available models directly from provider API"
          >
            <RefreshCw size={12} className={isRefreshingModels ? 'animate-spin text-primary' : ''} />
            <span>{isRefreshingModels ? 'Syncing...' : 'Sync Models'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowParameters(!showParameters)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface hover:bg-background-secondary border border-border text-text hover:text-primary transition-all flex items-center space-x-1.5 shadow-xs"
          >
            <SlidersHorizontal size={12} />
            <span>{showParameters ? 'Hide Controls' : 'Show Controls'}</span>
            {showParameters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-6">
        {/* Provider Tabs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-text-light flex items-center space-x-1.5">
              <span>1. AI Provider</span>
            </label>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-[11px] text-primary hover:underline flex items-center space-x-1"
              >
                <span>Manage Keys in Settings</span>
                <ExternalLink size={10} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {Object.values(AIProvider).map((p) => {
              const meta = PROVIDER_METADATA[p];
              const isSelected = selectedProviderKey === p;
              const hasKey = Boolean(userApiKeys[p]);
              const isValid = apiKeyValidation[p] === 'valid';

              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-text shadow-xs ring-1 ring-primary/40'
                      : 'border-border bg-surface hover:bg-background-secondary text-text-light hover:text-text'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-tight font-bold truncate">
                      {meta?.name?.split(' ')[0] || p}
                    </span>
                    <span className="shrink-0 ml-1">
                      {isValid ? (
                        <CheckCircle2 size={12} className="text-status-success" />
                      ) : hasKey ? (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      ) : (
                        <div className="w-2 h-2 rounded-full border border-border" />
                      )}
                    </span>
                  </div>
                  <span className="text-[9px] text-text-light/70 truncate block">
                    {isValid ? 'Ready' : hasKey ? 'Configured' : 'Needs Key'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Inline Key Input if Missing */}
        {(!currentKey || isKeyInvalid) && selectedProviderKey !== AIProvider.OLLAMA && (
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-semibold text-text">
                <Key size={14} className="text-amber-500 shrink-0" />
                <span>API Key needed for {PROVIDER_METADATA[selectedProviderKey]?.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="text-xs text-primary hover:underline font-semibold"
              >
                {showKeyInput ? 'Cancel' : 'Enter Key Here'}
              </button>
            </div>

            {showKeyInput && (
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="password"
                  placeholder={`Enter ${PROVIDER_METADATA[selectedProviderKey]?.keyName || 'API Key'}`}
                  value={inlineKeyInput}
                  onChange={(e) => setInlineKeyInput(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-border bg-surface text-text placeholder-text-light/50 outline-none focus:border-primary font-mono"
                />
                <button
                  type="button"
                  onClick={handleSaveInlineKey}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-dark transition-colors shrink-0"
                >
                  Verify & Save
                </button>
              </div>
            )}
          </div>
        )}

        {/* Model Selection Dropdown & Capabilities */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-text-light">
              2. Selected Model
            </label>
            {providerModels.length > 0 && (
              <span className="text-[10px] text-text-light font-mono">
                {providerModels.length} models available
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <select
                value={selectedModelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full p-3.5 bg-surface border border-border rounded-xl text-text text-xs sm:text-sm font-mono focus:border-primary outline-none transition-all cursor-pointer"
              >
                {providerModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.contextWindow ? `(${m.contextWindow})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Test Handshake Button */}
            <button
              type="button"
              onClick={handleTestHandshake}
              disabled={isTestingHandshake || (!currentKey && selectedProviderKey !== AIProvider.OLLAMA)}
              className="px-4 py-3 bg-surface hover:bg-background-secondary border border-border rounded-xl text-xs font-semibold text-text hover:text-primary transition-all flex items-center justify-center space-x-2 shadow-xs disabled:opacity-40"
            >
              <Zap size={14} className={isTestingHandshake ? 'animate-bounce text-primary' : 'text-primary'} />
              <span>{isTestingHandshake ? 'Pinging Model...' : 'Test Model Handshake'}</span>
            </button>
          </div>

          {/* Test Handshake Result */}
          {testResult && (
            <div className={`p-3 rounded-xl border text-xs flex items-center space-x-2 animate-fade-in ${
              testResult.success 
                ? 'bg-status-success/10 border-status-success/30 text-status-success' 
                : 'bg-status-error/10 border-status-error/30 text-status-error'
            }`}>
              {testResult.success ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Active Model Badges */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {activeModel?.contextWindow && (
              <span className="text-[10px] px-2.5 py-1 rounded-lg bg-surface border border-border text-primary font-mono">
                ⚡ Context: {activeModel.contextWindow}
              </span>
            )}
            {supportsWebSearch && (
              <span className="text-[10px] px-2.5 py-1 rounded-lg bg-status-success/10 border border-status-success/30 text-status-success flex items-center space-x-1">
                <Globe size={11} />
                <span>Web Search Grounding</span>
              </span>
            )}
            {supportsThinking && (
              <span className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary flex items-center space-x-1">
                <Brain size={11} />
                <span>CoT Reasoning / Thinking</span>
              </span>
            )}
            {supportsVision && (
              <span className="text-[10px] px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center space-x-1">
                <Eye size={11} />
                <span>Multimodal Vision</span>
              </span>
            )}
            {supportsStructured && (
              <span className="text-[10px] px-2.5 py-1 rounded-lg bg-surface border border-border text-text-light flex items-center space-x-1">
                <span>Structured Output</span>
              </span>
            )}
          </div>
        </div>

        {/* Model Parameters Panel */}
        {showParameters && (
          <div className="pt-4 border-t border-border/80 space-y-5 animate-fade-in">
            {/* Presets Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-light flex items-center space-x-1.5">
                <SlidersHorizontal size={13} className="text-primary" />
                <span>3. Analytical Parameters & Presets</span>
              </span>

              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-[10px] text-text-light mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('analytical')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors border ${
                    temperature <= 0.15 
                      ? 'bg-primary text-on-primary border-primary' 
                      : 'bg-surface border-border text-text-light hover:text-text'
                  }`}
                  title="Temperature 0.10: Maximum factual adherence"
                >
                  Strict Fact-Check
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('balanced')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors border ${
                    temperature > 0.15 && temperature <= 0.35 
                      ? 'bg-primary text-on-primary border-primary' 
                      : 'bg-surface border-border text-text-light hover:text-text'
                  }`}
                  title="Temperature 0.20: Standard SIFT analysis"
                >
                  Balanced SIFT
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('exploratory')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors border ${
                    temperature > 0.35 
                      ? 'bg-primary text-on-primary border-primary' 
                      : 'bg-surface border-border text-text-light hover:text-text'
                  }`}
                  title="Temperature 0.70: Creative hypothesis formation"
                >
                  Exploratory
                </button>
              </div>
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Temperature */}
              <div className="p-3 bg-surface border border-border rounded-xl space-y-1">
                <SliderInput
                  label={`Temperature: ${temperature.toFixed(2)}`}
                  id="main-config-temp"
                  value={temperature}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(val) => updateParam('temperature', val)}
                  description={temperature < 0.3 ? 'Deterministic & analytical' : temperature < 0.8 ? 'Balanced synthesis' : 'Creative & generative'}
                />
              </div>

              {/* Top-P */}
              <div className="p-3 bg-surface border border-border rounded-xl space-y-1">
                <SliderInput
                  label={`Top-P (Nucleus): ${topP.toFixed(2)}`}
                  id="main-config-topp"
                  value={topP}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(val) => updateParam('topP', val)}
                  description="Probability mass limit for candidate tokens"
                />
              </div>

              {/* Top-K */}
              <div className="p-3 bg-surface border border-border rounded-xl space-y-1">
                <SliderInput
                  label={`Top-K: ${topK}`}
                  id="main-config-topk"
                  value={topK}
                  min={1}
                  max={100}
                  step={1}
                  onChange={(val) => updateParam('topK', val)}
                  description="Number of highest-probability tokens considered"
                />
              </div>

              {/* Thinking Budget (if supported) */}
              {supportsThinking && (
                <div className="p-3 bg-surface border border-border rounded-xl space-y-1 sm:col-span-2 lg:col-span-2">
                  <SliderInput
                    label={`Reasoning / Thinking Budget: ${thinkingBudget} tokens`}
                    id="main-config-thinking"
                    value={thinkingBudget}
                    min={1024}
                    max={24576}
                    step={1024}
                    onChange={(val) => updateParam('thinkingBudget', val)}
                    description="Token budget allocated for internal chain-of-thought verification prior to answering"
                  />
                </div>
              )}

              {/* Max Output Tokens */}
              <div className={`p-3 bg-surface border border-border rounded-xl space-y-1 ${!supportsThinking ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
                <SliderInput
                  label={`Max Output: ${maxOutputTokens} tokens`}
                  id="main-config-maxtokens"
                  value={maxOutputTokens}
                  min={512}
                  max={16384}
                  step={256}
                  onChange={(val) => updateParam('max_tokens', val)}
                  description="Maximum length of synthesized analytical response"
                />
              </div>
            </div>

            {/* Sync to all SIFT stages */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={syncToAllTasks}
                  onChange={(e) => setSyncToAllTasks(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span className="text-text font-medium">
                  Apply model and calibrated parameters to all SIFT pipeline stages
                </span>
              </label>
              <span className="text-[10px] text-text-light font-mono hidden sm:inline">
                (Fact Check, Claim Verification, Lateral Reading)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
