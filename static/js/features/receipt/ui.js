import { appState } from '../../state.js';
import { EL, showToast, showLoading, hideLoading, switchState, generateCategoryOptions, generateGenreOptions } from '../../utils/dom.js';
import { getPrefixedKey } from '../../utils/common.js';
import { getZaimMasterData } from '../../api/zaim.js';
import { selectQueueItem, removeQueueItem } from './queue.js';

let currentSetupRequestId = 0;

/**
 * Pure validation logic for receipt edit state
 * @param {{ date?: string, items?: Array<{ name?: string, price?: number|string, deleted?: boolean }> }} data
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
 * Validates DOM form inputs and updates UI highlights & register button state
 */
export function validateReceiptForm() {
    if (!appState.parsedData) {
        if (EL.btnRegister) {
            EL.btnRegister.disabled = true;
            EL.btnRegister.classList.add('opacity-50', 'cursor-not-allowed');
        }
        return { isValid: false, hasDate: false, validItemCount: 0, invalidItemIndices: [] };
    }

    if (EL.editDate) {
        appState.parsedData.date = EL.editDate.value;
    }

    const result = validateReceiptData(appState.parsedData);

    // Date highlight
    if (EL.editDate) {
        if (!result.hasDate && EL.editDate.value.trim() === '') {
            EL.editDate.classList.add('border-red-500', 'ring-1', 'ring-red-500');
        } else {
            EL.editDate.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
        }
    }

    // Item highlights
    const itemRows = EL.itemsContainer ? EL.itemsContainer.children : [];
    let activeIndex = 0;
    (appState.parsedData.items || []).forEach((item, idx) => {
        if (item.deleted) return;
        const row = itemRows[activeIndex];
        if (row) {
            const nameInput = row.querySelector('.name-input');
            const priceInput = row.querySelector('.price-input');
            const isInvalid = result.invalidItemIndices.includes(idx);
            if (isInvalid) {
                if (!item.name || !item.name.trim()) {
                    nameInput?.classList.add('border-red-500', 'ring-1', 'ring-red-500');
                } else {
                    nameInput?.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
                }
                const rawPrice = item.price;
                const numPrice = Number(rawPrice);
                if (rawPrice === '' || !Number.isInteger(numPrice)) {
                    priceInput?.classList.add('border-red-500', 'ring-1', 'ring-red-500');
                } else {
                    priceInput?.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
                }
            } else {
                nameInput?.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
                priceInput?.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
            }
        }
        activeIndex++;
    });

    if (EL.btnRegister) {
        EL.btnRegister.disabled = !result.isValid;
        if (!result.isValid) {
            EL.btnRegister.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            EL.btnRegister.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    return result;
}

/**
 * Update unlinked guide banner visibility
 */
export function updateUnlinkedBannerState() {
    if (!EL.unlinkedGuideBanner) return;
    const isUnlinked = !appState.accounts || appState.accounts.length === 0;
    if (isUnlinked) {
        EL.unlinkedGuideBanner.classList.remove('hidden');
        if (EL.btnParse) {
            EL.btnParse.disabled = true;
            EL.btnParse.classList.add('opacity-50', 'cursor-not-allowed');
        }
    } else {
        EL.unlinkedGuideBanner.classList.add('hidden');
        if (EL.btnParse && appState.queue && appState.queue.length > 0) {
            EL.btnParse.disabled = false;
            EL.btnParse.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

/**
 * Render horizontal queue thumbnail chips
 */
export function renderQueueThumbnails() {
    if (!EL.queueThumbnailsContainer) return;

    if (!appState.queue || appState.queue.length <= 1) {
        EL.queueThumbnailsContainer.classList.add('hidden');
        EL.queueThumbnailsContainer.innerHTML = '';
        return;
    }

    EL.queueThumbnailsContainer.classList.remove('hidden');
    EL.queueThumbnailsContainer.innerHTML = '';

    appState.queue.forEach((item, idx) => {
        const isActive = idx === appState.currentQueueIndex;
        const chip = document.createElement('div');
        chip.className = `flex-shrink-0 flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
            isActive
                ? 'bg-blue-100 dark:bg-blue-900/60 border-blue-500 text-blue-900 dark:text-blue-100 shadow-sm font-bold scale-[1.02]'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`;

        let statusIcon = '<i class="fa-regular fa-clock text-gray-400"></i>';
        if (item.status === 'parsing') {
            statusIcon = '<i class="fa-solid fa-spinner fa-spin text-blue-500"></i>';
        } else if (item.status === 'complete') {
            statusIcon = '<i class="fa-solid fa-circle-check text-green-500"></i>';
        } else if (item.status === 'error') {
            statusIcon = '<i class="fa-solid fa-circle-exclamation text-red-500"></i>';
        }

        chip.innerHTML = `
            ${statusIcon}
            <span>#${idx + 1}</span>
            <button type="button" class="delete-chip-btn text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 ml-1 transition-colors" title="このレシートを削除">
                <i class="fa-solid fa-xmark text-xs"></i>
            </button>
        `;

        chip.addEventListener('click', (e) => {
            if (/** @type {HTMLElement} */(e.target).closest('.delete-chip-btn')) {
                e.stopPropagation();
                removeQueueItem(idx);
            } else {
                selectQueueItem(idx);
            }
        });

        EL.queueThumbnailsContainer.appendChild(chip);
    });
}

export function updateBatchProgressUI() {
    renderQueueThumbnails();

    if (appState.currentQueueIndex === -1 || appState.queue.length <= 1) {
        EL.batchProgressContainer.classList.add('hidden');
        return;
    }

    EL.batchProgressContainer.classList.remove('hidden');
    const isAnalyzing = appState.queue.some(item => item.status !== 'idle');
    if (!isAnalyzing && !EL.stateUpload.classList.contains('hidden')) {
        EL.batchProgressText.textContent = `${appState.queue.length} 枚選択中`;
        EL.batchStatusParsing.classList.add('hidden');
        EL.batchStatusComplete.classList.add('hidden');
        return;
    }

    EL.batchProgressText.textContent = `${appState.currentQueueIndex + 1} / ${appState.queue.length} 枚目`;
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

export async function resetApp() {
    hideLoading();
    if (appState.deletionTimer) {
        clearTimeout(appState.deletionTimer);
        appState.deletionTimer = null;
    }
    appState.lastDeleted = null;
    EL.snackbar.classList.remove('show');
    EL.snackbar.classList.add('hidden');

    appState.compressedImageBase64 = null;
    appState.currentImageUri = null;
    appState.parsedData = null;
    appState.isParsingLoopRunning = false;

    appState.queue = [];
    appState.currentQueueIndex = -1;
    appState.registeredReceiptCount = 0;
    updateBatchProgressUI();

    EL.imageUpload.value = '';
    EL.imagePreviewContainer.classList.add('hidden');
    EL.btnParse.classList.add('hidden');
    EL.btnParse.disabled = true;
    EL.successReceiptIdContainer.classList.add('hidden');
    if (EL.btnParseRetry) EL.btnParseRetry.classList.add('hidden');

    updateUnlinkedBannerState();
    switchState('state-upload');
}

export async function loadZaimAccounts(targetData = null) {
    try {
        /** @type {string|number|null} */
        let targetAccountId = EL.editTargetAccount.value;
        if (!targetAccountId) {
            if (appState.accounts && appState.accounts.length > 0) {
                targetAccountId = appState.accounts[0].id;
            } else {
                targetAccountId = "1";
            }
        }
        const { accounts, masterData } = await getZaimMasterData(targetAccountId);

        let optionsHtml = '<option value="">未指定（出金元なし）</option>';
        accounts.forEach(a => {
            optionsHtml += `<option value="${a.id}">${a.name}</option>`;
        });
        EL.editFromAccount.innerHTML = optionsHtml;

        const data = targetData || appState.parsedData;
        if (data) {
            data.master_categories = masterData.master_categories;
            data.master_genres = masterData.master_genres;

            data.items.forEach(item => {
                if (item.deleted) return;

                const catExists = masterData.master_categories.some(c => c.id == item.category_id);
                if (!catExists) {
                    item.category_id = 199;
                }

                const isGenreValid = masterData.master_genres.some(g => g.id == item.genre_id && g.category_id == item.category_id);
                if (!isGenreValid) {
                    const genre99 = item.category_id * 100 + 99;
                    const exists99 = masterData.master_genres.find(g => g.id == genre99 && g.category_id == item.category_id);
                    if (exists99) {
                        item.genre_id = genre99;
                    } else {
                        const firstGenre = masterData.master_genres.find(g => g.category_id == item.category_id);
                        if (firstGenre) {
                            item.genre_id = firstGenre.id;
                        }
                    }
                }
            });

            if (data === appState.parsedData) {
                renderItemsList();
                renderBulkMenuCategories(masterData.master_categories);
            }
        }

        const storageKey = `last_used_payment_source_id_${targetAccountId}`;
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

        updateUnlinkedBannerState();
    } catch (err) {
        console.error("Failed to load Zaim accounts/categories", err);
        EL.editFromAccount.innerHTML = '<option value="">読込失敗</option>';
        updateUnlinkedBannerState();
        throw err;
    }
}

export async function setupEditState(data) {
    const requestId = ++currentSetupRequestId;

    if (!data) {
        EL.editDate.value = "";
        EL.editStore.value = "";
        EL.editReceiptId.textContent = "ID: 解析中...";
        EL.itemsContainer.innerHTML = '';
        EL.totalAmount.textContent = "¥0";
        EL.btnRegisterCount.textContent = "0";
        appState.parsedData = null;
        if (EL.btnParseRetry) EL.btnParseRetry.classList.add('hidden');
        validateReceiptForm();
        return;
    }

    if (!data.receipt_id) {
        const now = Math.floor(Date.now() / 1000);
        data.receipt_id = Math.max(now, appState.lastReceiptId + 1);
        appState.lastReceiptId = data.receipt_id;
    }
    appState.parsedData = JSON.parse(JSON.stringify(data));
    EL.editReceiptId.textContent = `ID: ${data.receipt_id}`;
    EL.editDate.value = data.date || "";
    EL.editStore.value = data.store || "";

    EL.itemsContainer.innerHTML = '';
    EL.totalAmount.textContent = "¥0";
    EL.btnRegisterCount.textContent = "0";
    EL.receiptThumbnailContainer.classList.add('hidden');

    EL.btnSkip.disabled = true;
    EL.btnRegister.disabled = true;
    try {
        await loadZaimAccounts(appState.parsedData);
    } finally {
        EL.btnSkip.disabled = false;
        EL.btnRegister.disabled = false;
    }

    if (requestId !== currentSetupRequestId || !appState.parsedData || appState.parsedData.receipt_id !== data.receipt_id) {
        return;
    }

    renderItemsList();

    // Show/hide retry button based on queue item status
    if (EL.btnParseRetry) {
        const currentItem = appState.queue[appState.currentQueueIndex];
        if (currentItem && currentItem.status === 'error') {
            EL.btnParseRetry.classList.remove('hidden');
        } else {
            EL.btnParseRetry.classList.add('hidden');
        }
    }

    if (appState.currentImageUri) {
        EL.receiptThumbnailContainer.classList.remove('hidden');
        EL.receiptThumbnailContainer.classList.add('thumbnail-loading');
        EL.receiptThumbnail.classList.add('opacity-0');

        const thumbnailUri = appState.currentImageUri;
        const setImage = () => {
            if (appState.currentImageUri !== thumbnailUri) return;
            EL.receiptThumbnail.onload = () => {
                EL.receiptThumbnailContainer.classList.remove('thumbnail-loading');
                EL.receiptThumbnail.classList.remove('opacity-0');
            };
            EL.receiptThumbnail.onerror = () => {
                EL.receiptThumbnailContainer.classList.remove('thumbnail-loading');
            };
            EL.receiptThumbnail.src = thumbnailUri;
        };

        requestAnimationFrame(() => {
            setTimeout(setImage, 50);
        });
    } else {
        EL.receiptThumbnailContainer.classList.add('hidden');
    }

    validateReceiptForm();
    switchState('state-edit');
}

/**
 * Calculates current total and item counts
 * @returns {{ subtotal: number, visibleCount: number }}
 */
export function calcTotal() {
    const data = appState.parsedData;
    if (!data || !data.items) return { subtotal: 0, visibleCount: 0 };

    let subtotal = 0;
    let visibleCount = 0;

    data.items.forEach(item => {
        if (item.deleted) return;
        subtotal += Number(item.price) || 0;
        visibleCount++;
    });

    return { subtotal, visibleCount };
}

export function renderItemsList() {
    const data = appState.parsedData;
    if (!data) return;

    EL.itemsContainer.innerHTML = '';
    const { subtotal, visibleCount } = calcTotal();

    data.items.forEach((item, index) => {
        if (item.deleted) return;

        const itemRow = document.createElement('div');
        itemRow.className = "flex flex-col space-y-2 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 shadow-sm transition-colors";
        itemRow.innerHTML = `
            <div class="flex items-center space-x-2">
                <button class="delete-btn text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="明細を削除">
                    <i class="fa-solid fa-trash"></i>
                </button>
                <input type="text" class="name-input flex-grow min-w-0 p-2 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent dark:text-gray-100 transition-colors" value="${item.name || ''}" placeholder="品目名">
                <div class="relative flex-shrink-0 transition-all duration-200" style="width: calc(${Math.max(3, String(item.price).length)}ch + 2.5rem);">
                    <span class="absolute left-2 top-2 ${Number(item.price) < 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'} text-sm">¥</span>
                    <input type="number" class="price-input w-full p-2 pl-6 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-right bg-transparent ${Number(item.price) < 0 ? 'text-red-600 dark:text-red-400' : 'dark:text-gray-100'} transition-colors" value="${item.price || 0}">
                </div>
            </div>
            <div class="flex items-center space-x-2 pl-10">
                <select class="cat-select flex-grow text-sm p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors">
                    ${generateCategoryOptions(data.master_categories, item.category_id)}
                </select>
                <select class="gen-select flex-grow text-sm p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors">
                    ${generateGenreOptions(data.master_genres, item.category_id, item.genre_id)}
                </select>
            </div>
        `;

        const deleteBtn = itemRow.querySelector('.delete-btn');
        const nameInput = /** @type {HTMLInputElement} */ (itemRow.querySelector('.name-input'));
        const priceInput = /** @type {HTMLInputElement} */ (itemRow.querySelector('.price-input'));
        const catSelect = /** @type {HTMLSelectElement} */ (itemRow.querySelector('.cat-select'));
        const genSelect = /** @type {HTMLSelectElement} */ (itemRow.querySelector('.gen-select'));

        deleteBtn.addEventListener('click', () => {
            if (appState.deletionTimer) clearTimeout(appState.deletionTimer);
            appState.lastDeleted = { item, index };
            item.deleted = true;
            if (data === appState.parsedData) {
                renderItemsList();
                validateReceiptForm();
                EL.snackbar.classList.remove('hidden');
                EL.snackbar.classList.add('show');
                EL.snackbar.classList.remove('snackbar-fade-out');
                appState.deletionTimer = setTimeout(finalizeDeletion, 5000);
            }
        });

        nameInput.addEventListener('focus', (e) => /** @type {HTMLInputElement} */(e.target).select());
        nameInput.addEventListener('input', (e) => {
            item.name = /** @type {HTMLInputElement} */(e.target).value;
            validateReceiptForm();
        });
        nameInput.addEventListener('change', (e) => {
            item.name = /** @type {HTMLInputElement} */(e.target).value;
            validateReceiptForm();
        });

        priceInput.addEventListener('focus', (e) => /** @type {HTMLInputElement} */(e.target).select());
        priceInput.addEventListener('input', (e) => {
            const val = /** @type {HTMLInputElement} */(e.target).value;
            /** @type {HTMLElement} */(/** @type {HTMLElement} */(e.target).parentElement).style.width = `calc(${Math.max(3, val.length)}ch + 2.5rem)`;
            item.price = val === '' ? '' : parseInt(val);
            validateReceiptForm();
        });
        priceInput.addEventListener('change', (e) => {
            item.price = parseInt(/** @type {HTMLInputElement} */(e.target).value) || 0;
            if (data === appState.parsedData) {
                renderItemsList();
                validateReceiptForm();
            }
        });

        catSelect.addEventListener('change', (e) => {
            const catId = parseInt(/** @type {HTMLSelectElement} */(e.target).value);
            item.category_id = catId;
            const genres = data.master_genres ? data.master_genres.filter(g => g.category_id == catId) : [];
            item.genre_id = genres.length > 0 ? genres[0].id : 0;
            if (data === appState.parsedData) {
                renderItemsList();
                validateReceiptForm();
            }
        });

        genSelect.addEventListener('change', (e) => {
            item.genre_id = parseInt(/** @type {HTMLSelectElement} */(e.target).value);
        });

        EL.itemsContainer.appendChild(itemRow);
    });

    EL.totalAmount.textContent = `¥${subtotal.toLocaleString()}`;
    EL.btnRegisterCount.textContent = String(visibleCount);
    validateReceiptForm();
}

export function finalizeDeletion() {
    EL.snackbar.classList.add('snackbar-fade-out');
    setTimeout(() => {
        EL.snackbar.classList.remove('show');
        EL.snackbar.classList.add('hidden');
    }, 300);
    appState.deletionTimer = null;
    appState.lastDeleted = null;
}

export function undoDeletion() {
    if (!appState.lastDeleted) return;
    if (appState.deletionTimer) {
        clearTimeout(appState.deletionTimer);
        appState.deletionTimer = null;
    }
    const { index } = appState.lastDeleted;
    delete appState.parsedData.items[index].deleted;
    appState.lastDeleted = null;
    renderItemsList();
    validateReceiptForm();
    EL.snackbar.classList.remove('show');
    EL.snackbar.classList.add('hidden');
}

export function renderBulkMenuCategories(categories) {
    if (!categories) return;
    EL.bulkMenuCategories.innerHTML = categories.map(c => `
        <button class="bulk-menu-item" onmouseenter="showBulkMenuGenres(${c.id})" onclick="showBulkMenuGenres(${c.id})">
            <i class="fa-solid fa-chevron-left mr-2 opacity-30"></i> ${c.name}
        </button>
    `).join('');
}
