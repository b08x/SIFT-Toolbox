import React from 'react';

const FeatureCard: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="bg-[#212934]/60 p-4 rounded-lg shadow-lg border border-[#5c6f7e]/50 h-full">
        <div className="flex items-center mb-3">
            <span className="text-xl mr-3">{icon}</span>
            <h3 className="text-lg font-bold text-[#e2a32d]">{title}</h3>
        </div>
        <p className="text-sm text-[#95aac0]">{children}</p>
    </div>
);

const SiftStep: React.FC<{ letter: string; title: string; children: React.ReactNode }> = ({ letter, title, children }) => (
    <div className="flex items-start">
        <div className="flex-shrink-0 flex flex-col items-center mr-4">
            <span className="text-3xl font-bold text-[#c36e26]">{letter}</span>
        </div>
        <div>
            <h4 className="font-semibold text-gray-200">{title}</h4>
            <p className="text-xs text-[#95aac0]">{children}</p>
        </div>
    </div>
);

export const AboutContent: React.FC = () => {
  return (
    <div className="p-4 space-y-8 text-gray-200">
        <header className="text-center">
            <h1 className="text-2xl font-extrabold text-[#e2a32d] mb-2">
                <span className="mr-2">🔍</span>SIFT Toolbox
            </h1>
            <p className="text-sm text-[#95aac0] max-w-3xl mx-auto">
                Leveraging Language Models to compile and analyze information for modern fact-checking.
            </p>
        </header>

        <section>
            <div className="bg-[#212934]/30 p-4 rounded-xl border border-[#5c6f7e]/30">
                <h2 className="text-xl font-bold text-white mb-4">What is SIFT?</h2>
                <p className="text-sm text-[#95aac0] mb-6">
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
        </section>
        
        <section>
                <h2 className="text-xl font-bold text-center text-white mb-4">How This Toolbox Supercharges SIFT</h2>
                <div className="grid grid-cols-1 gap-4">
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
    </div>
  );
};
