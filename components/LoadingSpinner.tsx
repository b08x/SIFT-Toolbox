
import React from 'react';
import { ReportType } from '../types'; // Import ReportType

interface LoadingSpinnerProps {
  reportType: ReportType;
  onTimeout: () => void;
  // We are not using these props in the component's rendering logic for now,
  // but they are defined to match the props passed in App.tsx
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ reportType, onTimeout }) => {
  // TODO: Optionally use reportType to customize the message, e.g., "Generating {reportType} Report..."
  // TODO: Implement timeout logic using onTimeout if needed, though App.tsx seems to handle it externally.
  return (
    <div className="flex flex-col items-center justify-center my-10 p-6 bg-[#333e48]/50 rounded-lg">
      <svg className="animate-spin h-12 w-12 text-[#e2a32d]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p className="mt-4 text-lg text-gray-200 font-medium">Generating SIFT Report...</p>
      <p className="text-sm text-[#95aac0]">This may take a few moments.</p>
    </div>
  );
};