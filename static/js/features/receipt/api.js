import { apiFetch } from '../../api/backend.js';

/**
 * 画像解析APIを呼び出す
 * @param {string} imageBase64 
 * @param {string|number} accountId 
 * @returns {Promise<any>}
 */
export async function parseReceiptImage(imageBase64, accountId) {
    const response = await apiFetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_base64: imageBase64,
            account_id: accountId
        })
    });
    
    if (!response.ok) {
        const errorDetail = await response.text();
        const error = new Error(errorDetail);
        /** @type {any} */ (error).status = response.status;
        throw error;
    }
    return await response.json();
}

/**
 * 登録APIを呼び出す
 * @param {Object} payload 
 * @returns {Promise<any>}
 */
export async function registerReceiptData(payload) {
    const response = await apiFetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const errorDetail = await response.text();
        const error = new Error(errorDetail);
        /** @type {any} */ (error).status = response.status;
        throw error;
    }
    return await response.json();
}
