import React, { useState, useMemo } from 'react';
import { RecentSessionItem } from '../types.ts';
import { 
  History, 
  Search, 
  Trash2, 
  ExternalLink, 
  MessageSquare, 
  ShieldCheck, 
  FileText, 
  X, 
  Plus, 
  AlertCircle,
  Clock,
  RotateCcw
} from 'lucide-react';

interface RecentSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: RecentSessionItem[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClearAllSessions: () => void;
  onNewSession: () => void;
}

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: diffDays > 365 ? 'numeric' : undefined
  });
};

export const RecentSessionsModal: React.FC<RecentSessionsModalProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onClearAllSessions,
  onNewSession
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase().trim();
    return sessions.filter(session => {
      const matchTitle = session.title.toLowerCase().includes(q);
      const matchPreview = session.previewText?.toLowerCase().includes(q);
      const matchTopic = session.state.sessionTopic?.toLowerCase().includes(q);
      return matchTitle || matchPreview || matchTopic;
    });
  }, [sessions, searchQuery]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="recent-sessions-title"
        className="bg-background-secondary border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <History size={20} />
            </div>
            <div>
              <h2 id="recent-sessions-title" className="text-base font-bold text-text">
                Recent Investigations
              </h2>
              <p className="text-xs text-text-light">
                {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} autosaved in this browser
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onClose();
                onNewSession();
              }}
              className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg transition-colors flex items-center"
              title="Start a new investigation"
            >
              <Plus size={14} className="mr-1.5" /> New
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-text-light hover:text-text rounded-lg hover:bg-border transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-border/50 bg-background/50 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
          <div className="relative w-full sm:flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search past investigations..."
              className="w-full pl-9 pr-4 py-2 bg-background-secondary border border-border rounded-xl text-xs text-text placeholder-text-light/50 focus:border-primary/50 outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-light hover:text-text"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {sessions.length > 0 && (
            <div className="shrink-0">
              {showClearConfirm ? (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-status-error font-medium">Clear all?</span>
                  <button
                    onClick={() => {
                      onClearAllSessions();
                      setShowClearConfirm(false);
                    }}
                    className="px-2.5 py-1 bg-status-error text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-2 py-1 text-xs text-text-light hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="text-xs text-text-light hover:text-status-error transition-colors flex items-center py-1 px-2 rounded hover:bg-border/30"
                  title="Clear all saved sessions from this browser"
                >
                  <Trash2 size={13} className="mr-1.5" /> Clear All
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-border/20">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-border/40 mx-auto flex items-center justify-center text-text-light">
                <Clock size={24} />
              </div>
              <h3 className="text-sm font-semibold text-text">
                {searchQuery ? 'No matching investigations' : 'No saved sessions yet'}
              </h3>
              <p className="text-xs text-text-light max-w-sm mx-auto leading-relaxed">
                {searchQuery 
                  ? 'Try searching with a different keyword or claim topic.'
                  : 'Your investigations will automatically autosave here as you search, fact-check claims, and analyze sources.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => {
                    onClose();
                    onNewSession();
                  }}
                  className="mt-2 inline-flex items-center px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-xl hover:bg-primary-dark transition-all"
                >
                  <Plus size={14} className="mr-1.5" /> Start Investigation
                </button>
              )}
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              const isConfirmingDelete = sessionToDelete === session.id;

              return (
                <div
                  key={session.id}
                  className={`pt-2.5 first:pt-0 group rounded-xl p-3 transition-all border ${
                    isCurrent 
                      ? 'bg-primary/5 border-primary/30 shadow-xs' 
                      : 'bg-background hover:bg-border/20 border-border/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-on-primary tracking-wide">
                            Active
                          </span>
                        )}
                        <h4 className="text-sm font-semibold text-text truncate group-hover:text-primary transition-colors">
                          {session.title}
                        </h4>
                      </div>

                      {session.previewText && (
                        <p className="text-xs text-text-light/80 line-clamp-2 leading-relaxed mb-2.5">
                          {session.previewText}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-light">
                        <span className="flex items-center" title={new Date(session.updatedAt).toLocaleString()}>
                          <Clock size={12} className="mr-1 opacity-70" />
                          {formatRelativeTime(session.updatedAt)}
                        </span>

                        <span className="inline-block w-1 h-1 rounded-full bg-border"></span>

                        <span className="flex items-center">
                          <MessageSquare size={12} className="mr-1 opacity-70" />
                          {session.messageCount} {session.messageCount === 1 ? 'msg' : 'msgs'}
                        </span>

                        {session.sourceCount > 0 && (
                          <>
                            <span className="inline-block w-1 h-1 rounded-full bg-border"></span>
                            <span className="flex items-center text-status-success font-medium">
                              <ShieldCheck size={12} className="mr-1" />
                              {session.sourceCount} {session.sourceCount === 1 ? 'source' : 'sources'}
                            </span>
                          </>
                        )}

                        {session.state.sessionFiles && session.state.sessionFiles.length > 0 && (
                          <>
                            <span className="inline-block w-1 h-1 rounded-full bg-border"></span>
                            <span className="flex items-center">
                              <FileText size={12} className="mr-1 opacity-70" />
                              {session.state.sessionFiles.length} {session.state.sessionFiles.length === 1 ? 'file' : 'files'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex items-center space-x-2 pt-1">
                      {isConfirmingDelete ? (
                        <div className="flex items-center space-x-1.5 bg-background-secondary p-1 rounded-lg border border-border">
                          <button
                            onClick={() => {
                              onDeleteSession(session.id);
                              setSessionToDelete(null);
                            }}
                            className="px-2 py-1 bg-status-error text-white text-[11px] font-bold rounded hover:opacity-90 transition-opacity"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setSessionToDelete(null)}
                            className="px-2 py-1 text-[11px] text-text-light hover:text-text"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              onSelectSession(session.id);
                              onClose();
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition-all ${
                              isCurrent
                                ? 'bg-border text-text hover:bg-border/80'
                                : 'bg-primary text-on-primary hover:bg-primary-dark shadow-xs'
                            }`}
                          >
                            {isCurrent ? (
                              <>
                                <RotateCcw size={13} className="mr-1.5" /> View
                              </>
                            ) : (
                              <>
                                <ExternalLink size={13} className="mr-1.5" /> Resume
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setSessionToDelete(session.id)}
                            className="p-1.5 text-text-light/60 hover:text-status-error hover:bg-status-error/10 rounded-lg transition-colors"
                            title="Delete session"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-background/50 flex items-center justify-between text-xs text-text-light shrink-0">
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-status-success inline-block mr-2"></span>
            Autosaving is active
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-background-secondary border border-border text-text text-xs font-semibold rounded-lg hover:bg-border transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
