import { apiFetch } from '../../api/backend.js';

/**
 * Zaim履歴を取得する
 * @param {string} accountId
 * @param {{ startDate?: string, endDate?: string, period?: number }} params
 * @returns {Promise<any>}
 */
export async function fetchHistory(accountId, { startDate, endDate, period } = {}) {
    let url = `/api/history?account_id=${accountId}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    } else {
        url += `&period=${period ?? 0}`;
    }
    const response = await apiFetch(url);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

/**
 * 選択した履歴を別アカウントにコピーする
 * @param {object} payload
 * @returns {Promise<any>}
 */
export async function executeCopy(payload) {
    const response = await apiFetch('/api/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}
