import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Store application state
let appState = {
    compressedImageBase64: null, // Holds the resized image to prevent double upload
    parsedData: null,
    accounts: [], // Store available Zaim accounts
    fetchedHistory: [], // Store fetched history items
    selectedHistoryIds: new Set(), // Track selected item IDs based on index
    currentImageUri: null, // Holds the Blob URI for the original image
    lastDeleted: null, // Holds { item, index } for Undo
    deletionTimer: null, // Timer for actual removal

    // --- Batch Queue ---
    queue: [], // Array of { file, status: 'idle'|'parsing'|'complete'|'error', result: null, blobUri: null, compressedBase64: null }
    currentQueueIndex: -1, // -1 means no batch processing active
    isParsingLoopRunning: false, // Concurrency guard

    // --- Auth & Multi-User ---
    user: null,
    idToken: null,
    editingAccountId: null, // null means creating a new record
    lastReceiptId: 0,
};

/**
 * Helper to send GA4 custom events safely
 */
const sendGAEvent = (eventName, params = {}) => {
    if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params);
    }
};

const EL = {
    tabParse: document.getElementById('tab-parse'),
    tabCopy: document.getElementById('tab-copy'),
    panelParse: document.getElementById('panel-parse'),
    panelCopy: document.getElementById('panel-copy'),

    stateUpload: document.getElementById('state-upload'),
    stateEdit: document.getElementById('state-edit'),
    stateSuccess: document.getElementById('state-success'),
    bottomActionBar: document.getElementById('bottom-action-bar'),
    themeToggle: document.getElementById('theme-toggle'),

    // Upload State
    imageUpload: document.getElementById('image-upload'),
    imagePreview: document.getElementById('image-preview'),
    imagePreviewContainer: document.getElementById('image-preview-container'),
    btnParse: document.getElementById('btn-parse'),
    btnManualEntry: document.getElementById('btn-manual-entry'),
    uploadTargetAccount: document.getElementById('upload-target-account'),
    uploadAccountSelectorContainer: document.getElementById('upload-account-selector-container'),
    uploadTargetAccountSkeleton: document.getElementById('upload-target-account-skeleton'),
    btnParseSkeleton: document.getElementById('btn-parse-skeleton'),
    btnCamera: document.getElementById('btn-camera'),
    cameraCapture: document.getElementById('camera-capture'),

    // Edit State
    editDate: document.getElementById('edit-date'),
    editStore: document.getElementById('edit-store'),
    itemsContainer: document.getElementById('items-container'),
    btnAddItem: document.getElementById('btn-add-item'),
    totalAmount: document.getElementById('total-amount'),
    btnRegister: document.getElementById('btn-register'),
    btnSkip: document.getElementById('btn-skip'),
    btnRegisterCount: document.getElementById('btn-register-count'),
    editTargetAccount: document.getElementById('edit-target-account'),
    editFromAccount: document.getElementById('edit-from-account'),
    receiptThumbnail: document.getElementById('receipt-thumbnail'),
    receiptThumbnailContainer: document.getElementById('receipt-thumbnail-container'),

    // Success State
    btnReset: document.getElementById('btn-reset'),
    successReceiptId: document.getElementById('success-receipt-id'),
    successReceiptIdContainer: document.getElementById('success-receipt-id-container'),
    editReceiptId: document.getElementById('edit-receipt-id'),

    // Loading overlay
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),

    // --- History Copy Elements ---
    copyStepConfig: document.getElementById('copy-step-config'),
    copyStepList: document.getElementById('copy-step-list'),
    copyStepDest: document.getElementById('copy-step-dest'),
    copyStepSuccess: document.getElementById('copy-step-success'),

    sourceAccountSelect: document.getElementById('source-account-select'),
    destAccountSelect: document.getElementById('dest-account-select'),
    destInternalAccountSelect: document.getElementById('dest-internal-account-select'),
    historyPeriodSelect: document.getElementById('history-period-select'),
    periodMonthInputContainer: document.getElementById('period-month-input-container'),
    periodMonthInput: document.getElementById('period-month-input'),
    periodCustomInputContainer: document.getElementById('period-custom-input-container'),
    periodStartInput: document.getElementById('period-start-input'),
    periodEndInput: document.getElementById('period-end-input'),
    sourceAccountSkeleton: document.getElementById('source-account-skeleton'),
    btnFetchHistorySkeleton: document.getElementById('btn-fetch-history-skeleton'),
    btnFetchHistory: document.getElementById('btn-fetch-history'),
    historyListContainer: document.getElementById('history-list-container'),
    btnSelectAll: document.getElementById('btn-select-all'),
    btnPrepareCopy: document.getElementById('btn-prepare-copy'),
    selectedCopyCount: document.getElementById('selected-copy-count'),
    btnResetCopy: document.getElementById('btn-reset-copy'),

    copyConfirmModal: document.getElementById('copy-confirm-modal'),
    copyConfirmModalContent: document.getElementById('copy-confirm-modal-content'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    splashScreen: document.getElementById('splash-screen'),
    confirmDestName: document.getElementById('confirm-dest-name'),
    confirmListContainer: document.getElementById('confirm-list-container'),
    btnExecuteCopy: document.getElementById('btn-execute-copy'),

    // Lightbox
    lightboxModal: document.getElementById('lightbox-modal'),
    lightboxImage: document.getElementById('lightbox-image'),
    lightboxClose: document.getElementById('lightbox-close'),

    // Snackbar
    snackbar: document.getElementById('snackbar'),
    btnUndo: document.getElementById('btn-undo'),

    // Batch Progress
    batchProgressContainer: document.getElementById('batch-progress-container'),
    batchProgressText: document.getElementById('batch-progress-text'),
    batchStatusParsing: document.getElementById('batch-status-parsing'),
    batchStatusComplete: document.getElementById('batch-status-complete'),

    // Toast
    toastContainer: document.getElementById('toast-container'),

    // Confirm Modal
    confirmModal: document.getElementById('confirm-modal'),
    confirmModalContent: document.getElementById('confirm-modal-content'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmBtnOk: document.getElementById('confirm-btn-ok'),
    confirmBtnCancel: document.getElementById('confirm-btn-cancel'),

    // --- Auth & Settings ---
    loginOverlay: document.getElementById('login-overlay'),
    btnGoogleLogin: document.getElementById('btn-google-login'),
    userProfile: document.getElementById('user-profile'),
    userAvatar: document.getElementById('user-avatar'),
    btnUserAvatar: document.getElementById('btn-user-avatar'),
    avatarDropdown: document.getElementById('avatar-dropdown'),
    menuItemLogout: document.getElementById('menu-item-logout'),
    menuItemDeleteAccount: document.getElementById('menu-item-delete-account'),

    btnZaimSettings: document.getElementById('btn-zaim-settings'),
    settingsDropdown: document.getElementById('settings-dropdown'),
    menuItemZaimCreds: document.getElementById('menu-item-zaim-creds'),

    // Zaim Creds Modal
    zaimCredsModal: document.getElementById('zaim-creds-modal'),
    btnCloseCreds: document.getElementById('btn-close-creds'),
    zaimAccountName: document.getElementById('zaim-account-name'),
    btnZaimConnect: document.getElementById('btn-zaim-connect'),

    // Gemini Creds Modal
    menuItemGeminiCreds: document.getElementById('menu-item-gemini-creds'),
    geminiCredsModal: document.getElementById('gemini-creds-modal'),
    btnCloseGeminiCreds: document.getElementById('btn-close-gemini-creds'),
    btnSaveGeminiCreds: document.getElementById('btn-save-gemini-creds'),
    btnDeleteGeminiCreds: document.getElementById('btn-delete-gemini-creds'),
    btnCancelGeminiCreds: document.getElementById('btn-cancel-gemini-creds'),
    geminiApiKey: document.getElementById('gemini-api-key'),
    geminiKeyStatus: document.getElementById('gemini-key-status'),

    // Multi-Account elements
    zaimAccountsList: document.getElementById('zaim-accounts-list'),
    btnAddNewAccount: document.getElementById('btn-add-new-account'),
    btnDeleteCreds: document.getElementById('btn-delete-creds'),
    btnCancelCreds: document.getElementById('btn-cancel-creds'),
    zaimFormContainer: document.getElementById('zaim-form-container'),
    zaimButtonsContainer: document.getElementById('zaim-buttons-container'),
    btnCopyGuideZaim: document.getElementById('btn-copy-guide-zaim'),
    btnCopyGuideGemini: document.getElementById('btn-copy-guide-gemini'),
    btnBulkMenu: document.getElementById('btn-bulk-menu'),
    bulkMenuDropdown: document.getElementById('bulk-menu-dropdown'),
    bulkMenuCategories: document.getElementById('bulk-menu-categories'),
    bulkMenuGenres: document.getElementById('bulk-menu-genres'),
};

/**
 * Wrapper for API fetch calls to easily attach Firebase Auth tokens
 */
const apiFetch = async (url, options = {}) => {
    if (!appState.idToken) {
        throw new Error("Missing authentication token. Please log in.");
    }

    const headers = options.headers || {};
    options.headers = {
        ...headers,
        'Authorization': `Bearer ${appState.idToken}`
    };

    return fetch(url, options);
};

/**
 * Modern Custom Promise-based Confirm Dialog
 * @param {string} title 
 * @param {string} message 
 * @returns {Promise<boolean>}
 */
const showConfirm = (title, message) => {
    return new Promise((resolve) => {
        EL.confirmTitle.textContent = title;
        EL.confirmMessage.innerHTML = message.replace(/\n/g, '<br>');

        EL.confirmModal.classList.remove('hidden');
        // Trigger show animation
        setTimeout(() => {
            EL.confirmModal.classList.add('show');
        }, 10);

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const onBgClick = (e) => {
            if (e.target === EL.confirmModal) onCancel();
        };

        const cleanup = () => {
            EL.confirmBtnOk.removeEventListener('click', onOk);
            EL.confirmBtnCancel.removeEventListener('click', onCancel);
            EL.confirmModal.removeEventListener('click', onBgClick);

            EL.confirmModal.classList.remove('show');
            setTimeout(() => {
                EL.confirmModal.classList.add('hidden');
            }, 300);
        };

        EL.confirmBtnOk.addEventListener('click', onOk);
        EL.confirmBtnCancel.addEventListener('click', onCancel);
        EL.confirmModal.addEventListener('click', onBgClick);
    });
};

/**
 * Modern Custom Toast Notification
 * @param {string} message 
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - ms to show
 */
const showToast = (message, type = 'info', duration = 4000) => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'circle-exclamation';
    if (type === 'warning') icon = 'triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${message}</span>`;

    const container = document.getElementById('toast-container');
    container.appendChild(toast);

    // Trigger entrance animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-remove
    setTimeout(() => {
        toast.classList.replace('show', 'hide');
        setTimeout(() => toast.remove(), 400);
    }, duration);
};

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js')
            .then(reg => console.log('SW registered!', reg))
            .catch(err => console.log('SW registration failed', err));
    });
}

