import { apiFetch } from '../../api/backend.js';

/**
 * Parses receipt image using Gemini backend API.
 * @param {string} imageBase64 - Base64 Data URL or raw base64 string
 * @param {string|number} [accountId] - Target Zaim account ID for context categories
 * @returns {Promise<Object>} Structured receipt data with master categories and genres
 */
export async function parseReceiptImage(imageBase64, accountId) {
    const response = await apiFetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_base64: imageBase64,
            account_id: accountId ? String(accountId) : undefined
        })
    });
    
    if (!response.ok) {
        let message = `解析エラー (${response.status})`;
        try {
            const errJson = await response.json();
            if (errJson && errJson.detail) {
                message = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
            }
        } catch {
            const rawText = await response.text();
            if (rawText) message = rawText;
        }

        const error = new Error(message);
        /** @type {any} */ (error).status = response.status;
        throw error;
    }
    return await response.json();
}

/**
 * Registers structured receipt data to Zaim.
 * @param {Object} payload - RegisterRequest payload conforming to backend schema
 * @returns {Promise<Object>} Registration result or duplicate warning object
 */
export async function registerReceiptData(payload) {
    const response = await apiFetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        let message = `登録エラー (${response.status})`;
        try {
            const errJson = await response.json();
            if (errJson && errJson.detail) {
                message = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
            }
        } catch {
            const rawText = await response.text();
            if (rawText) message = rawText;
        }

        const error = new Error(message);
        /** @type {any} */ (error).status = response.status;
        throw error;
    }
    return await response.json();
}

