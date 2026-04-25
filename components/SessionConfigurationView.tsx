
import React, { useState, DragEvent } from 'react';
import { UploadedFile } from '../types.ts';
import { SIFT_ICON } from '../constants.ts';
import { 
  Key, 
  Settings, 
  FileUp, 
  X, 
  RotateCcw, 
  Sparkles,
  Plus,
  Link as LinkIcon,
  MessageSquareText
} from 'lucide-react';

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
                <div className="flex flex-col items-center justify-center text-center p-12 h-screen max-h-[600px]">
                    <div className="w-16 h-16 bg-background-secondary border border-border rounded-2xl flex items-center justify-center mb-6">
                      <Key size={32} className="text-primary" />
                    </div>
                    <h2 className="text-xl font-bold text-text uppercase tracking-widest mb-3">Authentication Required</h2>
                    <p className="text-text-light text-sm max-w-sm mb-8 leading-relaxed">
                        To access SIFT Box intelligence, please provide a valid API key in the environment or settings.
                    </p>
                    <button 
                        onClick={onOpenSettings}
                        className="px-6 py-2.5 bg-primary text-on-primary font-bold text-sm rounded-xl hover:bg-primary-dark transition-all flex items-center"
                    >
                        <Settings size={18} className="mr-2" /> Open Settings
                    </button>
                </div>
            );
        }

        return (
            <div className="max-w-2xl mx-auto space-y-12">
                <header className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-background-secondary border border-border rounded-xl mb-4">
                    <Sparkles size={24} className="text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold uppercase tracking-widest text-text">New Investigation</h1>
                  <p className="text-text-light text-sm">Configure your search and analysis parameters</p>
                </header>

                <div className="space-y-8">
                    <div className="space-y-2">
                        <label htmlFor="session-topic" className="flex items-center text-xs font-bold uppercase tracking-wider text-text-light">
                          <MessageSquareText size={14} className="mr-2" /> Topic / Subject
                        </label>
                        <input
                            id="session-topic"
                            type="text"
                            value={sessionTopic}
                            onChange={(e) => setSessionTopic(e.target.value)}
                            placeholder="What would you like to investigate?"
                            className="w-full p-4 bg-background-secondary border border-border rounded-2xl text-text placeholder-text-light/50 focus:border-primary/50 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="session-context" className="flex items-center text-xs font-bold uppercase tracking-wider text-text-light">
                          <Plus size={14} className="mr-2" /> Additional Context
                        </label>
                        <textarea
                            id="session-context"
                            rows={3}
                            value={sessionContext}
                            onChange={(e) => setSessionContext(e.target.value)}
                            placeholder="Add specific instructions or background..."
                            className="w-full p-4 bg-background-secondary border border-border rounded-2xl text-text placeholder-text-light/50 focus:border-primary/50 outline-none transition-all resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label htmlFor="session-urls" className="flex items-center text-xs font-bold uppercase tracking-wider text-text-light">
                          <LinkIcon size={14} className="mr-2" /> REFERENCE URLS
                        </label>
                        <textarea
                            id="session-urls"
                            rows={4}
                            value={sessionUrls}
                            onChange={(e) => setSessionUrls(e.target.value)}
                            placeholder="https://example.com..."
                            className="w-full p-4 bg-background-secondary border border-border rounded-2xl text-text text-sm placeholder-text-light/50 focus:border-primary/50 outline-none transition-all resize-none"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center text-xs font-bold uppercase tracking-wider text-text-light">
                          <FileUp size={14} className="mr-2" /> SUPPORTING FILES
                        </label>
                        <div
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            className={`relative min-h-[116px] flex flex-col items-center justify-center p-4 border-2 ${isDraggingOver ? 'border-primary bg-primary/5' : 'border-border'} border-dashed rounded-2xl transition-all hover:bg-background-secondary group cursor-pointer`}
                        >
                            <FileUp size={24} className={`mb-2 transition-transform ${isDraggingOver ? 'scale-110 text-primary' : 'text-text-light group-hover:text-text'}`} />
                            <div className="text-center">
                                <label htmlFor="file-upload" className="cursor-pointer font-bold text-xs text-primary hover:underline">
                                    Click to upload
                                </label>
                                <p className="text-[10px] text-text-light mt-1 uppercase tracking-tight">or drag and drop</p>
                            </div>
                            <input id="file-upload" name="file-upload" type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" multiple onChange={(e) => handleFileChange(e.target.files)} />
                        </div>
                        
                        {sessionFiles.length > 0 && (
                            <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto pr-1">
                                {sessionFiles.map((file, index) => (
                                    <div key={index} className="flex items-center justify-between bg-background-secondary border border-border p-2 rounded-xl text-[11px]">
                                        <div className="flex-1 truncate group" title={file.name}>
                                            <span className="font-medium text-text group-hover:text-primary transition-colors">{file.name}</span>
                                        </div>
                                        <button onClick={() => removeFile(index)} className="ml-2 text-text-light hover:text-status-error transition-colors" title="Remove">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                      </div>
                    </div>
                </div>

                <footer className="footer-actions flex flex-col space-y-3 pt-6 border-t border-border">
                    <button
                        onClick={onStartSession}
                        disabled={!isApiKeyValid || !canStart}
                        className="w-full py-4 bg-primary text-on-primary font-bold text-sm uppercase tracking-widest rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        Initialize Analysis
                    </button>
                    {showRestoreButton && (
                        <button 
                            onClick={onRestoreSession}
                            className="w-full py-4 bg-background-secondary border border-border text-text font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-border transition-all flex items-center justify-center"
                        >
                            <RotateCcw size={16} className="mr-2" /> Restore Session
                        </button>
                    )}
                </footer>
            </div>
        );
    }
    
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {renderContent()}
      </div>
    );
};