// --- Theme Initialization ---
const preferredTheme = localStorage.getItem('theme');
if (preferredTheme === 'dark' || (!preferredTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

EL.themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    if (document.documentElement.classList.contains('dark')) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
});

// --- Utility Functions ---
function showLoading(text) {
    EL.loadingText.textContent = text;
    EL.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    EL.loadingOverlay.classList.add('hidden');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Returns a key for localStorage, optionally prefixed by user UID.
 * @param {string} key 
 * @param {boolean} isGlobal 
 */
function getPrefixedKey(key, isGlobal = false) {
    if (!isGlobal && appState.user && appState.user.uid) {
        return `user_${appState.user.uid}_${key}`;
    }
    return key;
}

function switchState(stateId) {
    EL.stateUpload.classList.add('hidden');
    EL.stateEdit.classList.add('hidden');
    EL.stateSuccess.classList.add('hidden');
    EL.bottomActionBar.classList.add('hidden');

    document.getElementById(stateId).classList.remove('hidden');
    if (stateId === 'state-edit') {
        EL.bottomActionBar.classList.remove('hidden');

        // Update Skip button label based on queue length
        if (appState.queue.length <= 1) {
            EL.btnSkip.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i>キャンセル';
        } else {
            EL.btnSkip.innerHTML = '<i class="fa-solid fa-forward-step mr-1"></i>スキップ';
        }
    }
}

function switchTab(tabId) {
    if (tabId === 'parse') {
        EL.tabParse.classList.replace('text-gray-500', 'text-blue-600');
        EL.tabParse.classList.replace('dark:text-gray-400', 'dark:text-blue-400');
        EL.tabParse.classList.replace('border-transparent', 'border-blue-600');
        EL.tabParse.classList.replace('dark:hover:border-gray-600', 'dark:border-blue-400');

        EL.tabCopy.classList.replace('text-blue-600', 'text-gray-500');
        EL.tabCopy.classList.replace('dark:text-blue-400', 'dark:text-gray-400');
        EL.tabCopy.classList.replace('border-blue-600', 'border-transparent');
        EL.tabCopy.classList.replace('dark:border-blue-400', 'dark:hover:border-gray-600');

        EL.panelCopy.classList.add('hidden');
        EL.panelParse.classList.remove('hidden');

        // Restore bottom bar if we were in editing state
        if (!EL.stateEdit.classList.contains('hidden')) {
            EL.bottomActionBar.classList.remove('hidden');
        }
    } else {
        EL.tabCopy.classList.replace('text-gray-500', 'text-blue-600');
        EL.tabCopy.classList.replace('dark:text-gray-400', 'dark:text-blue-400');
        EL.tabCopy.classList.replace('border-transparent', 'border-blue-600');
        EL.tabCopy.classList.replace('dark:hover:border-gray-600', 'dark:border-blue-400');

        EL.tabParse.classList.replace('text-blue-600', 'text-gray-500');
        EL.tabParse.classList.replace('dark:text-blue-400', 'dark:text-gray-400');
        EL.tabParse.classList.replace('border-blue-600', 'border-transparent');
        EL.tabParse.classList.replace('dark:border-blue-400', 'dark:hover:border-gray-600');

        EL.panelParse.classList.add('hidden');
        EL.panelCopy.classList.remove('hidden');

        // Hide parser's bottom bar when switching to copy tab
        EL.bottomActionBar.classList.add('hidden');

        loadAccounts();
    }
}

EL.tabParse.addEventListener('click', () => switchTab('parse'));
EL.tabCopy.addEventListener('click', () => switchTab('copy'));

// --- Image Compression & Resizing ---
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;
        img.onload = () => {
            // Clean up the object URL as soon as the image is loaded into the Image object
            URL.revokeObjectURL(objectUrl);

            const MAX_WIDTH = 1024;
            const MAX_HEIGHT = 1024;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress as JPEG
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(dataUrl);
        };
        img.onerror = error => {
            URL.revokeObjectURL(objectUrl);
            reject(error);
        };
    });
}

// --- Event Listeners ---

// 1. Image Upload Selection
const handleImageFiles = async (files) => {
    if (files.length === 0) return;

    // Reset Queue
    appState.queue = files.map(file => ({
        file,
        status: 'idle',
        result: null,
        blobUri: URL.createObjectURL(file),
        compressedBase64: null
    }));
    appState.currentQueueIndex = 0;

    // Show preview of the first image
    appState.currentImageUri = appState.queue[0].blobUri;
    EL.imagePreview.src = appState.currentImageUri;
    EL.imagePreviewContainer.classList.remove('hidden');
    EL.btnParse.classList.remove('hidden');
    EL.btnParse.disabled = true;

    // Update Progress UI
    updateBatchProgressUI();

    try {
        showLoading('画像を最適化中...');
        // Pre-compress the first image immediately to enable the "Start" button quickly
        appState.queue[0].compressedBase64 = await compressImage(appState.queue[0].file);
        appState.compressedImageBase64 = appState.queue[0].compressedBase64;
        EL.btnParse.disabled = false;
        hideLoading();

        // Optionally pre-compress others in background
        (async () => {
            for (let i = 1; i < appState.queue.length; i++) {
                if (!appState.queue[i].compressedBase64) {
                    appState.queue[i].compressedBase64 = await compressImage(appState.queue[i].file);
                }
            }
        })();
    } catch (err) {
        hideLoading();
        showToast("画像の処理に失敗しました。", 'error');
        console.error(err);
    }
};

EL.imageUpload.addEventListener('change', async (e) => {
    await handleImageFiles(Array.from(e.target.files));
});

// Direct Camera Capture
EL.btnCamera.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    EL.cameraCapture.click();
});

EL.cameraCapture.addEventListener('change', async (e) => {
    await handleImageFiles(Array.from(e.target.files));
});

function updateBatchProgressUI() {
    if (appState.currentQueueIndex === -1 || appState.queue.length <= 1) {
        EL.batchProgressContainer.classList.add('hidden');
        return;
    }

    EL.batchProgressContainer.classList.remove('hidden');

    // Check if we are still in upload state or if analysis hasn't started
    const isAnalyzing = appState.queue.some(item => item.status !== 'idle');
    if (!isAnalyzing && !EL.stateUpload.classList.contains('hidden')) {
        EL.batchProgressText.textContent = `${appState.queue.length} 枚選択中`;
        EL.batchStatusParsing.classList.add('hidden');
        EL.batchStatusComplete.classList.add('hidden');
        return;
    }

    EL.batchProgressText.textContent = `${appState.currentQueueIndex + 1} / ${appState.queue.length} 枚目`;

    // Check if next items are still parsing
    const hasParsing = appState.queue.some(item => item.status === 'parsing');
    if (hasParsing) {
        EL.batchStatusParsing.classList.remove('hidden');
        EL.batchStatusComplete.classList.add('hidden');
    } else {
        EL.batchStatusParsing.classList.add('hidden');
        const allDone = appState.queue.every((item, idx) => idx <= appState.currentQueueIndex || item.status === 'complete' || item.status === 'error');
        if (allDone) {
            EL.batchStatusComplete.classList.remove('hidden');
        } else {
            EL.batchStatusComplete.classList.add('hidden');
        }
    }
}

async function startBackgroundParsing() {
    if (appState.isParsingLoopRunning) return;
    appState.isParsingLoopRunning = true;

    // Sequential background parsing for all items in the queue
    for (let i = 0; i < appState.queue.length; i++) {
        const item = appState.queue[i];
        if (item.status !== 'idle') continue;

        item.status = 'parsing';
        updateBatchProgressUI();

        try {
            // Ensure compressed base64 is ready
            if (!item.compressedBase64) {
                item.compressedBase64 = await compressImage(item.file);
            }

            const targetAccountId = EL.uploadTargetAccount.value;
            const response = await apiFetch('/api/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: item.compressedBase64,
                    account_id: targetAccountId
                })
            });

            if (!response.ok) {
                const errorDetail = await response.text();
                // Check if it's a rate limit error (429)
                if (response.status === 429) {
                    showToast(errorDetail || "Geminiのレートリミットに達しました。時間を置いてから再度お試しください。", 'warning');
                    resetApp();
                    return; // Stop processing the queue
                } else if (response.status === 400 && errorDetail.includes("API Key is not configured")) {
                    showToast("Gemini APIキーが設定されていません。設定画面を開きます。", 'warning');
                    resetApp();
                    openGeminiSettings();
                    return;
                }
                throw new Error(errorDetail);
            }
            item.result = await response.json();

            // Convert point_usage to a negative item to maintain the "registration as negative expense" flow
            if (item.result.point_usage > 0) {
                item.result.items.push({
                    name: "ポイント利用",
                    price: -item.result.point_usage,
                    category_id: item.result.items.length > 0 ? item.result.items[0].category_id : 101,
                    genre_id: item.result.items.length > 0 ? item.result.items[0].genre_id : 10101
                });
                item.result.point_usage = 0; // Clear it so it's not double-counted by backend
            }

            item.status = 'complete';
        } catch (err) {
            console.error(`Failed to parse item ${i}:`, err);
            item.status = 'error';
            item.result = { error: err.message };

            // If this was the current item and we were waiting for it, show error and return to top
            if (i === appState.currentQueueIndex && !EL.loadingOverlay.classList.contains('hidden')) {
                hideLoading();
                showToast("解析に失敗しました。時間をおいてから再度お試しください。\n詳細: " + (err.message || "不明なエラー"), 'error');
                resetApp();
                return; // Stop processing the queue and return to top
            }
        }

        updateBatchProgressUI();

        // If this was the current item and we were waiting for it, we might need to refresh
        if (i === appState.currentQueueIndex && !EL.loadingOverlay.classList.contains('hidden')) {
            hideLoading();
            setupEditState(item.result);
        }

        // Add a small delay (1s) between requests to avoid burst rate limits
        if (i < appState.queue.length - 1) {
            await sleep(1000);
        }
    }
    appState.isParsingLoopRunning = false;
}

