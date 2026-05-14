import { appState } from '../state.js';
import { EL, showToast } from '../utils/dom.js';
import { apiFetch } from './backend.js';
import { getPrefixedKey } from '../utils/common.js';
import { sendGAEvent } from '../utils/analytics.js';
/**
 * Ensures Destination account cannot be the same as Source account
 */
export function updateDestAccountOptions() {
    const src = (/** @type {HTMLSelectElement} */ (EL.sourceAccountSelect)).value;
    let firstValidValue = "";

    Array.from((/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).options).forEach(opt => {
        if (opt.value === "") return;

        if (opt.value === src) {
            opt.disabled = true;
        } else {
            opt.disabled = false;
            if (!firstValidValue) firstValidValue = opt.value;
        }
    });

    // If destination is now invalid (same as source), or if it's currently empty, pick the first valid one
    if ((/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).value === src || (/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).value === "") {
        if (firstValidValue) {
            (/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).value = firstValidValue;
            // Trigger loading internal accounts for this new selection
            loadDestInternalAccounts();
        }
    }
}

/**
 * Load internal accounts (payment sources) for the destination account
 */
export async function loadDestInternalAccounts() {
    const destId = (/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).value;
    if (!destId) return;

    try {
        const [accRes, catRes] = await Promise.all([
            apiFetch(`/api/zaim/accounts?account_id=${destId}`),
            apiFetch(`/api/zaim/categories?account_id=${destId}`)
        ]);

        if (!accRes.ok) throw new Error(await accRes.text());
        if (!catRes.ok) throw new Error(await catRes.text());

        const accounts = await accRes.json();
        const masterData = await catRes.json();

        appState.destInternalAccounts = accounts;
        appState.copyMasterData = masterData; // Store master data for copy confirmation

        let optionsHtml = '<option value="">未指定（出金元なし）</option>';
        optionsHtml += '<option value="keep">コピー元の出金元をそのまま使う</option>';
        accounts.forEach(a => {
            optionsHtml += `<option value="${a.id}">${a.name}</option>`;
        });
        EL.destInternalAccountSelect.innerHTML = optionsHtml;

        // Restore last used internal account (payment source) for this destination
        const storageKey = `last_used_payment_source_id_${destId}`;
        const lastUsedId = localStorage.getItem(getPrefixedKey(storageKey));
        if (lastUsedId !== null && Array.from((/** @type {HTMLSelectElement} */ (EL.destInternalAccountSelect)).options).some(o => o.value === lastUsedId)) {
            (/** @type {HTMLSelectElement} */ (EL.destInternalAccountSelect)).value = lastUsedId;
        }
    } catch (err) {
        console.error("Failed to load destination internal accounts/categories", err);
        EL.destInternalAccountSelect.innerHTML = '<option value="">読込失敗</option>';
    }
}

/**
 * Refresh all account-related dropdowns in the app
 */
export async function refreshAllAccountDropdowns() {
    try {
        const response = await apiFetch('/api/zaim/status');
        if (!response.ok) return;
        const data = await response.json();
        appState.accounts = data.accounts || [];

        const options = appState.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        const placeholder = '<option value="" disabled selected>アカウントを選択...</option>';
        const empty = '<option value="">Zaim設定が必要です</option>';

        const html = appState.accounts.length > 0 ? placeholder + options : empty;
        const targetHtml = appState.accounts.length > 0 ? options : empty;

        EL.sourceAccountSelect.innerHTML = html;
        EL.destAccountSelect.innerHTML = html;
        EL.uploadTargetAccount.innerHTML = targetHtml;
        EL.editTargetAccount.innerHTML = targetHtml;

        // Hide skeletons in Copy tab
        if (EL.sourceAccountSkeleton) EL.sourceAccountSkeleton.classList.add('hidden');
        if (EL.sourceAccountSelect) EL.sourceAccountSelect.classList.remove('hidden');
        if (EL.btnFetchHistorySkeleton) EL.btnFetchHistorySkeleton.classList.add('hidden');
        if (EL.btnFetchHistory) EL.btnFetchHistory.classList.remove('hidden');

        // --- Restore Copy Source Account (Profile) ---
        const lastSourceId = localStorage.getItem(getPrefixedKey('last_used_zaim_profile_copy_source'));
        if (lastSourceId && Array.from((/** @type {HTMLSelectElement} */ (EL.sourceAccountSelect)).options).some(o => o.value === lastSourceId)) {
            (/** @type {HTMLSelectElement} */ (EL.sourceAccountSelect)).value = lastSourceId;
        }

        // --- Restore Copy Destination Account (Profile) ---
        const lastDestId = localStorage.getItem(getPrefixedKey('last_used_zaim_profile_copy_dest'));
        if (lastDestId && Array.from((/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).options).some(o => o.value === lastDestId)) {
            (/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).value = lastDestId;
            // Also need to initialize internal accounts for this selection
            loadDestInternalAccounts();
        }

        // --- Handle Initial Destination Selection ---
        updateDestAccountOptions();

        if (sessionStorage.getItem('zaim_auth_pending') === 'true') {
            sendGAEvent('zaim_auth_completed');
            sessionStorage.removeItem('zaim_auth_pending');
        }

        return appState.accounts;
    } catch (err) {
        console.error("Failed to refresh account dropdowns:", err);
    }
}

