/**
 * Pure business logic helpers for receipt handling.
 * These functions have no DOM or browser dependencies, making them fully portable and testable.
 */

/**
 * Determine whether to show the registration completion toast.
 * Returns false when there is only 1 receipt (or empty queue), because the user
 * immediately transitions to the completion screen (state-success), rendering the toast redundant.
 * Returns true when there are multiple receipts in the queue, to provide clear feedback
 * before proceeding to the next receipt.
 *
 * @param {Array<any> | null | undefined} queue
 * @returns {boolean}
 */
export function shouldShowRegistrationToast(queue) {
    return Array.isArray(queue) && queue.length > 1;
}

/**
 * Pure validation logic for receipt edit state.
 * Validates date presence/format and items structure (valid prices and non-empty names).
 *
 * @param {{ date?: string, items?: Array<{ name?: string, price?: number|string, deleted?: boolean }> } | null | undefined} data
 * @returns {{ isValid: boolean, hasDate: boolean, validItemCount: number, invalidItemIndices: number[] }}
 */
export function validateReceiptData(data) {
    if (!data) {
        return { isValid: false, hasDate: false, validItemCount: 0, invalidItemIndices: [] };
    }

    const dateStr = (data.date || '').trim();
    const hasDate = Boolean(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr));

    const items = data.items || [];
    let validItemCount = 0;
    const invalidItemIndices = [];

    items.forEach((item, index) => {
        if (item.deleted) return;

        const name = (item.name || '').trim();
        const rawPrice = item.price;
        const numPrice = Number(rawPrice);
        const isPriceValidInt = rawPrice !== '' && rawPrice !== null && rawPrice !== undefined && Number.isInteger(numPrice);

        if (!name && (numPrice !== 0 || !isPriceValidInt)) {
            invalidItemIndices.push(index);
        } else if (!isPriceValidInt) {
            invalidItemIndices.push(index);
        } else if (name && numPrice !== 0) {
            validItemCount++;
        }
    });

    const isValid = hasDate && validItemCount > 0 && invalidItemIndices.length === 0;

    return {
        isValid,
        hasDate,
        validItemCount,
        invalidItemIndices
    };
}

/**
 * Pure logic to determine if the unlinked Zaim account warning banner should be displayed.
 *
 * @param {{ user?: any, accountsLoaded?: boolean, accounts?: any[] } | null | undefined} state
 * @returns {boolean}
 */
export function isUnlinkedBannerVisible(state) {
    if (!state || !state.user || !state.accountsLoaded) {
        return false;
    }
    return !state.accounts || state.accounts.length === 0;
}

/**
 * Pure logic to determine if the parse button should be enabled.
 * Button is enabled only when there are items in the queue and Zaim account is linked.
 *
 * @param {{ user?: any, accountsLoaded?: boolean, accounts?: any[], queue?: any[] } | null | undefined} state
 * @returns {boolean}
 */
export function isParseButtonEnabled(state) {
    if (!state || !state.queue || state.queue.length === 0) {
        return false;
    }
    const isUnlinked = isUnlinkedBannerVisible(state);
    return !isUnlinked;
}

/**
 * Pure helper function representing the decision logic of advanceQueue completion.
 *
 * @param {number} registeredCount
 * @returns {'state-success' | 'reset-app'}
 */
export function determineQueueCompletionAction(registeredCount) {
    if (registeredCount > 0) {
        return 'state-success';
    }
    return 'reset-app';
}
