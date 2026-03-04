
import React, { useState, useEffect } from 'react';
import { SIFT_ICON } from '../constants.ts';
import { useAuth } from '../contexts/AuthContext.tsx';

interface LeftSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    onNewSession: () => void;
    onOpenConfig: () => void;
    onOpenAbout: () => void;
    onOpenSettings: () => void;
    onOpenExport: () => void;
    currentView: 'config' | 'chat' | 'about';
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
    isOpen, onToggle, onNewSession, onOpenConfig, onOpenAbout, onOpenSettings, onOpenExport, currentView
}) => {
    const { user, signInWithGoogle, signOut, isConfigured } = useAuth();
    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

    useEffect(() => {
        const savedTheme = localStorage.getItem('sift-theme') as 'light' | 'dark' | 'system' | null;
        if (savedTheme) {
            setTheme(savedTheme);
            applyTheme(savedTheme);
        } else {
            applyTheme('system');
        }
    }, []);

    const applyTheme = (newTheme: 'light' | 'dark' | 'system') => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        
        if (newTheme === 'system') {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (systemPrefersDark) {
                root.classList.add('dark');
            } else {
                root.classList.add('light');
            }
        } else {
            root.classList.add(newTheme);
        }
    };

    const toggleTheme = () => {
        let nextTheme: 'light' | 'dark' | 'system';
        if (theme === 'system') nextTheme = 'light';
        else if (theme === 'light') nextTheme = 'dark';
        else nextTheme = 'system';

        setTheme(nextTheme);
        localStorage.setItem('sift-theme', nextTheme);
        applyTheme(nextTheme);
    };

    const getThemeIcon = () => {
        if (theme === 'light') return 'light_mode';
        if (theme === 'dark') return 'dark_mode';
        return 'brightness_auto';
    };

    const getThemeLabel = () => {
        if (theme === 'light') return 'Light Theme';
        if (theme === 'dark') return 'Dark Theme';
        return 'System Theme';
    };

    return (
        <aside className={`${isOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-content border-r border-ui flex flex-col z-40 hidden md:flex`}>
            <div className="p-4 border-b border-ui flex items-center justify-between">
                <div className={`flex items-center overflow-hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>
                    <span className="text-2xl mr-2">{SIFT_ICON}</span>
                    <h1 className="font-extrabold text-primary-accent text-lg whitespace-nowrap">SIFT Toolbox</h1>
                </div>
                <button onClick={onToggle} className="p-1 rounded-md hover:bg-border text-light">
                    <span className="material-symbols-outlined">
                        {isOpen ? 'chevron_left' : 'chevron_right'}
                    </span>
                </button>
            </div>

            <nav className="flex-grow p-2 space-y-1">
                <SidebarItem 
                    icon="add_box" 
                    label="New Session" 
                    onClick={onNewSession} 
                    collapsed={!isOpen} 
                    active={false} 
                />
                <SidebarItem 
                    icon="settings_input_component" 
                    label="Configuration" 
                    onClick={onOpenConfig} 
                    collapsed={!isOpen} 
                    active={currentView === 'config'} 
                />
                <SidebarItem 
                    icon="chat" 
                    label="Chat Analysis" 
                    onClick={() => {}} 
                    collapsed={!isOpen} 
                    active={currentView === 'chat'} 
                    disabled={currentView !== 'chat'}
                />
                <SidebarItem 
                    icon="info" 
                    label="About SIFT" 
                    onClick={onOpenAbout} 
                    collapsed={!isOpen} 
                    active={currentView === 'about'} 
                />
            </nav>

            <div className="p-2 border-t border-ui space-y-1">
                {isConfigured && (
                    <div className="mb-2">
                        {user ? (
                            <div className={`flex items-center p-3 rounded-lg transition-colors group relative ${isOpen ? 'justify-between' : 'justify-center'}`}>
                                <div className="flex items-center overflow-hidden">
                                    <img src={user.photoURL || ''} alt="Profile" className="w-6 h-6 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
                                    {!isOpen && (
                                        <div className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                                            {user.displayName}
                                        </div>
                                    )}
                                    {isOpen && <span className="ml-3 text-sm text-light truncate">{user.displayName}</span>}
                                </div>
                                {isOpen && (
                                    <button onClick={signOut} className="text-light hover:text-primary-accent" title="Sign Out">
                                        <span className="material-symbols-outlined text-sm">logout</span>
                                    </button>
                                )}
                            </div>
                        ) : (
                            <SidebarItem 
                                icon="login" 
                                label="Sign In" 
                                onClick={signInWithGoogle} 
                                collapsed={!isOpen} 
                                active={false} 
                            />
                        )}
                    </div>
                )}
                <SidebarItem 
                    icon={getThemeIcon()} 
                    label={getThemeLabel()} 
                    onClick={toggleTheme} 
                    collapsed={!isOpen} 
                    active={false}
                />
                <SidebarItem 
                    icon="ios_share" 
                    label="Export Session" 
                    onClick={onOpenExport} 
                    collapsed={!isOpen} 
                    active={false}
                    disabled={currentView !== 'chat'}
                />
                <SidebarItem 
                    icon="settings" 
                    label="Settings" 
                    onClick={onOpenSettings} 
                    collapsed={!isOpen} 
                    active={false} 
                />
            </div>
        </aside>
    );
};

const SidebarItem: React.FC<{ 
    icon: string; 
    label: string; 
    onClick: () => void; 
    collapsed: boolean; 
    active: boolean;
    disabled?: boolean;
}> = ({ icon, label, onClick, collapsed, active, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center p-3 rounded-lg transition-colors group relative
            ${active ? 'bg-primary/20 text-primary-accent font-bold' : 'text-light hover:bg-border hover:text-main'}
            ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        `}
    >
        <span className={`material-symbols-outlined flex-shrink-0 ${active ? 'text-primary-accent' : 'text-light group-hover:text-main'}`}>
            {icon}
        </span>
        {!collapsed && <span className="ml-3 truncate">{label}</span>}
        {collapsed && (
            <div className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                {label}
            </div>
        )}
    </button>
);