function advanceQueue() {
    appState.currentQueueIndex++;

    if (appState.currentQueueIndex >= appState.queue.length) {
        // All items done!
        appState.currentQueueIndex = -1;
        appState.queue = [];
        updateBatchProgressUI();
        switchState('state-success');
        return;
    }

    const nextItem = appState.queue[appState.currentQueueIndex];
    updateBatchProgressUI();

    // Update main state for the next item
    appState.currentImageUri = nextItem.blobUri;

    // UI selection sync
    EL.imagePreview.src = appState.currentImageUri;

    if (nextItem.status === 'complete') {
        setupEditState(nextItem.result);
    } else if (nextItem.status === 'error') {
        showToast("この画像の解析に失敗していました。スキップするか、撮り直してください。", 'warning');
        setupEditState({ date: "", store: "", items: [] }); // Empty state
    } else {
        // Still parsing or idle
        showLoading("解析結果を待機中...");
    }
}

function setupEditState(data) {
    // Generate/Reuse strictly increasing receipt_id for this entry
    if (!data.receipt_id) {
        const now = Math.floor(Date.now() / 1000);
        data.receipt_id = Math.max(now, appState.lastReceiptId + 1);
        appState.lastReceiptId = data.receipt_id;
    }
    appState.parsedData = data;
    EL.editReceiptId.textContent = `ID: ${data.receipt_id}`;

    // Sync with currently selected account's categories (Reuse existing logic)
    loadZaimAccounts();
    // renderItemsList is called inside loadZaimAccounts

    EL.editDate.value = data.date || "";
    EL.editStore.value = data.store || "";

    // --- Robust Thumbnail Rendering Synchronization ---
    if (appState.currentImageUri) {
        EL.receiptThumbnailContainer.classList.remove('hidden');
        EL.receiptThumbnailContainer.classList.add('thumbnail-loading');
        EL.receiptThumbnail.classList.add('opacity-0');

        const setImage = () => {
            EL.receiptThumbnail.onload = () => {
                EL.receiptThumbnailContainer.classList.remove('thumbnail-loading');
                EL.receiptThumbnail.classList.remove('opacity-0');
            };
            EL.receiptThumbnail.src = appState.currentImageUri;
        };

        // Use requestAnimationFrame to ensure the DOM state-edit is visible and painted
        requestAnimationFrame(() => {
            setTimeout(setImage, 50); // Small delay to ensure container is fully laid out
        });
    } else {
        EL.receiptThumbnailContainer.classList.add('hidden');
    }

    switchState('state-edit');
}

// 2. Parse Trigger
EL.btnParse.addEventListener('click', async () => {
    if (appState.currentQueueIndex === -1) return;

    // Start background parsing for all items in the queue
    startBackgroundParsing();
    sendGAEvent('execute_receipt_analysis');

    // If the first item is already parsed (shouldn't happen yet normally), setupEditState
    const currentItem = appState.queue[appState.currentQueueIndex];
    if (currentItem.status === 'complete') {
        setupEditState(currentItem.result);
    } else {
        showLoading('AIでレシートを解析中...');
    }
});

// 3. Render Edit Form
function renderEditForm() {
    EL.editDate.value = appState.parsedData.date || '';
    EL.editStore.value = appState.parsedData.store || '';

    if (appState.currentImageUri) {
        EL.receiptThumbnail.src = appState.currentImageUri;
    }

    loadZaimAccounts();
    renderItemsList();
}

// 4. Manual Entry Trigger
EL.btnManualEntry.addEventListener('click', () => {
    appState.currentImageUri = null; // No image for manual entry
    EL.receiptThumbnail.src = "";
    EL.receiptThumbnailContainer.classList.add('hidden'); // Hide the thumbnail container if no image

    const today = new Date().toISOString().split('T')[0];
    const initialData = {
        date: today,
        store: "",
        items: [
            { name: "", price: 0, category_id: 199, genre_id: 19905, deleted: false }
        ],
        master_categories: [], // Will be filled by loadZaimAccounts
        master_genres: []
    };

    setupEditState(initialData);
});

async function loadZaimAccounts() {
    try {
        const targetAccountId = EL.editTargetAccount.value || "1";

        // Fetch both accounts (payment sources) and categories/genres for this account
        const [accRes, catRes] = await Promise.all([
            apiFetch(`/api/zaim/accounts?account_id=${targetAccountId}`),
            apiFetch(`/api/zaim/categories?account_id=${targetAccountId}`)
        ]);

        if (!accRes.ok) throw new Error(await accRes.text());
        if (!catRes.ok) throw new Error(await catRes.text());

        const accounts = await accRes.json();
        const masterData = await catRes.json();

        // Update Payment Source dropdown
        let optionsHtml = '<option value="">未指定（出金元なし）</option>';
        accounts.forEach(a => {
            optionsHtml += `<option value="${a.id}">${a.name}</option>`;
        });
        EL.editFromAccount.innerHTML = optionsHtml;

        // Update appState with new master data for the receipt parser screen
        if (appState.parsedData) {
            appState.parsedData.master_categories = masterData.master_categories;
            appState.parsedData.master_genres = masterData.master_genres;

            // Fallback logic for categories and genres to prevent UI from freezing
            appState.parsedData.items.forEach(item => {
                if (item.deleted) return;

                // 1. Category check: If not in new account, fallback to "Others" (199)
                const catExists = masterData.master_categories.some(c => c.id == item.category_id);
                if (!catExists) {
                    item.category_id = 199;
                }

                // 2. Genre check: If not valid in new account's category, apply fallback rules
                const isGenreValid = masterData.master_genres.some(g => g.id == item.genre_id && g.category_id == item.category_id);
                if (!isGenreValid) {
                    const genre99 = item.category_id * 100 + 99; // e.g. 101 -> 10199
                    const hasGenre99 = masterData.master_genres.some(g => g.id == genre99 && g.category_id == item.category_id);
                    const has19905 = masterData.master_genres.some(g => g.id == 19905 && g.category_id == 199);

                    if (item.category_id == 199 && has19905) {
                        // Prioritize 19905 (Unclassified) for category 199
                        item.genre_id = 19905;
                    } else if (hasGenre99) {
                        // Prefer "Others" (+99) for other categories
                        item.genre_id = genre99;
                    } else {
                        // Pick the first available genre in the category
                        const firstGenre = masterData.master_genres.find(g => g.category_id == item.category_id);
                        if (firstGenre) {
                            item.genre_id = firstGenre.id;
                        }
                    }
                }
            });

            // Re-render items list to update category/genre dropdown options
            renderItemsList();

            // Update bulk menu categories
            renderBulkMenuCategories(masterData.master_categories);
        }

        // Restore last used interior account for THIS target account
        const storageKey = `lastUsedAccountId_${targetAccountId}`;
        const lastUsedId = localStorage.getItem(getPrefixedKey(storageKey));
        if (lastUsedId !== null) {
            const exists = Array.from(EL.editFromAccount.options).some(opt => opt.value === lastUsedId);
            if (exists) {
                EL.editFromAccount.value = lastUsedId;
            } else {
                EL.editFromAccount.value = "";
            }
        } else {
            EL.editFromAccount.value = "";
        }
    } catch (err) {
        console.error("Failed to load Zaim accounts/categories", err);
        EL.editFromAccount.innerHTML = '<option value="">読込失敗</option>';
        throw err; // Re-throw to allow parent handlers to detect failure
    }
}

/**
 * カテゴリのHTMLオプションを生成する
 * @param {Array} masterCategories 
 * @param {number|string} selectedId 
 */
function generateCategoryOptions(masterCategories, selectedId) {
    if (!masterCategories) return '';
    return masterCategories.map(c =>
        `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${c.name}</option>`
    ).join('');
}

/**
 * ジャンルのHTMLオプションを生成する
 * @param {Array} masterGenres 
 * @param {number|string} catId 
 * @param {number|string} selectedId 
 */
function generateGenreOptions(masterGenres, catId, selectedId) {
    if (!masterGenres) return '';
    return masterGenres
        .filter(g => g.category_id == catId)
        .map(g =>
            `<option value="${g.id}" ${g.id == selectedId ? 'selected' : ''}>${g.name}</option>`
        ).join('');
}

function renderItemsList() {
    EL.itemsContainer.innerHTML = '';
    let total = 0;
    let visibleCount = 0;

    appState.parsedData.items.forEach((item, index) => {
        if (item.deleted) return;
        total += item.price;
        visibleCount++;

        const itemRow = document.createElement('div');
        itemRow.className = "flex flex-col space-y-2 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 shadow-sm transition-colors";
        itemRow.innerHTML = `
            <div class="flex items-center space-x-2">
                <button class="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" onclick="removeItem(${index})">
                    <i class="fa-solid fa-trash"></i>
                </button>
                <input type="text" class="flex-grow min-w-0 p-2 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent dark:text-gray-100 transition-colors" value="${item.name}" onfocus="this.select()" onchange="updateItemName(${index}, this.value)">
                <div class="relative flex-shrink-0 transition-all duration-200" style="width: calc(${Math.max(3, String(item.price).length)}ch + 2.5rem);">
                    <span class="absolute left-2 top-2 ${item.price < 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'} text-sm">¥</span>
                    <input type="number" class="w-full p-2 pl-6 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-right bg-transparent ${item.price < 0 ? 'text-red-600 dark:text-red-400' : 'dark:text-gray-100'} transition-colors" value="${item.price}" onfocus="this.select()" oninput="this.parentElement.style.width = 'calc(' + Math.max(3, this.value.length) + 'ch + 2.5rem)';" onchange="updateItemPrice(${index}, this.value)">
                </div>
            </div>
            <div class="flex items-center space-x-2 pl-10">
                <select class="flex-grow text-sm p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors" onchange="updateItemCategory(${index}, this.value)" id="cat-sel-${index}">
                    ${generateCategoryOptions(appState.parsedData.master_categories, item.category_id)}
                </select>
                <select class="flex-grow text-sm p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors" onchange="updateItemGenre(${index}, this.value)" id="gen-sel-${index}">
                    ${generateGenreOptions(appState.parsedData.master_genres, item.category_id, item.genre_id)}
                </select>
            </div>
        `;
        EL.itemsContainer.appendChild(itemRow);
    });

    EL.totalAmount.textContent = `¥${total.toLocaleString()}`;
    EL.btnRegisterCount.textContent = visibleCount;
}

