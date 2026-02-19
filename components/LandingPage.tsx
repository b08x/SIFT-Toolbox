import React from 'react';

const FeatureCard: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="bg-main/60 p-4 rounded-lg shadow-lg border border-ui/50 h-full">
        <div className="flex items-center mb-3">
            <span className="text-xl mr-3">{icon}</span>
            <h3 className="text-lg font-bold text-primary-accent">{title}</h3>
        </div>
        <p className="text-sm text-light">{children}</p>
    </div>
);

const SiftStep: React.FC<{ letter: string; title: string; children: React.ReactNode }> = ({ letter, title, children }) => (
    <div className="flex items-start">
        <div className="flex-shrink-0 flex flex-col items-center mr-4">
            <span className="text-3xl font-bold text-primary-accent">{letter}</span>
        </div>
        <div>
            <h4 className="font-semibold text-main">{title}</h4>
            <p className="text-xs text-light">{children}</p>
        </div>
    </div>
);

export const AboutContent: React.FC = () => {
  return (
    <div className="p-4 space-y-8 text-main">
        <header className="text-center">
            <h1 className="text-2xl font-extrabold text-primary-accent mb-2">
                <span className="mr-2">🔍</span>SIFT Toolbox
            </h1>
            <p className="text-sm text-light max-w-3xl mx-auto">
                Leveraging Language Models to compile and analyze information for modern fact-checking.
            </p>
        </header>

        <section>
            <div className="bg-main/30 p-4 rounded-xl border border-ui/30">
                <h2 className="text-xl font-bold text-main mb-4">What is SIFT?</h2>
                <p className="text-sm text-light mb-6">
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
                <h2 className="text-xl font-bold text-center text-main mb-4">How This Toolbox Supercharges SIFT</h2>
                <div className="grid grid-cols-1 gap-4">
                <FeatureCard icon="📄" title="Comprehensive Reports">
                    Generate a "Full Check" report that systematically verifies facts, identifies errors, assesses source reliability, and provides a corrected summary with citations.
                </FeatureCard>
                <FeatureCard icon="⚡" title="Context on Demand">
                    Quickly create a "Context Report" for a high-level overview or a "Community Note" for a concise, shareable summary to combat misinterpretation.
                </FeatureCard>
                    <FeatureCard icon="💬" title="Interactive Investigation">
                        Refine the analysis through a chat interface. Ask follow-up questions, command the model to find more sources ("another round"), analyze public discourse ("read the room"), or trace a claim back to its original context ("trace claim").
                </FeatureCard>
                </div>
        </section>

        <section>
                <h2 className="text-xl font-bold text-center text-main mb-4">Example Prompts & Use Cases</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-main/40 p-4 rounded-lg border border-ui/40">
                        <h3 className="font-bold text-primary-accent mb-2 text-sm uppercase tracking-wider">Viral Claim Verification</h3>
                        <p className="text-xs text-light italic mb-2">"Analyze the claim that [Insert Viral Claim] using the SIFT method. Focus on finding the original source and checking for lateral coverage."</p>
                        <p className="text-[10px] text-light/70">Use this when you see a suspicious headline or social media post that seems too good (or bad) to be true.</p>
                    </div>
                    <div className="bg-main/40 p-4 rounded-lg border border-ui/40">
                        <h3 className="font-bold text-primary-accent mb-2 text-sm uppercase tracking-wider">Source Investigation</h3>
                        <p className="text-xs text-light italic mb-2">"Investigate the background of [Insert Website or Author]. What is their reputation in this field? Do they have a clear political or commercial bias?"</p>
                        <p className="text-[10px] text-light/70">Perfect for evaluating a new news site or an 'expert' you've never heard of before.</p>
                    </div>
                    <div className="bg-main/40 p-4 rounded-lg border border-ui/40">
                        <h3 className="font-bold text-primary-accent mb-2 text-sm uppercase tracking-wider">Tracing Context</h3>
                        <p className="text-xs text-light italic mb-2">"Trace this quote back to its original context: '[Insert Quote]'. Was it edited or taken out of context to change its meaning?"</p>
                        <p className="text-[10px] text-light/70">Useful for political speeches or controversial statements that might be missing critical nuances.</p>
                    </div>
                    <div className="bg-main/40 p-4 rounded-lg border border-ui/40">
                        <h3 className="font-bold text-primary-accent mb-2 text-sm uppercase tracking-wider">Deep Background</h3>
                        <p className="text-xs text-light italic mb-2">"Provide a deep background report on the [Insert Topic] controversy. Map out the different perspectives and identify the most reliable data points."</p>
                        <p className="text-[10px] text-light/70">Best for complex, multi-sided issues where you need to understand the 'discourse map' of the conversation.</p>
                    </div>
                </div>
        </section>
    </div>
  );
};