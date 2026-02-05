
import React from 'react';
import { SIFT_ICON } from '../constants.ts';

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
