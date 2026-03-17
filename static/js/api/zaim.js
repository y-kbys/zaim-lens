import { appState } from '../state.js';
import { EL, showToast } from '../utils/dom.js';
import { apiFetch } from './backend.js';
import { getPrefixedKey } from '../utils/common.js';
import { sendGAEvent } from '../utils/analytics.js';
import { loadDestInternalAccounts, updateDestAccountOptions } from './zaim.js';

/**
 * Ensures Destination account cannot be the same as Source account
 */
export { updateDestAccountOptions };

/**
 * Load internal accounts (payment sources) for the destination account
 */
export { loadDestInternalAccounts };

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

        // --- Restore Source Account Preference ---
        const lastSourceId = localStorage.getItem(getPrefixedKey('lastUsedSourceAccountId'));
        if (lastSourceId && Array.from(EL.sourceAccountSelect.options).some(o => o.value === lastSourceId)) {
            EL.sourceAccountSelect.value = lastSourceId;
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
 * Fetch Zaim internal accounts and categories (generic)
 */
export async function getZaimMasterData(targetAccountId) {
    const [accRes, catRes] = await Promise.all([
        apiFetch(`/api/zaim/accounts?account_id=${targetAccountId}`),
        apiFetch(`/api/zaim/categories?account_id=${targetAccountId}`)
    ]);

    if (!accRes.ok) throw new Error(await accRes.text());
    if (!catRes.ok) throw new Error(await catRes.text());

    return {
        accounts: await accRes.json(),
        masterData: await catRes.json()
    };
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
        if (lastTarget && Array.from(EL.editTargetAccount.options).some(o => o.value === lastTarget)) {
            EL.editTargetAccount.value = lastTarget;
            EL.uploadTargetAccount.value = lastTarget;
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
