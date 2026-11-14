import { EL } from '../utils/dom.js';

let showTimeoutId = null;
let hideTimeoutId = null;
let lastClosedAt = 0;

const REOPEN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Open the Service End Notice modal.
 */
export const openServiceEndModal = () => {
    if (!EL.serviceEndModal || !EL.serviceEndModalContent) return;

    if (hideTimeoutId) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
    }
    if (showTimeoutId) {
        clearTimeout(showTimeoutId);
        showTimeoutId = null;
    }

    EL.serviceEndModal.classList.remove('hidden');
    showTimeoutId = setTimeout(() => {
        EL.serviceEndModal.classList.remove('opacity-0');
        EL.serviceEndModal.classList.add('opacity-100');
        EL.serviceEndModalContent.classList.remove('scale-95');
        EL.serviceEndModalContent.classList.add('scale-100');
        showTimeoutId = null;
    }, 10);
};

/**
 * Close the Service End Notice modal.
 */
export const closeServiceEndModal = () => {
    if (!EL.serviceEndModal || !EL.serviceEndModalContent) return;
    if (EL.serviceEndModal.classList.contains('hidden')) return;

    if (showTimeoutId) {
        clearTimeout(showTimeoutId);
        showTimeoutId = null;
    }
    if (hideTimeoutId) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
    }

    EL.serviceEndModal.classList.remove('opacity-100');
    EL.serviceEndModal.classList.add('opacity-0');
    EL.serviceEndModalContent.classList.remove('scale-100');
    EL.serviceEndModalContent.classList.add('scale-95');

    hideTimeoutId = setTimeout(() => {
        EL.serviceEndModal.classList.add('hidden');
        hideTimeoutId = null;
    }, 300);
    lastClosedAt = Date.now();
};

/**
 * Initialize event listeners for the Service End Notice modal and open it on load.
 */
export const initServiceEndModal = () => {
    if (!EL.serviceEndModal) return;

    EL.btnCloseServiceEnd?.addEventListener('click', closeServiceEndModal);
    EL.btnConfirmServiceEnd?.addEventListener('click', closeServiceEndModal);

    // Close when clicking the backdrop outside the modal content
    EL.serviceEndModal.addEventListener('click', (e) => {
        if (e.target === EL.serviceEndModal) {
            closeServiceEndModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !EL.serviceEndModal.classList.contains('hidden')) {
            closeServiceEndModal();
        }
    });

    // Re-open on bfcache restore (e.g. PWA / browser back-forward cache)
    window.addEventListener('pageshow', (e) => {
        if (e.persisted && EL.serviceEndModal.classList.contains('hidden')) {
            openServiceEndModal();
        }
    });

    // Re-open when returning to the PWA after a long background period
    document.addEventListener('visibilitychange', () => {
        if (
            document.visibilityState === 'visible' &&
            EL.serviceEndModal.classList.contains('hidden') &&
            lastClosedAt > 0 &&
            Date.now() - lastClosedAt >= REOPEN_INTERVAL_MS
        ) {
            openServiceEndModal();
        }
    });

    openServiceEndModal();
};
