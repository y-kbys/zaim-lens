import { EL, switchState } from './utils/dom.js';
import { initFirebaseAuth } from './features/auth.js';
import { initSettingsFeatures } from './features/settings.js';
import { initReceiptFeatures } from './features/receipt/index.js';
import { initHistoryFeatures } from './features/history/index.js';
import { loadAccounts, loadTargetAccounts } from './api/zaim.js';
import { loadZaimAccounts } from './features/receipt/ui.js';
import { openZaimSettings, closeSettingsDropdown } from './features/settings.js';
import { appState } from './state.js';

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js')
            .then(reg => console.log('SW registered!', reg))
            .catch(err => console.log('SW registration failed', err));
    });
}

// --- Theme Initialization ---
const initTheme = () => {
    const preferredTheme = localStorage.getItem('theme');
    if (preferredTheme === 'dark' || (!preferredTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    EL.themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        if (document.documentElement.classList.contains('dark')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });
};

// --- Tab Switching ---
const switchTab = (tabId) => {
    if (tabId === 'parse') {
        EL.tabParse.classList.replace('text-gray-500', 'text-blue-600');
        EL.tabParse.classList.replace('dark:text-gray-400', 'dark:text-blue-400');
        EL.tabParse.classList.replace('border-transparent', 'border-blue-600');
        EL.tabParse.classList.replace('dark:hover:border-gray-600', 'dark:border-blue-400');

        EL.tabCopy.classList.replace('text-blue-600', 'text-gray-500');
        EL.tabCopy.classList.replace('dark:text-blue-400', 'dark:text-gray-400');
        EL.tabCopy.classList.replace('border-blue-600', 'border-transparent');
        EL.tabCopy.classList.replace('dark:border-blue-400', 'dark:hover:border-gray-600');

        EL.panelCopy.classList.add('hidden');
        EL.panelParse.classList.remove('hidden');

        if (!EL.stateEdit.classList.contains('hidden')) {
            EL.bottomActionBar.classList.remove('hidden');
        }
    } else {
        EL.tabCopy.classList.replace('text-gray-500', 'text-blue-600');
        EL.tabCopy.classList.replace('dark:text-gray-400', 'dark:text-blue-400');
        EL.tabCopy.classList.replace('border-transparent', 'border-blue-600');
        EL.tabCopy.classList.replace('dark:hover:border-gray-600', 'dark:border-blue-400');

        EL.tabParse.classList.replace('text-blue-600', 'text-gray-500');
        EL.tabParse.classList.replace('dark:text-blue-400', 'dark:text-gray-400');
        EL.tabParse.classList.replace('border-blue-600', 'border-transparent');
        EL.tabParse.classList.replace('dark:border-blue-400', 'dark:hover:border-gray-600');

        EL.panelParse.classList.add('hidden');
        EL.panelCopy.classList.remove('hidden');

        EL.bottomActionBar.classList.add('hidden');

        loadAccounts();
    }
};

// --- Initialization ---
const init = async () => {
    initTheme();
    
    // Attach globals for inline HTML event handlers
    window.switchTab = switchTab;

    // Tab Switching Events
    EL.tabParse.addEventListener('click', () => switchTab('parse'));
    EL.tabCopy.addEventListener('click', () => switchTab('copy'));

    // Feature Event Listeners from features/
    initSettingsFeatures();
    initReceiptFeatures();
    initHistoryFeatures();

    // Firebase Auth (Entry point for app flow)
    await initFirebaseAuth({
        loadAccounts,
        loadTargetAccounts,
        loadZaimAccounts,
        openZaimSettings,
        closeSettingsDropdown
    });

    // Initial State UI update
    switchState('state-upload');
};

// Start the app
document.addEventListener('DOMContentLoaded', init);
