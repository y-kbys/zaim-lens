import { appState } from '../state.js';
import { getFreshToken } from '../features/auth.js';

/**
 * Wrapper for API fetch calls to easily attach Firebase Auth tokens
 * @param {string} url 
 * @param {RequestInit} options 
 * @param {number} retryCount 
 * @returns {Promise<Response>}
 */
export const apiFetch = async (url, options = {}, retryCount = 0) => {
    if (!appState.idToken) {
        // If we have a user but no token, try to get one once
        if (appState.user && retryCount === 0) {
            await getFreshToken();
        }
        
        if (!appState.idToken) {
            throw new Error("Missing authentication token. Please log in.");
        }
    }

    const headers = options.headers || {};
    options.headers = {
        ...headers,
        'Authorization': `Bearer ${appState.idToken}`
    };

    const response = await fetch(url, options);

    // Check for 401 or "Token expired" in the response
    if (retryCount === 0 && (response.status === 401 || await isTokenExpired(response))) {
        console.warn(`Token expired for ${url}, attempting refresh...`);
        const newToken = await getFreshToken();
        if (newToken) {
            // Update the header and retry once
            options.headers['Authorization'] = `Bearer ${newToken}`;
            return apiFetch(url, options, retryCount + 1);
        }
    }

    return response;
};

/**
 * Helper to check if the response indicates a token expiration
 * @param {Response} response 
 * @returns {Promise<boolean>}
 */
async function isTokenExpired(response) {
    if (response.ok) return false;
    // status 401 is already handled separately, but we check body for "Token expired" as per requirements
    try {
        const clone = response.clone();
        const text = await clone.text();
        return text.toLowerCase().includes('token expired');
    } catch (e) {
        return false;
    }
}
