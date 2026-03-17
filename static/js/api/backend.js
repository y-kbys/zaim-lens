import { appState } from '../state.js';

/**
 * Wrapper for API fetch calls to easily attach Firebase Auth tokens
 */
export const apiFetch = async (url, options = {}) => {
    if (!appState.idToken) {
        throw new Error("Missing authentication token. Please log in.");
    }

    const headers = options.headers || {};
    options.headers = {
        ...headers,
        'Authorization': `Bearer ${appState.idToken}`
    };

    return fetch(url, options);
};