/**
 * Initial load of accounts
 */
export async function loadAccounts() {
    if (appState.accounts.length > 0) return;
    return await refreshAllAccountDropdowns();
}

/**
 * Fetch Zaim internal accounts and categories (generic) with cache logic
 */
/** @type {Map<string|number, Promise<void>>} */
const backgroundFetchPromises = new Map();

/**
 * @param {string|number|null} targetAccountId
 */
export async function prefetchZaimDataInBackground(targetAccountId = null) {
    if (!targetAccountId) {
        if (appState.accounts && appState.accounts.length > 0) {
            targetAccountId = appState.accounts[0].id;
        } else {
            return Promise.resolve();
        }
    }
    // Check if we need to fetch
    const now = Date.now();
    const expiry = 86400000; // 24 hours
    
    const accountsKey = getPrefixedKey(`zaim_lens_accounts_cache_${targetAccountId}`);
    const categoriesKey = getPrefixedKey(`zaim_lens_categories_cache_${targetAccountId}`);
    
    const accountsCacheStr = localStorage.getItem(accountsKey);
    const categoriesCacheStr = localStorage.getItem(categoriesKey);
    
    let needsFetch = false;
    if (!accountsCacheStr || !categoriesCacheStr) {
        needsFetch = true;
    } else {
        try {
            const accountsCache = JSON.parse(accountsCacheStr);
            const categoriesCache = JSON.parse(categoriesCacheStr);
            
            // Check for structural validity to prevent NaN or broken cache issues
            // Also force re-fetch if genres are empty (which should not happen normally)
            if (!accountsCache || !categoriesCache || 
                typeof accountsCache.timestamp !== 'number' || 
                typeof categoriesCache.timestamp !== 'number' ||
                !accountsCache.data || !categoriesCache.data ||
                !categoriesCache.data.master_genres || 
                categoriesCache.data.master_genres.length === 0) {
                needsFetch = true;
            } else if (now - accountsCache.timestamp > expiry || (now - accountsCache.timestamp < -60000)) {
                // If cache is older than expiry OR more than 1 minute in the future, re-fetch
                needsFetch = true;
            } else if (now - categoriesCache.timestamp > expiry || (now - categoriesCache.timestamp < -60000)) {
                needsFetch = true;
            }
        } catch (e) {
            needsFetch = true;
        }
    }

    if (!needsFetch) {
        return Promise.resolve(); // Cache is valid
    }

    // If already fetching for this specific account, just return the existing promise
    if (backgroundFetchPromises.has(targetAccountId)) {
        return backgroundFetchPromises.get(targetAccountId);
    }

    const fetchPromise = (async () => {
        try {
            const [accRes, catRes] = await Promise.all([
                apiFetch(`/api/zaim/accounts?account_id=${targetAccountId}`),
                apiFetch(`/api/zaim/categories?account_id=${targetAccountId}`)
            ]);

            if (accRes.ok && catRes.ok) {
                const accounts = await accRes.json();
                const masterData = await catRes.json();
                
                const cacheTimestamp = Date.now();
                localStorage.setItem(accountsKey, JSON.stringify({
                    timestamp: cacheTimestamp,
                    data: accounts
                }));
                localStorage.setItem(categoriesKey, JSON.stringify({
                    timestamp: cacheTimestamp,
                    data: masterData
                }));
            }
        } catch (err) {
            console.error("Background pre-fetch failed:", err);
        } finally {
            backgroundFetchPromises.delete(targetAccountId);
        }
    })();

    backgroundFetchPromises.set(targetAccountId, fetchPromise);
    return fetchPromise;
}

