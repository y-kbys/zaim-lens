/**
 * DOM Elements mapping
 */
export const EL = {
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
    btnSaveZaimCreds: document.getElementById('btn-save-zaim-creds'),
};

/**
 * Toast notification
 */
export const showToast = (message, type = 'info') => {
    const toast = document.createElement('div');
    const colorClass = 
        type === 'error' ? 'bg-red-500' : 
        type === 'success' ? 'bg-green-500' : 
        type === 'warning' ? 'bg-orange-500' : 'bg-blue-500';

    toast.className = `${colorClass} text-white px-6 py-3 rounded-xl shadow-2xl transform transition-all duration-300 translate-y-full opacity-0 flex items-center space-x-2 font-medium z-[1000]`;
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if(type === 'error') icon = '<i class="fa-solid fa-circle-exclamation"></i>';
    if(type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if(type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    EL.toastContainer.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-y-full', 'opacity-0');
    }, 10);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('translate-y-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

/**
 * Global Loading Overlay
 */
export const showLoading = (text = "読み込み中...") => {
    EL.loadingText.textContent = text;
    EL.loadingOverlay.classList.remove('hidden');
    setTimeout(() => EL.loadingOverlay.classList.remove('opacity-0'), 10);
};

export const hideLoading = () => {
    EL.loadingOverlay.classList.add('opacity-0');
    setTimeout(() => EL.loadingOverlay.classList.add('hidden'), 300);
};

/**
 * Switch between main application states (Upload, Edit, Success)
 */
export const switchState = (stateId) => {
    EL.stateUpload.classList.add('hidden');
    EL.stateEdit.classList.add('hidden');
    EL.stateSuccess.classList.add('hidden');
    EL.bottomActionBar.classList.add('hidden');

    document.getElementById(stateId).classList.remove('hidden');

    if (stateId === 'state-edit') {
        EL.bottomActionBar.classList.remove('hidden');
    }
};

/**
 * Modern Custom Promise-based Confirm Dialog
 */
export const showConfirm = (title, message) => {
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
 * 生成カテゴリのHTMLオプション
 */
export function generateCategoryOptions(masterCategories, selectedId) {
    if (!masterCategories) return '';
    return masterCategories.map(c =>
        `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${c.name}</option>`
    ).join('');
}

/**
 * 生成ジャンルのHTMLオプション
 */
export function generateGenreOptions(masterGenres, catId, selectedId) {
    if (!masterGenres) return '';
    return masterGenres
        .filter(g => g.category_id == catId)
        .map(g =>
            `<option value="${g.id}" ${g.id == selectedId ? 'selected' : ''}>${g.name}</option>`
        ).join('');
}
