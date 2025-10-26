import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { AIProvider, ApiKeyValidationStates, LiveTranscript } from '../types.ts';
import { useAppStore } from '../store.ts';

// --- Audio Helper Functions (from Gemini API documentation) ---

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// --- Component ---

interface LiveConversationViewProps {
    userApiKeys: { [key in AIProvider]?: string };
    onOpenSettings: () => void;
    apiKeyValidation: ApiKeyValidationStates;
    onClose: () => void;
}

export const LiveConversationView: React.FC<LiveConversationViewProps> = ({ userApiKeys, onOpenSettings, apiKeyValidation, onClose }) => {
    const [conversationState, setConversationState] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
    const [transcripts, setTranscripts] = useState<LiveTranscript[]>([]);
    const [currentError, setCurrentError] = useState<string | null>(null);

    const { chatMessages, sessionTopic } = useAppStore();

    const transcriptContainerRef = useRef<HTMLDivElement>(null);
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    
    // For audio playback queue
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const isGeminiKeyValid = apiKeyValidation[AIProvider.GOOGLE_GEMINI] === 'valid';

    const addTranscript = (speaker: 'user' | 'ai' | 'status', text: string, isFinal = true) => {
        setTranscripts(prev => [...prev, { id: uuidv4(), speaker, text, isFinal }]);
    };

    const stopConversation = useCallback(async (isClosing = false) => {
        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) {
                console.error("Error closing session:", e);
            }
        }
        
        scriptProcessorRef.current?.disconnect();
        scriptProcessorRef.current = null;
        
        micStreamRef.current?.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;

        inputAudioContextRef.current?.close().catch(console.error);
        inputAudioContextRef.current = null;
        
        outputAudioContextRef.current?.close().catch(console.error);
        outputAudioContextRef.current = null;
        
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;

        sessionPromiseRef.current = null;
        // Don't set state if we are unmounting via the main close button
        if (!isClosing) {
            setConversationState('idle');
        }
    }, []);

    useEffect(() => {
        // Cleanup on component unmount
        return () => {
            stopConversation(true);
        };
    }, [stopConversation]);

    useEffect(() => {
        transcriptContainerRef.current?.scrollTo({ top: transcriptContainerRef.current.scrollHeight, behavior: 'smooth' });
    }, [transcripts]);

    const startConversation = async () => {
        const apiKey = userApiKeys[AIProvider.GOOGLE_GEMINI];
        if (!apiKey) {
            addTranscript('status', 'Error: Gemini API Key not found. Please set it in Settings.');
            setCurrentError('API Key not found.');
            setConversationState('error');
            return;
        }

        setConversationState('connecting');
        setCurrentError(null);
        setTranscripts([]);
        addTranscript('status', 'Connecting to Gemini...');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;

            const transcriptSummary = chatMessages.length > 0 ? chatMessages
                .filter(m => !m.isLoading && !m.isError && m.text.trim())
                .map(m => `${m.sender === 'user' ? 'User' : 'SIFT Assistant'}: ${m.text}`)
                .join('\n\n')
                : "No text session has occurred yet.";
            
            const systemInstruction = `You are a helpful voice assistant. The user has been conducting a SIFT analysis on the topic of '${sessionTopic || 'the provided materials'}'. The following is the transcript of their text-based session. You are now in a live voice conversation to discuss this analysis. Your main goal is to answer the user's spoken questions about the session, summarize findings, or discuss the sources based on the provided transcript.

--- PREVIOUS SESSION TRANSCRIPT ---
${transcriptSummary}
--- END TRANSCRIPT ---

Start the conversation by greeting the user, then provide a concise, one or two-sentence summary of the current state of the SIFT analysis based on the provided transcript. After the summary, ask how you can help them further with the investigation.`;


            const ai = new GoogleGenAI({ apiKey });

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setConversationState('active');
                        addTranscript('status', 'Connection open. Start speaking.');
                        
                        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        const source = inputAudioContextRef.current.createMediaStreamSource(stream);
                        scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        source.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                       if (message.serverContent?.inputTranscription) {
                           const { text, isFinal } = message.serverContent.inputTranscription;
                           setTranscripts(prev => {
                               const last = prev[prev.length - 1];
                               if (last?.speaker === 'user' && !last.isFinal) {
                                   const updated = [...prev];
                                   updated[updated.length - 1] = { ...last, text, isFinal };
                                   return updated;
                               }
                               return [...prev, { id: uuidv4(), speaker: 'user', text, isFinal }];
                           });
                       }

                       if (message.serverContent?.outputTranscription) {
                            const { text, isFinal } = message.serverContent.outputTranscription;
                             setTranscripts(prev => {
                                const last = prev[prev.length - 1];
                                if (last?.speaker === 'ai' && !last.isFinal) {
                                   const updated = [...prev];
                                   updated[updated.length - 1] = { ...last, text, isFinal };
                                   return updated;
                                }
                                return [...prev, { id: uuidv4(), speaker: 'ai', text, isFinal }];
                           });
                       }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
                                outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                            }
                            const outputAudioContext = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                            
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                            
                            const source = outputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContext.destination);
                            
                            source.addEventListener('ended', () => {
                                sourcesRef.current.delete(source);
                            });

                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }
                        
                        const interrupted = message.serverContent?.interrupted;
                        if (interrupted) {
                            for (const source of sourcesRef.current.values()) {
                                source.stop();
                                sourcesRef.current.delete(source);
                            }
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Live session error:', e);
                        setCurrentError(`Connection error: ${e.message}`);
                        addTranscript('status', `Error: ${e.message}. Please try again.`);
                        setConversationState('error');
                        stopConversation();
                    },
                    onclose: (e: CloseEvent) => {
                        addTranscript('status', 'Conversation ended.');
                        stopConversation();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                    },
                    systemInstruction: systemInstruction,
                },
            });
            sessionPromiseRef.current = sessionPromise;

        } catch (err) {
            console.error('Failed to start conversation:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            setCurrentError(`Failed to start: ${errorMessage}`);
            addTranscript('status', `Error: ${errorMessage}`);
            setConversationState('error');
        }
    };

    const toggleConversation = () => {
        if (conversationState === 'active' || conversationState === 'connecting') {
            stopConversation();
        } else {
            startConversation();
        }
    };
    
    const renderContent = () => {
         if (!isGeminiKeyValid) {
            return (
                <div className="flex flex-col items-center justify-center text-center p-8 h-full">
                    <span className="text-6xl mb-4">🔑</span>
                    <h2 className="text-2xl font-bold text-main">Google Gemini API Key Required</h2>
                    <p className="text-light mt-2 max-w-md">
                        Please configure and validate a valid Google Gemini API key in the settings to use the Live Conversation feature.
                    </p>
                    <button 
                        onClick={() => {
                            onOpenSettings();
                            onClose();
                        }}
                        className="mt-6 px-5 py-2.5 bg-primary hover:brightness-110 text-on-primary font-bold text-base rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-primary/50"
                    >
                        Open Settings
                    </button>
                </div>
            );
        }

        const getStatusMessage = () => {
            switch(conversationState) {
                case 'idle': return 'Click the microphone to start a conversation.';
                case 'connecting': return 'Connecting to Gemini...';
                case 'active': return 'Listening...';
                case 'error': return `Error: ${currentError || 'An unknown error occurred.'}`;
            }
        }

        return (
            <div className="w-full h-full flex flex-col p-4">
                <div ref={transcriptContainerRef} className="flex-grow overflow-y-auto mb-4 space-y-3 pr-2">
                    {transcripts.map(t => {
                        const isUser = t.speaker === 'user';
                        const isAI = t.speaker === 'ai';
                        const isStatus = t.speaker === 'status';

                        return (
                            <div key={t.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                {isStatus ? (
                                    <div className="text-center w-full">
                                        <span className="text-xs text-light italic bg-main/50 px-2 py-1 rounded-full">{t.text}</span>
                                    </div>
                                ) : (
                                    <div className={`px-3 py-2 rounded-lg max-w-lg shadow ${!t.isFinal ? 'opacity-70' : ''} ${isUser ? 'bg-primary text-on-primary rounded-br-none' : 'bg-content text-main rounded-bl-none'}`}>
                                        <p className="text-sm">{t.text}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="flex-shrink-0 flex flex-col items-center space-y-3">
                    <p className="text-sm text-light h-5">{getStatusMessage()}</p>
                    <button
                        onClick={toggleConversation}
                        disabled={conversationState === 'connecting'}
                        className={`relative w-16 h-16 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-main focus:ring-primary transition-colors
                            ${conversationState === 'active' ? 'bg-status-error' : 'bg-primary'}
                            ${conversationState === 'connecting' ? 'bg-border cursor-wait' : 'hover:brightness-110'}`
                        }
                        aria-label={conversationState === 'active' ? 'Stop conversation' : 'Start conversation'}
                    >
                        {conversationState === 'active' && <div className="absolute inset-0 rounded-full mic-pulse-animation bg-primary/50"></div>}
                        {conversationState === 'active' || conversationState === 'connecting' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-content/95 text-main rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col border border-ui"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-3 border-b border-ui flex-shrink-0">
                    <h2 className="text-lg font-bold text-primary-accent flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                        Live Conversation
                    </h2>
                    <button 
                        onClick={onClose} 
                        className="p-1 rounded-full text-light hover:bg-border hover:text-main transition-colors"
                        aria-label="Close live conversation"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                 <main className="flex-grow overflow-y-auto">
                    {renderContent()}
                </main>
            </div>
        </div>
    );
};