/**
 * @param {string|number|null} targetAccountId 
 */
export async function ensureZaimDataAvailable(targetAccountId = null) {
    await prefetchZaimDataInBackground(targetAccountId);
}

/**
 * @param {string|number} targetAccountId 
 */
export async function getZaimMasterData(targetAccountId) {
    // Ensure any background fetch for this specific account has completed
    if (backgroundFetchPromises.has(targetAccountId)) {
        await backgroundFetchPromises.get(targetAccountId);
    }

    // Read from cache synchronously
    const accountsKey = getPrefixedKey(`zaim_lens_accounts_cache_${targetAccountId}`);
    const categoriesKey = getPrefixedKey(`zaim_lens_categories_cache_${targetAccountId}`);

    const accountsCacheStr = localStorage.getItem(accountsKey);
    const categoriesCacheStr = localStorage.getItem(categoriesKey);

    if (accountsCacheStr && categoriesCacheStr) {
        try {
            const accountsObj = JSON.parse(accountsCacheStr);
            const categoriesObj = JSON.parse(categoriesCacheStr);
            
            if (accountsObj && typeof accountsObj.timestamp === 'number' && accountsObj.data &&
                categoriesObj && typeof categoriesObj.timestamp === 'number' && categoriesObj.data &&
                categoriesObj.data.master_genres && categoriesObj.data.master_genres.length > 0) {
                return { accounts: accountsObj.data, masterData: categoriesObj.data };
            }
        } catch (e) {
            console.warn("Failed to parse cache, fetching directly.", e);
        }
    }

    // Fallback if no cache (highly unlikely if ensureZaimDataAvailable is used correctly, but good for safety)
    const [accRes, catRes] = await Promise.all([
        apiFetch(`/api/zaim/accounts?account_id=${targetAccountId}`),
        apiFetch(`/api/zaim/categories?account_id=${targetAccountId}`)
    ]);

    if (!accRes.ok) throw new Error(await accRes.text());
    if (!catRes.ok) throw new Error(await catRes.text());

    const accounts = await accRes.json();
    const masterData = await catRes.json();

    const cacheTimestamp = Date.now();
    
    localStorage.setItem(accountsKey, JSON.stringify({ timestamp: cacheTimestamp, data: accounts }));
    localStorage.setItem(categoriesKey, JSON.stringify({ timestamp: cacheTimestamp, data: masterData }));

    return { accounts, masterData };
}

/**
 * Load target accounts for the receipt parsing screen
 */
export const loadTargetAccounts = async () => {
    try {
        const response = await apiFetch('/api/zaim/status'); // Use status for simple account check
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        const accounts = data.accounts || [];

        if (accounts.length === 0) {
            EL.editTargetAccount.innerHTML = '<option value="">Zaim設定が必要です</option>';
            EL.uploadTargetAccount.innerHTML = '<option value="">Zaim設定が必要です</option>';
            return false;
        }

        let html = '';
        accounts.forEach(a => {
            html += `<option value="${a.id}">${a.name}</option>`;
        });

        EL.editTargetAccount.innerHTML = html;
        EL.uploadTargetAccount.innerHTML = html;
        if (EL.uploadAccountSelectorContainer) EL.uploadAccountSelectorContainer.classList.remove('hidden');

        // Restore Target Account preference
        const lastTarget = localStorage.getItem(getPrefixedKey('lastUsedTargetAccount'));
        if (lastTarget && Array.from((/** @type {HTMLSelectElement} */ (EL.editTargetAccount)).options).some(o => o.value === lastTarget)) {
            (/** @type {HTMLSelectElement} */ (EL.editTargetAccount)).value = lastTarget;
            (/** @type {HTMLSelectElement} */ (EL.uploadTargetAccount)).value = lastTarget;
        }

        // Hide skeletons in Upload tab
        if (EL.uploadTargetAccountSkeleton) EL.uploadTargetAccountSkeleton.classList.add('hidden');
        if (EL.uploadTargetAccount) EL.uploadTargetAccount.classList.remove('hidden');
        if (EL.btnParseSkeleton) EL.btnParseSkeleton.classList.add('hidden');
        if (EL.btnParse) EL.btnParse.classList.remove('hidden');

        return true;
    } catch (err) {
        console.error("Failed to load target accounts", err);
        EL.editTargetAccount.innerHTML = '<option value="">設定エラー</option>';
        EL.uploadTargetAccount.innerHTML = '<option value="">設定エラー</option>';
        throw err;
    }
};