// Global functions for inline evens
window.removeItem = (index) => {
    // Clear existing timer if any
    if (appState.deletionTimer) {
        clearTimeout(appState.deletionTimer);
        // We don't need to finish previous deletion here because we'll just overwrite it
    }

    // Capture state for Undo
    appState.lastDeleted = {
        item: appState.parsedData.items[index],
        index: index
    };

    // Logical delete
    appState.parsedData.items[index].deleted = true;
    renderItemsList();

    // Show Snackbar
    EL.snackbar.classList.remove('hidden');
    EL.snackbar.classList.add('show');
    EL.snackbar.classList.remove('snackbar-fade-out');

    // Set auto-hide timer
    appState.deletionTimer = setTimeout(() => {
        finalizeDeletion();
    }, 5000);
};

const finalizeDeletion = () => {
    EL.snackbar.classList.add('snackbar-fade-out');
    setTimeout(() => {
        EL.snackbar.classList.remove('show');
        EL.snackbar.classList.add('hidden');
        // We don't strictly need to splice here as we filter on registration, 
        // but cleaning up helps keep the array size sane if many deletes happen.
        // However, splicing here would shift indices of any subsequent deletes.
        // Better to just leave it as is and purge on register or when the app is reset.
    }, 300);
    appState.deletionTimer = null;
    appState.lastDeleted = null;
};

const undoDeletion = () => {
    if (!appState.lastDeleted) return;

    if (appState.deletionTimer) {
        clearTimeout(appState.deletionTimer);
        appState.deletionTimer = null;
    }

    const { index } = appState.lastDeleted;
    delete appState.parsedData.items[index].deleted;

    appState.lastDeleted = null;
    renderItemsList();

    EL.snackbar.classList.remove('show');
    EL.snackbar.classList.add('hidden');
};

EL.btnUndo.addEventListener('click', undoDeletion);

window.updateItemName = (index, name) => {
    appState.parsedData.items[index].name = name;
};

window.updateItemPrice = (index, price) => {
    appState.parsedData.items[index].price = parseInt(price) || 0;
    renderItemsList(); // Re-calc total
};

window.updateItemCategory = (index, catIdStr) => {
    const catId = parseInt(catIdStr);
    appState.parsedData.items[index].category_id = catId;

    const genres = appState.parsedData.master_genres ? appState.parsedData.master_genres.filter(g => g.category_id == catId) : [];
    const genId = genres.length > 0 ? genres[0].id : 0;
    appState.parsedData.items[index].genre_id = genId;

    renderItemsList();
};

window.updateItemGenre = (index, genreId) => {
    appState.parsedData.items[index].genre_id = parseInt(genreId);
};

// 5. Bulk Category & Genre Menu Logic
function renderBulkMenuCategories(categories) {
    if (!categories) return;
    EL.bulkMenuCategories.innerHTML = categories.map(c => `
        <button class="bulk-menu-item" onmouseenter="showBulkMenuGenres(${c.id})" onclick="showBulkMenuGenres(${c.id})">
            <i class="fa-solid fa-chevron-left mr-2 opacity-30"></i> ${c.name}
        </button>
    `).join('');
}

window.showBulkMenuGenres = (catId) => {
    // Update active state in category list
    const categoryButtons = EL.bulkMenuCategories.querySelectorAll('.bulk-menu-item');
    categoryButtons.forEach(btn => {
        if (btn.textContent.trim().includes(appState.parsedData.master_categories.find(c => c.id == catId).name)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const genres = appState.parsedData.master_genres.filter(g => g.category_id == catId);
    EL.bulkMenuGenres.innerHTML = genres.map(g => `
        <button class="bulk-menu-item" onclick="applyBulkCategoryGenre(${catId}, ${g.id}, '${g.name}')">
            ${g.name}
        </button>
    `).join('');
};

window.applyBulkCategoryGenre = async (catId, genId, genName) => {
    const catName = appState.parsedData.master_categories.find(c => c.id == catId).name;
    const confirmMsg = `全品目のカテゴリを「${catName} / ${genName}」に変更しますか？`;
    
    // Immediate close menu before confirm dialog
    EL.bulkMenuDropdown.classList.remove('show');

    const confirmed = await showConfirm("一括変更の確認", confirmMsg);
    
    if (!confirmed) {
        return;
    }

    appState.parsedData.items.forEach(item => {
        if (!item.deleted) {
            item.category_id = catId;
            item.genre_id = genId;
        }
    });

    renderItemsList();
    showToast("すべてのカテゴリ・ジャンルを更新しました。", "success");
    EL.bulkMenuDropdown.classList.remove('show');
};

EL.btnBulkMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSettingsDropdown();
    const avatarDropdown = EL.avatarDropdown;
    if (avatarDropdown && !avatarDropdown.classList.contains('hidden')) {
        avatarDropdown.classList.remove('opacity-100', 'scale-100');
        avatarDropdown.classList.add('opacity-0', 'scale-95');
        setTimeout(() => avatarDropdown.classList.add('hidden'), 200);
    }
    EL.bulkMenuDropdown.classList.toggle('show');
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!EL.bulkMenuDropdown.contains(e.target) && e.target !== EL.btnBulkMenu) {
        EL.bulkMenuDropdown.classList.remove('show');
    }
});

// --- History Copy Confirmation Handlers ---
window.updateCopyItemCategory = (groupIdx, itemIdx, catIdStr) => {
    const catId = parseInt(catIdStr);
    const genSel = document.getElementById(`copy-gen-${groupIdx}-${itemIdx}`);
    if (genSel && appState.copyMasterData) {
        genSel.innerHTML = generateGenreOptions(appState.copyMasterData.master_genres, catId, 0);
    }
};

// 4. Add Item Manual
EL.btnAddItem.addEventListener('click', () => {
    let defaultCatId = 101;
    let defaultGenId = 10101;
    if (appState.parsedData.items.length > 0) {
        defaultCatId = appState.parsedData.items[0].category_id;
        defaultGenId = appState.parsedData.items[0].genre_id;
    }
    appState.parsedData.items.push({ name: "新規品目", price: 0, category_id: defaultCatId, genre_id: defaultGenId });
    renderItemsList();
});

// 5. Register Trigger
EL.btnRegister.addEventListener('click', async () => {
    // Sync state from manual inputs
    appState.parsedData.date = EL.editDate.value;
    appState.parsedData.store = EL.editStore.value;
    appState.parsedData.point_usage = 0; // Handled directly in items now

    // Prepare a clean list of items for registration without destroying appState
    let itemsToRegister = [...appState.parsedData.items]
        .filter(i => !i.deleted)
        .filter(i => i.name.trim() !== '' || i.price !== 0);

    if (itemsToRegister.length === 0 && appState.parsedData.point_usage === 0) {
        showToast('登録する品目がありません。', 'warning');
        return;
    }

    if (!appState.parsedData.date) {
        showToast('日付を入力してください。', 'warning');
        EL.editDate.focus();
        return;
    }

    // --- Date Range Validation ( OCR Error Check ) ---
    const parts = appState.parsedData.date.split('-');
    const inputDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    oneYearAgo.setHours(0, 0, 0, 0);

    if (inputDate > today || inputDate < oneYearAgo) {
        const dateStr = appState.parsedData.date.replace(/-/g, '/');
        const alertMsg = inputDate > today
            ? `未来の日付（${dateStr}）が指定されています。`
            : `1年以上前の日付（${dateStr}）が指定されています。`;

        const confirmMsg = `⚠️ ${alertMsg}\n解析に誤りがある可能性があります。このまま登録しますか？`;

        if (!await showConfirm("日付の確認", confirmMsg)) {
            EL.editDate.focus();
            return;
        }
    }

    // Default name for items with empty name but price (apply to the list for registration)
    itemsToRegister.forEach(item => {
        if (item.name.trim() === '') {
            item.name = '支出';
        }
    });

    const performRegistration = async (force = false) => {
        showLoading(force ? '強制的に登録中...' : 'Zaimに登録中...');
        try {
            const targetAccountId = EL.editTargetAccount.value;
            
            // Create a payload with the filtered items
            const registerData = { ...appState.parsedData, items: itemsToRegister };
            
            const payload = {
                receipt_data: registerData,
                force: force,
                from_account_id: (EL.editFromAccount.value && EL.editFromAccount.value !== "") ? parseInt(EL.editFromAccount.value) : null,
                target_account_id: targetAccountId,
                receipt_id: appState.parsedData.receipt_id
            };

            const response = await apiFetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(await response.text());

            const result = await response.json();

            if (result.status === 'warning' && result.duplicate_found) {
                hideLoading();
                const confirmMessage = "⚠️ 既に同じ日付・金額の支出がZaimに登録されている可能性があります。\n本当に登録しますか？";
                if (await showConfirm("二重登録の確認", confirmMessage)) {
                    await performRegistration(true);
                }
                return;
            }

            localStorage.setItem(getPrefixedKey('lastUsedTargetAccount'), targetAccountId);
            localStorage.setItem(getPrefixedKey(`lastUsedAccountId_${targetAccountId}`), EL.editFromAccount.value);

            console.log(result);
            sendGAEvent('save_receipt_result');

            // If in batch mode, advance to next or show success if finished
            if (appState.currentQueueIndex !== -1 && appState.queue.length > 1) {
                hideLoading();

                // Revoke current item's URL as we are done with it
                const currentItem = appState.queue[appState.currentQueueIndex];
                if (currentItem && currentItem.blobUri) {
                    URL.revokeObjectURL(currentItem.blobUri);
                    currentItem.blobUri = null;
                }

                advanceQueue();
            } else {
                EL.successReceiptIdContainer.classList.remove('hidden');
                EL.successReceiptId.textContent = appState.parsedData.receipt_id;
                switchState('state-success');
            }
        } catch (err) {
            console.error(err);
            showToast(err.message || '登録中にエラーが発生しました', 'error');
        } finally {
            hideLoading();
        }
    };

    await performRegistration(false);
});

