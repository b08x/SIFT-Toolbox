
import React from 'react';

interface LandingPageProps {
  onGetStarted: () => void;
  onRestoreSession: () => void;
  showRestoreButton: boolean;
}

const FeatureCard: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="bg-[#333e48]/60 p-6 rounded-lg shadow-lg border border-[#5c6f7e]/50 h-full">
        <div className="flex items-center mb-3">
            <span className="text-2xl mr-3">{icon}</span>
            <h3 className="text-xl font-bold text-[#e2a32d]">{title}</h3>
        </div>
        <p className="text-[#95aac0]">{children}</p>
    </div>
);

const SiftStep: React.FC<{ letter: string; title: string; children: React.ReactNode }> = ({ letter, title, children }) => (
    <div className="flex items-start">
        <div className="flex-shrink-0 flex flex-col items-center mr-4">
            <span className="text-3xl font-bold text-[#c36e26]">{letter}</span>
        </div>
        <div>
            <h4 className="font-semibold text-gray-200">{title}</h4>
            <p className="text-sm text-[#95aac0]">{children}</p>
        </div>
    </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onRestoreSession, showRestoreButton }) => {
  return (
    <div className="bg-[#212934] text-gray-200 min-h-screen flex flex-col overflow-y-auto">
        <main className="flex-grow container mx-auto px-6 py-12">
            <header className="text-center mb-12">
                <h1 className="text-5xl font-extrabold text-[#e2a32d] mb-2">
                    <span className="mr-4">🔍</span>SIFT Toolbox
                </h1>
                <p className="text-xl text-[#95aac0] max-w-3xl mx-auto">
                    Leveraging Language Models to compile and analyze information for modern fact-checking.
                </p>
            </header>

            <section className="mb-16">
                <div className="grid md:grid-cols-2 gap-8 items-center bg-[#333e48]/20 p-8 rounded-xl border border-[#5c6f7e]/30">
                    <div>
                        <h2 className="text-3xl font-bold text-white mb-4">What is SIFT?</h2>
                        <p className="text-[#95aac0] mb-6">
                            Developed by digital literacy expert Mike Caulfield, SIFT is a battle-tested methodology for evaluating information online. It provides four simple moves to help you get your bearings and find the best sources available.
                        </p>
                        <div className="space-y-4">
                             <SiftStep letter="S" title="Stop">
                                Don't read or share a source until you know what it is. The goal is to prevent yourself from being influenced by or amplifying misinformation.
                            </SiftStep>
                            <SiftStep letter="I" title="Investigate the Source">
                                Look up the publication, author, or creator. Understand their expertise, perspective, and potential biases before you engage with their content.
                            </SiftStep>
                            <SiftStep letter="F" title="Find Better Coverage">
                                Instead of analyzing a single source, find what other trusted sources say about the claim. This is often called "lateral reading."
                            </SiftStep>
                            <SiftStep letter="T" title="Trace Claims to Original Context">
                                Find the original context for claims, quotes, and media. Content is often stripped of its context to mislead. Tracing it back reveals the truth.
                            </SiftStep>
                        </div>
                    </div>
                    <div className="hidden md:flex justify-center items-center">
                         <svg xmlns="http://www.w3.org/2000/svg" className="w-64 h-64 text-[#5c6f7e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6M9 11h6M9 14h4" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 5.5h17v13h-17z" />
                         </svg>
                    </div>
                </div>
            </section>
            
            <section className="mb-16">
                 <h2 className="text-3xl font-bold text-center text-white mb-8">How This Toolbox Supercharges SIFT</h2>
                 <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-6">
                    <FeatureCard icon="📄" title="Comprehensive Reports">
                        Generate a "Full Check" report that systematically verifies facts, identifies errors, assesses source reliability, and provides a corrected summary with citations.
                    </FeatureCard>
                    <FeatureCard icon="⚡" title="Context on Demand">
                        Quickly create a "Context Report" for a high-level overview or a "Community Note" for a concise, shareable summary to combat misinterpretation.
                    </FeatureCard>
                     <FeatureCard icon="💬" title="Interactive Investigation">
                        Refine the analysis through a chat interface. Ask follow-up questions, command the model to dig deeper ("another round"), or analyze the surrounding discourse ("read the room").
                    </FeatureCard>
                 </div>
            </section>

            <section className="text-center">
                 <h2 className="text-3xl font-bold text-white mb-4">Ready to Start Analyzing?</h2>
                 <p className="text-[#95aac0] max-w-2xl mx-auto mb-8">
                    This tool uses third-party Language Model providers. You will need your own API key to proceed. Your keys are stored only in your browser for the current session and are not sent anywhere except to the selected model provider.
                 </p>
                 <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                     <button 
                        onClick={onGetStarted}
                        className="px-8 py-4 bg-gradient-to-r from-[#e2a32d] to-[#c36e26] hover:from-[#f5b132] hover:to-[#d67e2a] text-white font-bold text-lg rounded-lg shadow-xl transform hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#c36e26]/50 w-full sm:w-auto"
                     >
                        Get Started →
                     </button>
                     {showRestoreButton && (
                         <button 
                            onClick={onRestoreSession}
                            className="px-8 py-4 bg-[#333e48] border border-[#5c6f7e] hover:bg-[#5c6f7e] text-white font-bold text-lg rounded-lg shadow-xl transform hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#5c6f7e]/50 w-full sm:w-auto"
                         >
                            Restore Previous Session ↩
                         </button>
                     )}
                 </div>
            </section>
        </main>
        <footer className="text-center py-4 text-xs text-[#95aac0]/70 flex-shrink-0">
            <p>SIFT Toolbox v1.3 | Inspired by the SIFT methodology by Mike Caulfield.</p>
        </footer>
    </div>
  );
};