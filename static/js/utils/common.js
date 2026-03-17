import { appState } from '../state.js';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Returns a key for localStorage, optionally prefixed by user UID.
 * @param {string} key 
 * @param {boolean} isGlobal 
 */
export const getPrefixedKey = (key, isGlobal = false) => {
    if (!isGlobal && appState.user && appState.user.uid) {
        return `user_${appState.user.uid}_${key}`;
    }
    return key;
};