// 6. Reset / Cancel State
EL.btnReset.addEventListener('click', resetApp);
EL.btnSkip.addEventListener('click', () => {
    if (appState.currentQueueIndex !== -1 && appState.queue.length > 1) {
        // Revoke current item's URL as we are skipping it
        const currentItem = appState.queue[appState.currentQueueIndex];
        if (currentItem && currentItem.blobUri) {
            URL.revokeObjectURL(currentItem.blobUri);
            currentItem.blobUri = null;
        }
        advanceQueue();
    } else {
        resetApp();
    }
});

function resetApp() {
    hideLoading();
    if (appState.deletionTimer) {
        clearTimeout(appState.deletionTimer);
        appState.deletionTimer = null;
    }
    appState.lastDeleted = null;
    EL.snackbar.classList.remove('show');
    EL.snackbar.classList.add('hidden');

    appState.compressedImageBase64 = null;
    appState.currentImageUri = null; // Don't revoke here, queue cleanup handles it
    appState.parsedData = null;

    // Reset Queue & Cleanup Blob URLs
    appState.queue.forEach(item => {
        if (item.blobUri) {
            URL.revokeObjectURL(item.blobUri);
        }
    });
    appState.queue = [];
    appState.currentQueueIndex = -1;
    updateBatchProgressUI();

    EL.imageUpload.value = '';
    EL.imagePreviewContainer.classList.add('hidden');
    EL.btnParse.classList.add('hidden');
    EL.btnParse.disabled = true;
    EL.successReceiptIdContainer.classList.add('hidden');
    switchState('state-upload');
}

// ==========================================
// --- History Copy Logic ---
// ==========================================

// 履歴コピー画面用のアカウント一覧を読み込む
// (データ元は /api/accounts で共通だが、UI更新ロジックがコピー画面に特化しているため分離)
// サーバーから最新のアカウント一覧を取得し、メモリ（appState.accounts）とUIの全プルダウンを更新する
async function refreshAllAccountDropdowns() {
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

// 履歴コピー画面用のアカウント一覧を読み込む
async function loadAccounts() {
    if (appState.accounts.length > 0) return;
    return await refreshAllAccountDropdowns();
}

// Helper to disable current source in destination list and pick a default
function updateDestAccountOptions() {
    const src = EL.sourceAccountSelect.value;
    let firstValidValue = "";

    Array.from(EL.destAccountSelect.options).forEach(opt => {
        if (opt.value === "") return;

        if (opt.value === src) {
            opt.disabled = true;
        } else {
            opt.disabled = false;
            if (!firstValidValue) firstValidValue = opt.value;
        }
    });

    // If destination is now invalid (same as source), or if it's currently empty, pick the first valid one
    if (EL.destAccountSelect.value === src || EL.destAccountSelect.value === "") {
        if (firstValidValue) {
            EL.destAccountSelect.value = firstValidValue;
            // Trigger loading internal accounts for this new selection
            loadDestInternalAccounts();
        }
    }
}

// Ensure Destination account cannot be the same as Source account
EL.sourceAccountSelect.addEventListener('change', () => {
    // Save preference
    if (EL.sourceAccountSelect.value) {
        localStorage.setItem(getPrefixedKey('lastUsedSourceAccountId'), EL.sourceAccountSelect.value);
    }
    updateDestAccountOptions();

    // Clear history list and hide selection steps to prevent confusion
    appState.fetchedHistory = [];
    appState.selectedHistoryIds.clear();
    EL.historyListContainer.innerHTML = '';
    EL.copyStepList.classList.add('hidden');
    EL.copyStepList.classList.remove('flex');
    EL.copyStepDest.classList.add('hidden');
    if (typeof updateCopyCountUI === 'function') updateCopyCountUI();
});

EL.destAccountSelect.addEventListener('change', async () => {
    const destAccountId = EL.destAccountSelect.value;
    if (!destAccountId) {
        EL.destInternalAccountSelect.innerHTML = '<option value="">出金元を選択...</option>';
        return;
    }
    await loadDestInternalAccounts();
});

EL.destInternalAccountSelect.addEventListener('change', () => {
    const destId = EL.destAccountSelect.value;
    if (destId) {
        localStorage.setItem(getPrefixedKey(`lastUsedCopyAccountId_${destId}`), EL.destInternalAccountSelect.value);
    }
});

async function loadDestInternalAccounts() {
    const destId = EL.destAccountSelect.value;
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

        // Restore last used account for this destination
        const storageKey = `lastUsedCopyAccountId_${destId}`;
        const lastUsedId = localStorage.getItem(getPrefixedKey(storageKey));
        if (lastUsedId !== null && Array.from(EL.destInternalAccountSelect.options).some(o => o.value === lastUsedId)) {
            EL.destInternalAccountSelect.value = lastUsedId;
        }
    } catch (err) {
        console.error("Failed to load destination internal accounts/categories", err);
        EL.destInternalAccountSelect.innerHTML = '<option value="">読込失敗</option>';
    }
}

// 履歴取得期間のモード切替
EL.historyPeriodSelect.addEventListener('change', (e) => {
    const mode = e.target.value;
    EL.periodMonthInputContainer.classList.add('hidden');
    EL.periodCustomInputContainer.classList.add('hidden');

    if (mode === 'month') {
        EL.periodMonthInputContainer.classList.remove('hidden');
        // Set default to current month
        if (!EL.periodMonthInput.value) {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            EL.periodMonthInput.value = `${yyyy}-${mm}`;
        }
    } else if (mode === 'custom') {
        EL.periodCustomInputContainer.classList.remove('hidden');
        // Set default range
        if (!EL.periodStartInput.value || !EL.periodEndInput.value) {
            const now = new Date();
            const end = now.toISOString().split('T')[0];
            const start = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];
            EL.periodStartInput.value = start;
            EL.periodEndInput.value = end;
        }
    }
});

EL.btnFetchHistory.addEventListener('click', async () => {
    const accountId = EL.sourceAccountSelect.value;
    if (!accountId) {
        showToast("コピー元アカウントを選択してください。", 'warning');
        return;
    }

    const mode = EL.historyPeriodSelect.value;
    let startDate = "";
    let endDate = "";
    let periodInDays = 0;

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const formatDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (mode === 'this_month') {
        startDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        endDate = formatDate(now);
    } else if (mode === 'last_month') {
        startDate = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        endDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (mode === 'month') {
        const val = EL.periodMonthInput.value;
        if (!val) { showToast("月を指定してください。", "warning"); return; }
        const [y, m] = val.split('-').map(Number);
        startDate = formatDate(new Date(y, m - 1, 1));
        endDate = formatDate(new Date(y, m, 0));
    } else if (mode === 'custom') {
        startDate = EL.periodStartInput.value;
        endDate = EL.periodEndInput.value;
        if (!startDate || !endDate) { showToast("開始日と終了日を指定してください。", "warning"); return; }
        if (startDate > endDate) { showToast("開始日が終了日より後になっています。", "warning"); return; }
    } else if (mode === 'past_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate() + 1);
        startDate = formatDate(start);
        endDate = formatDate(now);
    } else {
        // numeric period (90 etc)
        periodInDays = parseInt(mode);
    }

    showLoading('履歴を取得中...');
    try {
        let url = `/api/history?account_id=${accountId}`;
        if (startDate && endDate) {
            url += `&start_date=${startDate}&end_date=${endDate}`;
        } else {
            url += `&period=${periodInDays}`;
        }

        const response = await apiFetch(url);
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();

        // Ensure skeletons are hidden if they weren't already
        if (EL.btnFetchHistorySkeleton) EL.btnFetchHistorySkeleton.classList.add('hidden');
        if (EL.btnFetchHistory) EL.btnFetchHistory.classList.remove('hidden');

        const rawPayments = data.history.filter(h => h.mode === "payment");
        const groupedHistory = [];
        const receiptMap = {};

        rawPayments.forEach(item => {
            const rid = item.receipt_id;
            if (rid && rid > 0) {
                if (receiptMap[rid]) {
                    receiptMap[rid].items.push(item);
                    receiptMap[rid].amount += item.amount;
                    // Update representative metadata to the "last" item in the sequence
                    receiptMap[rid].date = item.date;
                    receiptMap[rid].category_name = item.category_name;
                    receiptMap[rid].place = item.place;
                } else {
                    receiptMap[rid] = {
                        isGroup: true,
                        receipt_id: rid,
                        date: item.date,
                        category_name: item.category_name,
                        place: item.place,
                        items: [item],
                        amount: item.amount
                    };
                    groupedHistory.push(receiptMap[rid]);
                }
            } else {
                groupedHistory.push({
                    isGroup: false,
                    id: item.id,
                    date: item.date,
                    category_name: item.category_name,
                    place: item.place,
                    items: [item],
                    amount: item.amount
                });
            }
        });

        appState.fetchedHistory = groupedHistory;

        appState.selectedHistoryIds.clear();
        renderHistoryList();
        sendGAEvent('fetch_zaim_history');

        // Hide loading and show app
        hideLoading();
        EL.copyStepList.classList.remove('hidden');
        EL.copyStepList.classList.add('flex');
        EL.copyStepDest.classList.remove('hidden');
        updateCopyCountUI();
    } catch (err) {
        showToast("履歴の取得に失敗しました: " + err.message, 'error');
        console.error(err);
    } finally {
        hideLoading();
    }
});

function renderHistoryList() {
    EL.historyListContainer.innerHTML = '';

    if (appState.fetchedHistory.length === 0) {
        EL.historyListContainer.innerHTML = '<li class="text-gray-500 text-center py-4">履歴がありません</li>';
        return;
    }

    appState.fetchedHistory.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = "flex items-start space-x-3 p-2 hover:bg-white dark:hover:bg-gray-700 rounded transition-colors border-b border-transparent hover:border-gray-200 dark:hover:border-gray-600 cursor-pointer";

        // Format Date yyyy/mm/dd
        const dateStr = item.date.replace(/-/g, '/');

        const lastItem = item.items[item.items.length - 1];
        let lastItemName = lastItem.name || "未設定";
        let subText = lastItemName + (item.items.length > 1 ? " 等" : "");
        let catText = item.category_name || "未分類";

        li.innerHTML = `
            <div class="pt-1">
                <input type="checkbox" id="hist-${index}" class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer" onchange="toggleHistorySelection(${index}, this.checked)">
            </div>
            <label for="hist-${index}" class="flex-grow flex justify-between items-center cursor-pointer select-none">
                <div>
                    <div class="font-bold text-gray-800 dark:text-gray-100 flex items-center space-x-2">
                        <span>${catText}</span>
                        ${item.place ? `<span class="text-xs font-normal px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">${item.place}</span>` : ''}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${dateStr}　${subText}
                        ${item.receipt_id ? `<span class="ml-2 py-0.5 px-1.5 bg-gray-100 dark:bg-gray-700/50 rounded inline-block text-[9px] font-mono">ID:${item.receipt_id}</span>` : ''}
                    </div>
                </div>
                <div class="font-mono font-bold text-gray-800 dark:text-gray-100">
                    ¥${parseInt(item.amount).toLocaleString()}
                </div>
            </label>
        `;
        EL.historyListContainer.appendChild(li);

        // Setup row click trigger checkbox
        li.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
                const cb = document.getElementById(`hist-${index}`);
                cb.checked = !cb.checked;
                toggleHistorySelection(index, cb.checked);
            }
        });
    });
}

