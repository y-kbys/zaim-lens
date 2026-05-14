import { appState } from '../../state.js';
import { EL, showToast, showLoading, hideLoading, switchState, generateCategoryOptions, generateGenreOptions } from '../../utils/dom.js';
import { getPrefixedKey } from '../../utils/common.js';
import { getZaimMasterData } from '../../api/zaim.js';

let currentSetupRequestId = 0;

export function updateBatchProgressUI() {
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
    updateBatchProgressUI();

    EL.imageUpload.value = '';
    EL.imagePreviewContainer.classList.add('hidden');
    EL.btnParse.classList.add('hidden');
    EL.btnParse.disabled = true;
    EL.successReceiptIdContainer.classList.add('hidden');
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
                targetAccountId = "1"; // Absolute last resort, though unlikely to work if user has no account "1"
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
                    // Try default fallback (category*100 + 99)
                    const genre99 = item.category_id * 100 + 99;
                    const exists99 = masterData.master_genres.find(g => g.id == genre99 && g.category_id == item.category_id);
                    if (exists99) {
                        item.genre_id = genre99;
                    } else {
                        // If even fallback doesn't exist, pick the first genre of the category
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
    } catch (err) {
        console.error("Failed to load Zaim accounts/categories", err);
        EL.editFromAccount.innerHTML = '<option value="">読込失敗</option>';
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

    switchState('state-edit');
}

export function renderItemsList() {
    const data = appState.parsedData;
    if (!data) return;

    EL.itemsContainer.innerHTML = '';
    let total = 0;
    let visibleCount = 0;

    data.items.forEach((item, index) => {
        if (item.deleted) return;
        total += Number(item.price);
        visibleCount++;

        const itemRow = document.createElement('div');
        itemRow.className = "flex flex-col space-y-2 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 shadow-sm transition-colors";
        itemRow.innerHTML = `
            <div class="flex items-center space-x-2">
                <button class="delete-btn text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
                <input type="text" class="name-input flex-grow min-w-0 p-2 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent dark:text-gray-100 transition-colors" value="${item.name}">
                <div class="relative flex-shrink-0 transition-all duration-200" style="width: calc(${Math.max(3, String(item.price).length)}ch + 2.5rem);">
                    <span class="absolute left-2 top-2 ${Number(item.price) < 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'} text-sm">¥</span>
                    <input type="number" class="price-input w-full p-2 pl-6 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-right bg-transparent ${Number(item.price) < 0 ? 'text-red-600 dark:text-red-400' : 'dark:text-gray-100'} transition-colors" value="${item.price}">
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
        const nameInput = itemRow.querySelector('.name-input');
        const priceInput = itemRow.querySelector('.price-input');
        const catSelect = itemRow.querySelector('.cat-select');
        const genSelect = itemRow.querySelector('.gen-select');

        deleteBtn.addEventListener('click', () => {
            if (appState.deletionTimer) clearTimeout(appState.deletionTimer);
            appState.lastDeleted = { item, index };
            item.deleted = true;
            if (data === appState.parsedData) {
                renderItemsList();
                EL.snackbar.classList.remove('hidden');
                EL.snackbar.classList.add('show');
                EL.snackbar.classList.remove('snackbar-fade-out');
                appState.deletionTimer = setTimeout(finalizeDeletion, 5000);
            }
        });

        nameInput.addEventListener('focus', (e) => e.target.select());
        nameInput.addEventListener('change', (e) => {
            item.name = e.target.value;
        });

        priceInput.addEventListener('focus', (e) => e.target.select());
        priceInput.addEventListener('input', (e) => {
            e.target.parentElement.style.width = `calc(${Math.max(3, e.target.value.length)}ch + 2.5rem)`;
        });
        priceInput.addEventListener('change', (e) => {
            item.price = parseInt(e.target.value) || 0;
            if (data === appState.parsedData) renderItemsList();
        });

        catSelect.addEventListener('change', (e) => {
            const catId = parseInt(e.target.value);
            item.category_id = catId;
            const genres = data.master_genres ? data.master_genres.filter(g => g.category_id == catId) : [];
            item.genre_id = genres.length > 0 ? genres[0].id : 0;
            if (data === appState.parsedData) renderItemsList();
        });

        genSelect.addEventListener('change', (e) => {
            item.genre_id = parseInt(e.target.value);
        });

        EL.itemsContainer.appendChild(itemRow);
    });

    EL.totalAmount.textContent = `¥${total.toLocaleString()}`;
    EL.btnRegisterCount.textContent = String(visibleCount);
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
