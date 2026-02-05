
import React from 'react';

interface ExportSessionModalProps {
  onClose: () => void;
  onExport: (format: 'pdf' | 'md' | 'html' | 'json') => void;
}

export const ExportSessionModal: React.FC<ExportSessionModalProps> = ({ onClose, onExport }) => {
  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-content text-main rounded-xl shadow-2xl w-full max-w-md flex flex-col border border-ui"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-ui">
          <h2 className="text-lg font-bold text-primary-accent">Export Full Session</h2>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-light hover:bg-border hover:text-main transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <main className="p-6 space-y-4">
          <p className="text-sm text-light">Choose a format to export the entire investigation history, including all AI reports and conversations.</p>
          
          <div className="grid grid-cols-1 gap-3">
            <ExportOption 
              icon="picture_as_pdf" 
              title="PDF Document" 
              description="Printable, multipage report with styles." 
              onClick={() => onExport('pdf')} 
            />
            <ExportOption 
              icon="description" 
              title="Markdown" 
              description="Standard markdown file for documentation." 
              onClick={() => onExport('md')} 
            />
            <ExportOption 
              icon="html" 
              title="HTML" 
              description="Web-ready styled document." 
              onClick={() => onExport('html')} 
            />
            <ExportOption 
              icon="code" 
              title="JSON" 
              description="Raw session data for backup or processing." 
              onClick={() => onExport('json')} 
            />
          </div>
        </main>

        <footer className="p-4 border-t border-ui text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-border hover:bg-border-hover text-main font-medium rounded-md shadow-sm transition-colors"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
};

const ExportOption: React.FC<{ icon: string; title: string; description: string; onClick: () => void }> = ({ icon, title, description, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center p-4 bg-main hover:bg-primary/10 border border-ui rounded-lg transition-all group text-left"
  >
    <span className="material-symbols-outlined text-3xl text-primary-accent group-hover:scale-110 transition-transform mr-4">
      {icon}
    </span>
    <div>
      <h3 className="font-bold text-main group-hover:text-primary-accent">{title}</h3>
      <p className="text-xs text-light">{description}</p>
    </div>
  </button>
);