window.toggleHistorySelection = (index, isChecked) => {
    if (isChecked) {
        appState.selectedHistoryIds.add(index);
    } else {
        appState.selectedHistoryIds.delete(index);
    }
    updateCopyCountUI();
};

EL.btnSelectAll.addEventListener('click', () => {
    const isAllSelected = appState.selectedHistoryIds.size === appState.fetchedHistory.length;

    const checkboxes = EL.historyListContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb, index) => {
        cb.checked = !isAllSelected;
        toggleHistorySelection(index, !isAllSelected);
    });

    EL.btnSelectAll.textContent = isAllSelected ? "全選択" : "全解除";
});

function updateCopyCountUI() {
    const count = appState.selectedHistoryIds.size;
    EL.selectedCopyCount.textContent = count;
    EL.btnPrepareCopy.disabled = count === 0;
}

// Show Modal
EL.btnPrepareCopy.addEventListener('click', () => {
    const destId = EL.destAccountSelect.value;
    if (!destId) {
        showToast("コピー先アカウントを選択してください。", 'warning');
        return;
    }

    const destName = EL.destAccountSelect.options[EL.destAccountSelect.selectedIndex].text;
    EL.confirmDestName.textContent = destName;

    // Render confirmation preview
    EL.confirmListContainer.innerHTML = '';
    const selectedIndices = Array.from(appState.selectedHistoryIds).sort((a, b) => a - b);

    selectedIndices.forEach(idx => {
        const group = appState.fetchedHistory[idx];
        const li = document.createElement('li');
        li.className = "flex flex-col bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-gray-100 dark:border-gray-700 space-y-3";

        const lastItem = group.items[group.items.length - 1];
        let lastItemName = (lastItem.name || "未設定");
        let textName = (group.category_name || "未分類") + " - " + lastItemName + (group.items.length > 1 ? ` 等 (${group.items.length}件)` : "");

        const batchVal = EL.destInternalAccountSelect.value;
        let defaultAccId = "";
        if (batchVal === 'keep') {
            defaultAccId = group.items[0].from_account_id || "";
        } else {
            defaultAccId = batchVal;
        }

        let accOptions = '<option value="">未指定（出金元なし）</option>';
        if (appState.destInternalAccounts) {
            appState.destInternalAccounts.forEach(a => {
                accOptions += `<option value="${a.id}" ${a.id == defaultAccId ? 'selected' : ''}>${a.name}</option>`;
            });
        }

        // Render each item within the group with category/genre selects
        // Note: We reverse items for display to show "natural" receipt order (items first, adjustments last)
        let itemsHtml = '';
        [...group.items].reverse().forEach((item, rIdx) => {
            const itemIdx = group.items.length - 1 - rIdx; // Original index
            const catOptions = generateCategoryOptions(appState.copyMasterData.master_categories, item.category_id);
            const genOptions = generateGenreOptions(appState.copyMasterData.master_genres, item.category_id, item.genre_id);

            itemsHtml += `
                <div class="item-copy-config bg-gray-50 dark:bg-gray-900/50 p-2 rounded border border-gray-100 dark:border-gray-800 space-y-2" 
                     data-group-idx="${idx}" data-item-idx="${itemIdx}">
                    <div class="flex justify-between items-center text-xs">
                        <span class="font-medium dark:text-gray-300 truncate mr-2">${item.name || "名称なし"}</span>
                        <span class="font-mono font-bold dark:text-white shrink-0">¥${parseInt(item.amount).toLocaleString()}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <select class="item-category-select text-[10px] p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 rounded focus:outline-none transition-colors" 
                                onchange="updateCopyItemCategory(${idx}, ${itemIdx}, this.value)">
                            ${catOptions}
                        </select>
                        <select class="item-genre-select text-[10px] p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 rounded focus:outline-none transition-colors" 
                                id="copy-gen-${idx}-${itemIdx}">
                            ${genOptions}
                        </select>
                    </div>
                </div>
            `;
        });

        li.innerHTML = `
            <div class="bg-blue-50 dark:bg-blue-900/20 -m-3 mb-1 p-2 px-3 border-b border-blue-100 dark:border-blue-900/40 rounded-t flex justify-between items-center">
                <span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">${group.place || group.category_name || "未分類"}</span>
                <span class="text-[10px] text-gray-400">${group.date}</span>
            </div>
            <div class="space-y-2">
                ${itemsHtml}
            </div>
            <div class="relative pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                <span class="text-[10px] text-gray-400 block mb-1">記録先の出金元:</span>
                <select class="group-account-select w-full p-1.5 pl-7 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors text-[11px] appearance-none" data-group-idx="${idx}">
                    ${accOptions}
                </select>
                <div class="absolute bottom-2 left-2 flex items-center pointer-events-none">
                    <i class="fa-solid fa-credit-card text-gray-400 text-[10px]"></i>
                </div>
            </div>
        `;
        EL.confirmListContainer.appendChild(li);
    });

    // Show modal with animation
    EL.copyConfirmModal.classList.remove('hidden');
    // small delay to allow display:block to apply before animating opacity
    setTimeout(() => {
        EL.copyConfirmModal.classList.replace('opacity-0', 'opacity-100');
        EL.copyConfirmModalContent.classList.remove('-translate-y-full');
    }, 10);
});

const closeCopyModal = () => {
    EL.copyConfirmModal.classList.replace('opacity-100', 'opacity-0');
    EL.copyConfirmModalContent.classList.add('-translate-y-full');
    setTimeout(() => {
        EL.copyConfirmModal.classList.add('hidden');
    }, 300); // match transition duration
};

EL.btnCloseModal.addEventListener('click', closeCopyModal);
EL.copyConfirmModal.addEventListener('click', (e) => {
    if (e.target === EL.copyConfirmModal) closeCopyModal();
});

// Execute Copy
EL.btnExecuteCopy.addEventListener('click', async () => {
    const sourceAccountId = EL.sourceAccountSelect.value;
    const destAccountId = EL.destAccountSelect.value;
    const selectedIndices = Array.from(appState.selectedHistoryIds);

    const itemsToCopy = [];
    const groupContainers = EL.confirmListContainer.querySelectorAll('li');
    groupContainers.forEach(container => {
        const accSelect = container.querySelector('.group-account-select');
        const gIdx = parseInt(accSelect.dataset.groupIdx);
        const accountId = accSelect.value;
        const group = appState.fetchedHistory[gIdx];

        const itemConfigs = container.querySelectorAll('.item-copy-config');
        itemConfigs.forEach(itemConfig => {
            const iIdx = parseInt(itemConfig.dataset.itemIdx);
            const original = group.items[iIdx];

            const catSelect = itemConfig.querySelector('.item-category-select');
            const genSelect = itemConfig.querySelector('.item-genre-select');

            itemsToCopy.push({
                category_id: parseInt(catSelect.value),
                genre_id: parseInt(genSelect.value),
                amount: original.amount,
                date: original.date,
                name: original.name || "",
                place: original.place || "",
                comment: original.comment || "",
                group_id: gIdx,
                from_account_id: accountId ? parseInt(accountId) : null
            });
        });
    });

    const performCopy = async (force = false) => {
        closeCopyModal();
        showLoading('履歴をコピー中...');

        try {
            const response = await apiFetch('/api/copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_account_id: sourceAccountId,
                    destination_account_id: destAccountId,
                    from_account_id: EL.destInternalAccountSelect.value ? parseInt(EL.destInternalAccountSelect.value) : null,
                    items_to_copy: itemsToCopy,
                    force: force
                })
            });

            if (!response.ok) throw new Error(await response.text());

            const result = await response.json();

            if (result.status === "warning" && result.duplicate_found) {
                hideLoading();
                if (await showConfirm("重複コピーの確認", result.message)) {
                    await performCopy(true); // Retry with force: true
                    return;
                } else {
                    return; // Cancelled by user
                }
            }

            // Save last used account for copy
            localStorage.setItem(getPrefixedKey('lastUsedCopyAccountId'), EL.destInternalAccountSelect.value);
            sendGAEvent('copy_zaim_history');

            EL.copyStepConfig.classList.add('hidden');
            EL.copyStepList.classList.add('hidden');
            EL.copyStepList.classList.remove('flex');
            EL.copyStepDest.classList.add('hidden');

            EL.copyStepSuccess.classList.remove('hidden');
            EL.copyStepSuccess.classList.add('flex');

            if (result.status === "partial_success") {
                document.getElementById('copy-success-message').textContent = `${result.success_count}件成功しました。（失敗: ${result.failed_count}件）`;
            } else {
                document.getElementById('copy-success-message').textContent = `${result.success_count}件の履歴をコピーしました。`;
            }
        } catch (err) {
            console.error(err);
            showToast(err.message || 'コピー中にエラーが発生しました', 'error');
        } finally {
            hideLoading();
        }
    };

    performCopy();
});

