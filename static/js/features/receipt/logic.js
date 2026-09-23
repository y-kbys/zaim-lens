/**
 * Pure business logic helpers for receipt handling
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
