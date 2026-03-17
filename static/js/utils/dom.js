/**
 * DOM Elements mapping
 */
/**
 * DOM Elements mapping
 */
export const EL = {
    tabParse: /** @type {HTMLButtonElement} */ (document.getElementById('tab-parse')),
    tabCopy: /** @type {HTMLButtonElement} */ (document.getElementById('tab-copy')),
    panelParse: /** @type {HTMLElement} */ (document.getElementById('panel-parse')),
    panelCopy: /** @type {HTMLElement} */ (document.getElementById('panel-copy')),

    stateUpload: /** @type {HTMLElement} */ (document.getElementById('state-upload')),
    stateEdit: /** @type {HTMLElement} */ (document.getElementById('state-edit')),
    stateSuccess: /** @type {HTMLElement} */ (document.getElementById('state-success')),
    bottomActionBar: /** @type {HTMLElement} */ (document.getElementById('bottom-action-bar')),
    themeToggle: /** @type {HTMLButtonElement} */ (document.getElementById('theme-toggle')),

    // Upload State
    imageUpload: /** @type {HTMLInputElement} */ (document.getElementById('image-upload')),
    imagePreview: /** @type {HTMLImageElement} */ (document.getElementById('image-preview')),
    imagePreviewContainer: /** @type {HTMLElement} */ (document.getElementById('image-preview-container')),
    btnParse: /** @type {HTMLButtonElement} */ (document.getElementById('btn-parse')),
    btnManualEntry: /** @type {HTMLButtonElement} */ (document.getElementById('btn-manual-entry')),
    uploadTargetAccount: /** @type {HTMLSelectElement} */ (document.getElementById('upload-target-account')),
    uploadAccountSelectorContainer: /** @type {HTMLElement} */ (document.getElementById('upload-account-selector-container')),
    uploadTargetAccountSkeleton: /** @type {HTMLElement} */ (document.getElementById('upload-target-account-skeleton')),
    btnParseSkeleton: /** @type {HTMLElement} */ (document.getElementById('btn-parse-skeleton')),
    btnCamera: /** @type {HTMLLabelElement} */ (document.getElementById('btn-camera')),
    cameraCapture: /** @type {HTMLInputElement} */ (document.getElementById('camera-capture')),

    // Edit State
    editDate: /** @type {HTMLInputElement} */ (document.getElementById('edit-date')),
    editStore: /** @type {HTMLInputElement} */ (document.getElementById('edit-store')),
    itemsContainer: /** @type {HTMLElement} */ (document.getElementById('items-container')),
    btnAddItem: /** @type {HTMLButtonElement} */ (document.getElementById('btn-add-item')),
    totalAmount: /** @type {HTMLElement} */ (document.getElementById('total-amount')),
    btnRegister: /** @type {HTMLButtonElement} */ (document.getElementById('btn-register')),
    btnSkip: /** @type {HTMLButtonElement} */ (document.getElementById('btn-skip')),
    btnRegisterCount: /** @type {HTMLElement} */ (document.getElementById('btn-register-count')),
    editTargetAccount: /** @type {HTMLSelectElement} */ (document.getElementById('edit-target-account')),
    editFromAccount: /** @type {HTMLSelectElement} */ (document.getElementById('edit-from-account')),
    receiptThumbnail: /** @type {HTMLImageElement} */ (document.getElementById('receipt-thumbnail')),
    receiptThumbnailContainer: /** @type {HTMLElement} */ (document.getElementById('receipt-thumbnail-container')),

    // Success State
    btnReset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset')),
    successReceiptId: /** @type {HTMLElement} */ (document.getElementById('success-receipt-id')),
    successReceiptIdContainer: /** @type {HTMLElement} */ (document.getElementById('success-receipt-id-container')),
    editReceiptId: /** @type {HTMLElement} */ (document.getElementById('edit-receipt-id')),

    // Loading overlay
    loadingOverlay: /** @type {HTMLElement} */ (document.getElementById('loading-overlay')),
    loadingText: /** @type {HTMLElement} */ (document.getElementById('loading-text')),

    // --- History Copy Elements ---
    copyStepConfig: /** @type {HTMLElement} */ (document.getElementById('copy-step-config')),
    copyStepList: /** @type {HTMLElement} */ (document.getElementById('copy-step-list')),
    copyStepDest: /** @type {HTMLElement} */ (document.getElementById('copy-step-dest')),
    copyStepSuccess: /** @type {HTMLElement} */ (document.getElementById('copy-step-success')),

    sourceAccountSelect: /** @type {HTMLSelectElement} */ (document.getElementById('source-account-select')),
    destAccountSelect: /** @type {HTMLSelectElement} */ (document.getElementById('dest-account-select')),
    destInternalAccountSelect: /** @type {HTMLSelectElement} */ (document.getElementById('dest-internal-account-select')),
    historyPeriodSelect: /** @type {HTMLSelectElement} */ (document.getElementById('history-period-select')),
    periodMonthInputContainer: /** @type {HTMLElement} */ (document.getElementById('period-month-input-container')),
    periodMonthInput: /** @type {HTMLInputElement} */ (document.getElementById('period-month-input')),
    periodCustomInputContainer: /** @type {HTMLElement} */ (document.getElementById('period-custom-input-container')),
    periodStartInput: /** @type {HTMLInputElement} */ (document.getElementById('period-start-input')),
    periodEndInput: /** @type {HTMLInputElement} */ (document.getElementById('period-end-input')),
    sourceAccountSkeleton: /** @type {HTMLElement} */ (document.getElementById('source-account-skeleton')),
    btnFetchHistorySkeleton: /** @type {HTMLElement} */ (document.getElementById('btn-fetch-history-skeleton')),
    btnFetchHistory: /** @type {HTMLButtonElement} */ (document.getElementById('btn-fetch-history')),
    historyListContainer: /** @type {HTMLElement} */ (document.getElementById('history-list-container')),
    btnSelectAll: /** @type {HTMLButtonElement} */ (document.getElementById('btn-select-all')),
    btnPrepareCopy: /** @type {HTMLButtonElement} */ (document.getElementById('btn-prepare-copy')),
    selectedCopyCount: /** @type {HTMLElement} */ (document.getElementById('selected-copy-count')),
    btnResetCopy: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-copy')),

    copyConfirmModal: /** @type {HTMLElement} */ (document.getElementById('copy-confirm-modal')),
    copyConfirmModalContent: /** @type {HTMLElement} */ (document.getElementById('copy-confirm-modal-content')),
    btnCloseModal: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-modal')),
    splashScreen: /** @type {HTMLElement} */ (document.getElementById('splash-screen')),
    confirmDestName: /** @type {HTMLElement} */ (document.getElementById('confirm-dest-name')),
    confirmListContainer: /** @type {HTMLElement} */ (document.getElementById('confirm-list-container')),
    btnExecuteCopy: /** @type {HTMLButtonElement} */ (document.getElementById('btn-execute-copy')),

    // Lightbox
    lightboxModal: /** @type {HTMLElement} */ (document.getElementById('lightbox-modal')),
    lightboxImage: /** @type {HTMLImageElement} */ (document.getElementById('lightbox-image')),
    lightboxClose: /** @type {HTMLButtonElement} */ (document.getElementById('lightbox-close')),

    // Snackbar
    snackbar: /** @type {HTMLElement} */ (document.getElementById('snackbar')),
    btnUndo: /** @type {HTMLButtonElement} */ (document.getElementById('btn-undo')),

    // Batch Progress
    batchProgressContainer: /** @type {HTMLElement} */ (document.getElementById('batch-progress-container')),
    batchProgressText: /** @type {HTMLElement} */ (document.getElementById('batch-progress-text')),
    batchStatusParsing: /** @type {HTMLElement} */ (document.getElementById('batch-status-parsing')),
    batchStatusComplete: /** @type {HTMLElement} */ (document.getElementById('batch-status-complete')),

    // Toast
    toastContainer: /** @type {HTMLElement} */ (document.getElementById('toast-container')),

    // Confirm Modal
    confirmModal: /** @type {HTMLElement} */ (document.getElementById('confirm-modal')),
    confirmModalContent: /** @type {HTMLElement} */ (document.getElementById('confirm-modal-content')),
    confirmTitle: /** @type {HTMLElement} */ (document.getElementById('confirm-title')),
    confirmMessage: /** @type {HTMLElement} */ (document.getElementById('confirm-message')),
    confirmBtnOk: /** @type {HTMLButtonElement} */ (document.getElementById('confirm-btn-ok')),
    confirmBtnCancel: /** @type {HTMLButtonElement} */ (document.getElementById('confirm-btn-cancel')),

    // --- Auth & Settings ---
    loginOverlay: /** @type {HTMLElement} */ (document.getElementById('login-overlay')),
    btnGoogleLogin: /** @type {HTMLButtonElement} */ (document.getElementById('btn-google-login')),
    userProfile: /** @type {HTMLElement} */ (document.getElementById('user-profile')),
    userAvatar: /** @type {HTMLImageElement} */ (document.getElementById('user-avatar')),
    btnUserAvatar: /** @type {HTMLButtonElement} */ (document.getElementById('btn-user-avatar')),
    avatarDropdown: /** @type {HTMLElement} */ (document.getElementById('avatar-dropdown')),
    menuItemLogout: /** @type {HTMLButtonElement} */ (document.getElementById('menu-item-logout')),
    menuItemDeleteAccount: /** @type {HTMLButtonElement} */ (document.getElementById('menu-item-delete-account')),

    btnZaimSettings: /** @type {HTMLButtonElement} */ (document.getElementById('btn-zaim-settings')),
    settingsDropdown: /** @type {HTMLElement} */ (document.getElementById('settings-dropdown')),
    menuItemZaimCreds: /** @type {HTMLButtonElement} */ (document.getElementById('menu-item-zaim-creds')),

    // Zaim Creds Modal
    zaimCredsModal: /** @type {HTMLElement} */ (document.getElementById('zaim-creds-modal')),
    btnCloseCreds: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-creds')),
    zaimAccountName: /** @type {HTMLInputElement} */ (document.getElementById('zaim-account-name')),
    btnZaimConnect: /** @type {HTMLButtonElement} */ (document.getElementById('btn-zaim-connect')),

    // Gemini Creds Modal
    menuItemGeminiCreds: /** @type {HTMLButtonElement} */ (document.getElementById('menu-item-gemini-creds')),
    geminiCredsModal: /** @type {HTMLElement} */ (document.getElementById('gemini-creds-modal')),
    btnCloseGeminiCreds: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-gemini-creds')),
    btnSaveGeminiCreds: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-gemini-creds')),
    btnDeleteGeminiCreds: /** @type {HTMLButtonElement} */ (document.getElementById('btn-delete-gemini-creds')),
    btnCancelGeminiCreds: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-gemini-creds')),
    geminiApiKey: /** @type {HTMLInputElement} */ (document.getElementById('gemini-api-key')),
    geminiKeyStatus: /** @type {HTMLElement} */ (document.getElementById('gemini-key-status')),

    // Multi-Account elements
    zaimAccountsList: /** @type {HTMLElement} */ (document.getElementById('zaim-accounts-list')),
    btnAddNewAccount: /** @type {HTMLButtonElement} */ (document.getElementById('btn-add-new-account')),
    btnDeleteCreds: /** @type {HTMLButtonElement} */ (document.getElementById('btn-delete-creds')),
    btnCancelCreds: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-creds')),
    zaimFormContainer: /** @type {HTMLElement} */ (document.getElementById('zaim-form-container')),
    zaimButtonsContainer: /** @type {HTMLElement} */ (document.getElementById('zaim-buttons-container')),
    btnCopyGuideZaim: /** @type {HTMLButtonElement} */ (document.getElementById('btn-copy-guide-zaim')),
    btnCopyGuideGemini: /** @type {HTMLButtonElement} */ (document.getElementById('btn-copy-guide-gemini')),
    btnBulkMenu: /** @type {HTMLButtonElement} */ (document.getElementById('btn-bulk-menu')),
    bulkMenuDropdown: /** @type {HTMLElement} */ (document.getElementById('bulk-menu-dropdown')),
    bulkMenuCategories: /** @type {HTMLElement} */ (document.getElementById('bulk-menu-categories')),
    bulkMenuGenres: /** @type {HTMLElement} */ (document.getElementById('bulk-menu-genres')),
    btnSaveZaimCreds: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-zaim-creds')),
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