const resetCopyApp = () => {
    appState.fetchedHistory = [];
    appState.selectedHistoryIds.clear();
    EL.historyListContainer.innerHTML = '';
    updateCopyCountUI();

    EL.copyStepSuccess.classList.add('hidden');
    EL.copyStepSuccess.classList.remove('flex');

    EL.copyStepConfig.classList.remove('hidden');
    EL.copyStepList.classList.add('hidden');
    EL.copyStepList.classList.remove('flex');
    EL.copyStepDest.classList.add('hidden');
};

EL.btnResetCopy.addEventListener('click', resetCopyApp);

// --- Lightbox Logic ---
const openLightbox = () => {
    if (!appState.currentImageUri) return;
    EL.lightboxImage.src = appState.currentImageUri;
    EL.lightboxModal.classList.remove('hidden');
    setTimeout(() => {
        EL.lightboxModal.classList.replace('opacity-0', 'opacity-100');
    }, 10);
};

const closeLightbox = () => {
    EL.lightboxModal.classList.replace('opacity-100', 'opacity-0');
    setTimeout(() => {
        EL.lightboxModal.classList.add('hidden');
    }, 300);
};

EL.receiptThumbnailContainer.addEventListener('click', openLightbox);
EL.lightboxClose.addEventListener('click', closeLightbox);

// Close lightbox on background click or clicking the container spacing
EL.lightboxModal.addEventListener('click', (e) => {
    if (e.target === EL.lightboxModal || e.target.classList.contains('select-none')) {
        closeLightbox();
    }
});

