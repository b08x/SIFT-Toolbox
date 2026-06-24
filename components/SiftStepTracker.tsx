import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface SiftStepTrackerProps {
  isLoading: boolean;
  streamedText?: string;
}

const SIFT_STEPS = [
  { id: 'stop', label: 'Stop', description: 'Checking initial context' },
  { id: 'investigate', label: 'Investigate', description: 'Assessing source credibility' },
  { id: 'find', label: 'Find', description: 'Seeking better coverage' },
  { id: 'trace', label: 'Trace', description: 'Tracing claims to origin' },
];

export const SiftStepTracker: React.FC<SiftStepTrackerProps> = ({ isLoading, streamedText }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setCurrentStepIndex(4);
      return;
    }

    // Reset when loading starts and no text
    if (isLoading && (!streamedText || streamedText.length === 0)) {
        setCurrentStepIndex(0);
    }

    // Heuristics based on streamed text length to simulate progress
    // Since we don't know the exact step, we simulate it based on characters received
    if (streamedText) {
        const len = streamedText.length;
        if (len > 50 && currentStepIndex < 1) setCurrentStepIndex(1);
        if (len > 400 && currentStepIndex < 2) setCurrentStepIndex(2);
        if (len > 1200 && currentStepIndex < 3) setCurrentStepIndex(3);
    }

    // Fallback timer to ensure it progresses even if text is short/slow
    const timer = setInterval(() => {
        setCurrentStepIndex(prev => {
            if (prev < 3) return prev + 1;
            return prev;
        });
    }, 2500);

    return () => clearInterval(timer);
  }, [isLoading, streamedText]);

  if (!isLoading && currentStepIndex === 4) return null;

  return (
    <div className="flex flex-col p-4 bg-content border border-ui rounded-xl mb-4 w-full shadow-sm max-w-2xl mx-auto mt-4">
      <div className="text-xs font-semibold text-light mb-3 uppercase tracking-wider text-center">SIFT Methodology Progress</div>
      <div className="flex justify-between items-center relative">
        <div className="absolute left-[10%] right-[10%] top-3 h-[2px] bg-border -z-10"></div>
        {SIFT_STEPS.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isCompleted = index < currentStepIndex;
          
          return (
            <div key={step.id} className="flex flex-col items-center w-1/4 relative z-10 bg-content">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-content">
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5 text-status-success" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 text-primary-accent animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-light" />
                )}
              </div>
              <div className={`mt-2 font-medium text-[11px] uppercase tracking-wide ${isActive ? 'text-primary-accent' : isCompleted ? 'text-main' : 'text-light'}`}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