// レシート解析画面用の登録先アカウント一覧を読み込む
// (データ元は /api/accounts で共通だが、最後に使用したアカウントの復元など解析画面特有の処理を含む)
const loadTargetAccounts = async () => {
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
        EL.uploadAccountSelectorContainer.classList.remove('hidden');

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

EL.editTargetAccount.addEventListener('change', () => {
    const val = EL.editTargetAccount.value;
    EL.uploadTargetAccount.value = val;
    localStorage.setItem(getPrefixedKey('lastUsedTargetAccount'), val);
    loadZaimAccounts();
});

EL.uploadTargetAccount.addEventListener('change', () => {
    const val = EL.uploadTargetAccount.value;
    EL.editTargetAccount.value = val;
    localStorage.setItem(getPrefixedKey('lastUsedTargetAccount'), val);
    loadZaimAccounts();
});

// --- Auth & Initial Load ---
const initFirebaseAuth = async () => {
    // Hide splash screen as soon as initialization logic starts
    if (EL.splashScreen) {
        EL.splashScreen.style.opacity = '0';
        EL.splashScreen.style.pointerEvents = 'none'; // Unblock UI immediately
        setTimeout(() => {
            EL.splashScreen.classList.add('hidden');
            EL.splashScreen.style.display = 'none'; // Ensure display:none overrides inline flex
        }, 300);
    }

    const setupFirebase = (config) => {
        const fireApp = initializeApp(config);
        const auth = getAuth(fireApp);
        const provider = new GoogleAuthProvider();

        EL.btnGoogleLogin.addEventListener('click', async () => {
            try {
                EL.btnGoogleLogin.disabled = true;
                EL.btnGoogleLogin.innerHTML = `
                    <div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-600 mr-3"></div>
                    <span>ログイン処理中...</span>
                `;
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error("Login failed", error);
                showToast("ログインに失敗しました: " + error.message, 'error');
                EL.btnGoogleLogin.disabled = false;
                EL.btnGoogleLogin.innerHTML = `
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-6 h-6">
                    <span>Googleでログイン</span>
                `;
            }
        });

        // Avatar Dropdown Toggle
        const closeAvatarDropdown = () => {
            if (!EL.avatarDropdown.classList.contains('hidden')) {
                EL.avatarDropdown.classList.remove('opacity-100', 'scale-100');
                EL.avatarDropdown.classList.add('opacity-0', 'scale-95');
                setTimeout(() => EL.avatarDropdown.classList.add('hidden'), 200);
            }
        };

        EL.btnUserAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            closeSettingsDropdown();
            if (EL.bulkMenuDropdown) EL.bulkMenuDropdown.classList.remove('show');
            
            const dropdown = EL.avatarDropdown;
            if (dropdown.classList.contains('hidden')) {
                dropdown.classList.remove('hidden');
                setTimeout(() => {
                    dropdown.classList.remove('opacity-0', 'scale-95');
                    dropdown.classList.add('opacity-100', 'scale-100');
                }, 10);
            } else {
                closeAvatarDropdown();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!EL.btnUserAvatar.contains(e.target) && !EL.avatarDropdown.contains(e.target)) {
                if (!EL.avatarDropdown.classList.contains('hidden')) {
                    closeAvatarDropdown();
                }
            }
        });

        // Logout
        EL.menuItemLogout.addEventListener('click', async () => {
            EL.avatarDropdown.classList.add('hidden');
            if (await showConfirm("ログアウト", "ログアウトしますか？")) {
                try {
                    await signOut(auth);
                } catch (error) {
                    console.error("Logout failed", error);
                }
            }
        });

        // Delete Account
        EL.menuItemDeleteAccount.addEventListener('click', async () => {
            EL.avatarDropdown.classList.add('hidden');
            const confirmMsg = "本当にアカウントを削除しますか？\n設定したすべての連携情報や履歴データが完全に消去され、元に戻すことはできません。";
            if (await showConfirm("アカウント削除の警告", confirmMsg)) {
                try {
                    showToast("アカウントを削除しています...", "info");
                    const res = await fetch('/api/user', {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${appState.idToken}`
                        }
                    });
                    if (!res.ok) throw new Error(`Failed to delete backend data: ${res.statusText}`);
                    const user = auth.currentUser;
                    if (user) {
                        import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js').then(async (module) => {
                            const { deleteUser } = module;
                            await deleteUser(user);
                            showToast("アカウントを正常に削除しました", "success");
                        });
                    }
                } catch (error) {
                    console.error("Account deletion failed", error);
                    if (error.code === 'auth/requires-recent-login') {
                        showToast("セキュリティのため、再度ログインしてからもう一度削除を実行してください。", "error");
                        await signOut(auth);
                    } else {
                        showToast("アカウント削除に失敗しました: " + error.message, "error");
                    }
                }
            }
        });

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // GA Opt-out logic for developers
                if (window.DEVELOPER_EMAILS && window.GA_MEASUREMENT_ID) {
                    const devEmails = window.DEVELOPER_EMAILS.split(',').map(email => email.trim());
                    if (devEmails.includes(user.email)) {
                        window['ga-disable-' + window.GA_MEASUREMENT_ID] = true;
                        console.log('Developer access detected: GA tracking disabled.');
                    }
                }

                appState.user = user;
                appState.idToken = await user.getIdToken();

                // Hide login overlay immediately - don't wait for token etc.
                if (!EL.loginOverlay.classList.contains('hidden')) {
                    EL.loginOverlay.classList.add('opacity-0');
                    EL.loginOverlay.style.pointerEvents = 'none'; // Allow clicks to pass through while fading
                    setTimeout(() => EL.loginOverlay.classList.add('hidden'), 300);
                }
                EL.userProfile.classList.remove('hidden');
                EL.btnZaimSettings.classList.remove('hidden');
                if (user.photoURL) EL.userAvatar.src = user.photoURL;

                (async () => {
                    try {
                        // Parallel load of accounts and target accounts
                        const [_, hasTarget] = await Promise.all([
                            loadAccounts(),
                            loadTargetAccounts()
                        ]);

                        if (hasTarget !== false) {
                            try {
                                await loadZaimAccounts();
                            } catch (loadErr) {
                                console.error("Zaim access failed:", loadErr);
                                showToast("Zaim連携に失敗しました。設定を確認してください。", "error");
                                openZaimSettings();
                            }
                        } else {
                            openZaimSettings();
                        }
                    } catch (err) {
                        console.error("Error loading accounts post-login:", err);
                    }
                })();
            } else {
                appState.user = null;
                appState.idToken = null;

                // ONLY show login overlay if auth state is confirmed negative
                EL.loginOverlay.classList.remove('hidden');
                setTimeout(() => EL.loginOverlay.classList.remove('opacity-0'), 10);
                EL.userProfile.classList.add('hidden');
                EL.btnZaimSettings.classList.add('hidden');
                EL.userAvatar.src = "";

                EL.btnGoogleLogin.disabled = false;
                EL.btnGoogleLogin.innerHTML = `
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-6 h-6">
                    <span>Googleでログイン</span>
                `;
            }
        });
    };

    // Try to get config from cache first for instant initialization
    const cachedConfig = localStorage.getItem('firebaseConfig');
    if (cachedConfig) {
        try {
            setupFirebase(JSON.parse(cachedConfig));
            // Still fetch fresh config in background to ensure it's up to date
            fetch('/api/config').then(res => res.json()).then(data => {
                localStorage.setItem('firebaseConfig', JSON.stringify(data.firebaseConfig));
            }).catch(() => {});
            return;
        } catch (e) {
            console.error("Failed to parse cached firebase config", e);
        }
    }

    // No cache or failed cache: fetch from API
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error("Failed to fetch Firebase config");
        const { firebaseConfig } = await res.json();
        localStorage.setItem('firebaseConfig', JSON.stringify(firebaseConfig));
        setupFirebase(firebaseConfig);
    } catch (e) {
        console.error("Error initializing Firebase Auth:", e);
        showToast("システムの設定エラーによりログイン機能が起動できませんでした。", 'error');
    }
};

// --- Zaim Credentials Menu ---
const renderZaimAccountsList = () => {
    EL.zaimAccountsList.innerHTML = '';

    if (appState.accounts.length === 0) {
        EL.zaimAccountsList.innerHTML = '<p class="text-xs text-gray-400 italic py-2">アカウントが登録されていません。</p>';
        return;
    }

    appState.accounts.forEach(acc => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 flex justify-between items-center group cursor-pointer hover:border-blue-500 transition-all';
        item.innerHTML = `
            <div class="flex items-center">
                <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-400">
                    <i class="fa-solid fa-user-check text-xs"></i>
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">${acc.name}</span>
            </div>
            <i class="fa-solid fa-chevron-right text-xs text-gray-400 group-hover:translate-x-1 transition-transform"></i>
        `;
        item.onclick = () => editExternalAccount(acc.id);
        EL.zaimAccountsList.appendChild(item);
    });
};

const editExternalAccount = async (id) => {
    appState.editingAccountId = id;
    const acc = appState.accounts.find(a => a.id == id);
    EL.zaimAccountName.value = acc ? acc.name : "";

    EL.zaimFormContainer.classList.remove('hidden');
    // Hide connect button when editing existing (we only allow disconnect/rename via OAuth if we want, but currently just disconnect)
    EL.btnZaimConnect.parentElement.classList.add('hidden');

    EL.zaimButtonsContainer.classList.remove('hidden');
    EL.btnDeleteCreds.classList.remove('hidden');
    EL.zaimAccountsList.parentElement.classList.add('hidden');
};

const updateZaimCloseButtonVisibility = () => {
    // Header Close button (X) is now always visible as per requirement
    EL.btnCloseCreds.classList.remove('hidden');
};

const openZaimSettings = async () => {
    appState.editingAccountId = null;
    await refreshAllAccountDropdowns();
    renderZaimAccountsList();

    // Reset form
    EL.zaimAccountName.value = "";

    EL.zaimFormContainer.classList.add('hidden');
    EL.zaimButtonsContainer.classList.remove('hidden'); // Always show buttons container (Cancel button)
    EL.btnDeleteCreds.classList.add('hidden');
    EL.zaimAccountsList.parentElement.classList.remove('hidden');

    updateZaimCloseButtonVisibility();

    EL.zaimCredsModal.classList.remove('hidden');
    setTimeout(() => {
        EL.zaimCredsModal.classList.remove('opacity-0');
        EL.zaimCredsModal.classList.add('opacity-100');
    }, 10);
};

const closeZaimSettings = () => {
    EL.zaimCredsModal.classList.replace('opacity-100', 'opacity-0');
    setTimeout(() => {
        EL.zaimCredsModal.classList.add('hidden');
    }, 300);
};

// Open Settings Dropdown
EL.btnZaimSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    // Use the function defined in the closure if available, or find it
    // Actually, since it's defined inside setupFirebase, it might not be globally accessible.
    // However, EL.avatarDropdown is.
    const avatarDropdown = EL.avatarDropdown;
    if (avatarDropdown && !avatarDropdown.classList.contains('hidden')) {
        avatarDropdown.classList.remove('opacity-100', 'scale-100');
        avatarDropdown.classList.add('opacity-0', 'scale-95');
        setTimeout(() => avatarDropdown.classList.add('hidden'), 200);
    }
    if (EL.bulkMenuDropdown) EL.bulkMenuDropdown.classList.remove('show');

    const isHidden = EL.settingsDropdown.classList.contains('hidden');
    if (isHidden) {
        EL.settingsDropdown.classList.remove('hidden');
        sendGAEvent('open_settings');
        setTimeout(() => {
            EL.settingsDropdown.classList.remove('opacity-0', 'scale-95');
            EL.settingsDropdown.classList.add('opacity-100', 'scale-100');
        }, 10);
    } else {
        closeSettingsDropdown();
    }
});

function closeSettingsDropdown() {
    EL.settingsDropdown.classList.remove('opacity-100', 'scale-100');
    EL.settingsDropdown.classList.add('opacity-0', 'scale-95');
    setTimeout(() => {
        EL.settingsDropdown.classList.add('hidden');
    }, 200);
}

document.addEventListener('click', (e) => {
    if (!EL.settingsDropdown.contains(e.target) && e.target !== EL.btnZaimSettings) {
        closeSettingsDropdown();
    }
});

EL.menuItemZaimCreds.addEventListener('click', () => {
    closeSettingsDropdown();
    openZaimSettings();
});

// --- Gemini Settings ---
const openGeminiSettings = async () => {
    // Reset form
    EL.geminiApiKey.value = "";
    EL.geminiKeyStatus.textContent = "状態: 取得中...";
    EL.geminiKeyStatus.className = "text-sm font-bold mt-2 text-gray-500";

    try {
        const response = await apiFetch(`/api/gemini/credentials`);
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();

        if (data.is_configured) {
            EL.geminiKeyStatus.textContent = `状態: 設定済み (末尾: ${data.api_key_last_4})`;
            EL.geminiKeyStatus.className = "text-sm font-bold mt-2 text-green-600 dark:text-green-400";
        } else {
            EL.geminiKeyStatus.textContent = "状態: 未設定";
            EL.geminiKeyStatus.className = "text-sm font-bold mt-2 text-red-600 dark:text-red-400";
        }
    } catch (e) {
        console.error("Failed to load Gemini config", e);
        EL.geminiKeyStatus.textContent = "状態: 確認失敗";
    }

    EL.geminiCredsModal.classList.remove('hidden');
    setTimeout(() => {
        EL.geminiCredsModal.classList.remove('opacity-0');
        EL.geminiCredsModal.classList.add('opacity-100');
    }, 10);
};

const closeGeminiSettings = () => {
    EL.geminiCredsModal.classList.replace('opacity-100', 'opacity-0');
    setTimeout(() => {
        EL.geminiCredsModal.classList.add('hidden');
    }, 300);
};

EL.menuItemGeminiCreds.addEventListener('click', () => {
    closeSettingsDropdown();
    openGeminiSettings();
});

EL.btnCloseGeminiCreds.addEventListener('click', closeGeminiSettings);
EL.btnCancelGeminiCreds.addEventListener('click', closeGeminiSettings);

EL.btnSaveGeminiCreds.addEventListener('click', async () => {
    const apiKey = EL.geminiApiKey.value.trim();
    if (!apiKey) {
        showToast("APIキーを入力してください。", 'warning');
        return;
    }

    const btnOriginalText = EL.btnSaveGeminiCreds.innerHTML;
    EL.btnSaveGeminiCreds.disabled = true;
    EL.btnSaveGeminiCreds.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 保存中...';

    try {
        const res = await apiFetch('/api/gemini/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gemini_api_key: apiKey })
        });
        if (!res.ok) throw new Error(await res.text());

        showToast("Gemini APIキーを保存しました。");
        sendGAEvent('gemini_key_saved');
        closeGeminiSettings();
    } catch (e) {
        console.error(e);
        showToast("APIキーの保存に失敗しました: " + e.message, 'error');
    } finally {
        EL.btnSaveGeminiCreds.disabled = false;
        EL.btnSaveGeminiCreds.innerHTML = btnOriginalText;
    }
});

EL.btnDeleteGeminiCreds.addEventListener('click', async () => {
    if (!await showConfirm("削除の確認", "Gemini APIキーを削除しますか？これ以降の解析はできなくなります。")) return;

    try {
        const resp = await apiFetch(`/api/gemini/credentials`, { method: 'DELETE' });
        if (!resp.ok) throw new Error(await resp.text());
        showToast("Gemini APIキーを削除しました。");
        closeGeminiSettings();
    } catch (e) {
        showToast("削除に失敗しました: " + e.message, 'error');
    }
});


EL.btnCloseCreds.addEventListener('click', closeZaimSettings);
EL.btnCancelCreds.addEventListener('click', () => {
    const isFormVisible = !EL.zaimFormContainer.classList.contains('hidden');
    if (isFormVisible && appState.accounts.length > 0) {
        // Go back to list
        EL.zaimFormContainer.classList.add('hidden');
        EL.zaimButtonsContainer.classList.add('hidden');
        EL.zaimAccountsList.parentElement.classList.remove('hidden');
    } else {
        // Already at list OR no accounts yet -> close modal
        closeZaimSettings();
    }
});

EL.btnAddNewAccount.addEventListener('click', () => {
    appState.editingAccountId = null;
    EL.zaimAccountName.value = "";

    EL.zaimFormContainer.classList.remove('hidden');
    EL.btnZaimConnect.parentElement.classList.remove('hidden');
    // We don't show the "save" button anymore, OAuth handles it
    EL.zaimButtonsContainer.classList.remove('hidden');
    EL.btnDeleteCreds.classList.add('hidden');
    EL.zaimAccountsList.parentElement.classList.add('hidden');
});

EL.btnZaimConnect.addEventListener('click', async () => {
    const name = EL.zaimAccountName.value.trim() || "Zaim Account";
    const btnOriginalText = EL.btnZaimConnect.innerHTML;
    EL.btnZaimConnect.disabled = true;
    EL.btnZaimConnect.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 連携中...';

    try {
        const res = await apiFetch(`/api/zaim/login?name=${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();
        if (data.auth_url) {
            sessionStorage.setItem('zaim_auth_pending', 'true');
            window.location.href = data.auth_url;
        } else {
            throw new Error("Invalid response from server. No auth_url found.");
        }
    } catch (e) {
        console.error(e);
        showToast("連携の開始に失敗しました: " + e.message, 'error');
        EL.btnZaimConnect.disabled = false;
        EL.btnZaimConnect.innerHTML = btnOriginalText;
    }
});

EL.btnDeleteCreds.addEventListener('click', async () => {
    if (!appState.editingAccountId) return;
    if (!await showConfirm("連携解除の確認", "このZaimアカウントとの連携を解除しますか？")) return;

    try {
        const resp = await apiFetch(`/api/zaim/disconnect/${appState.editingAccountId}`, {
            method: 'DELETE'
        });
        if (!resp.ok) throw new Error(await resp.text());

        showToast("連携を解除しました。");
        await refreshAllAccountDropdowns();
        renderZaimAccountsList();

        EL.zaimFormContainer.classList.add('hidden');
        EL.zaimAccountsList.parentElement.classList.remove('hidden');
        updateZaimCloseButtonVisibility();
    } catch (e) {
        showToast("解除に失敗しました: " + e.message, 'error');
    }
});

// Guide URL Copy Handlers
const copyGuideUrl = () => {
    const url = "https://note.com/logic_prompt/n/n9b49739594ca";
    navigator.clipboard.writeText(url).then(() => {
        showToast("セットアップガイドのURLをコピーしました。", 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showToast("URLのコピーに失敗しました。", 'error');
    });
};

if (EL.btnCopyGuideZaim) EL.btnCopyGuideZaim.addEventListener('click', copyGuideUrl);
if (EL.btnCopyGuideGemini) EL.btnCopyGuideGemini.addEventListener('click', copyGuideUrl);

// App Entry Point
initFirebaseAuth();
