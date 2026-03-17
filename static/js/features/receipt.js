import { appState } from '../state.js';
import { EL, showToast, showLoading, hideLoading, switchState, showConfirm } from '../utils/dom.js';
import { apiFetch } from '../api/backend.js';
import { getPrefixedKey, sleep } from '../utils/common.js';
import { sendGAEvent } from '../utils/analytics.js';
import { getZaimMasterData } from '../api/zaim.js';
import { openGeminiSettings, closeSettingsDropdown } from './settings.js';

// --- Image Compression & Resizing ---
export async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;
        img.onload = () => {
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
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(dataUrl);
        };
        img.onerror = error => {
            URL.revokeObjectURL(objectUrl);
            reject(error);
        };
    });
}

// --- Event Listeners & Core Logic ---

export const handleImageFiles = async (files) => {
    if (files.length === 0) return;

    appState.queue = files.map(file => ({
        file,
        status: 'idle',
        result: null,
        blobUri: URL.createObjectURL(file),
        compressedBase64: null
    }));
    appState.currentQueueIndex = 0;

    appState.currentImageUri = appState.queue[0].blobUri;
    EL.imagePreview.src = appState.currentImageUri;
    EL.imagePreviewContainer.classList.remove('hidden');
    EL.btnParse.classList.remove('hidden');
    EL.btnParse.disabled = true;

    updateBatchProgressUI();

    try {
        showLoading('画像を最適化中...');
        appState.queue[0].compressedBase64 = await compressImage(appState.queue[0].file);
        appState.compressedImageBase64 = appState.queue[0].compressedBase64;
        EL.btnParse.disabled = false;
        hideLoading();

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

export async function startBackgroundParsing() {
    if (appState.isParsingLoopRunning) return;
    appState.isParsingLoopRunning = true;

    for (let i = 0; i < appState.queue.length; i++) {
        const item = appState.queue[i];
        if (item.status !== 'idle') continue;

        item.status = 'parsing';
        updateBatchProgressUI();

        try {
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
                if (response.status === 429) {
                    showToast(errorDetail || "Geminiのレートリミットに達しました。時間を置いてから再度お試しください。", 'warning');
                    resetApp();
                    return;
                } else if (response.status === 400 && errorDetail.includes("API Key is not configured")) {
                    showToast("Gemini APIキーが設定されていません。設定画面を開きます。", 'warning');
                    resetApp();
                    openGeminiSettings();
                    return;
                }
                throw new Error(errorDetail);
            }
            item.result = await response.json();

            if (item.result.point_usage > 0) {
                item.result.items.push({
                    name: "ポイント利用",
                    price: -item.result.point_usage,
                    category_id: item.result.items.length > 0 ? item.result.items[0].category_id : 101,
                    genre_id: item.result.items.length > 0 ? item.result.items[0].genre_id : 10101
                });
                item.result.point_usage = 0;
            }

            item.status = 'complete';
        } catch (err) {
            console.error(`Failed to parse item ${i}:`, err);
            item.status = 'error';
            item.result = { error: err.message };

            if (i === appState.currentQueueIndex && !EL.loadingOverlay.classList.contains('hidden')) {
                hideLoading();
                showToast("解析に失敗しました。時間をおいてから再度お試しください。\n詳細: " + (err.message || "不明なエラー"), 'error');
                resetApp();
                return;
            }
        }

        updateBatchProgressUI();

        if (i === appState.currentQueueIndex && !EL.loadingOverlay.classList.contains('hidden')) {
            hideLoading();
            setupEditState(item.result);
        }

        if (i < appState.queue.length - 1) {
            await sleep(1000);
        }
    }
    appState.isParsingLoopRunning = false;
}

export function advanceQueue() {
    appState.currentQueueIndex++;

    if (appState.currentQueueIndex >= appState.queue.length) {
        appState.currentQueueIndex = -1;
        appState.queue = [];
        updateBatchProgressUI();
        switchState('state-success');
        return;
    }

    const nextItem = appState.queue[appState.currentQueueIndex];
    updateBatchProgressUI();
    appState.currentImageUri = nextItem.blobUri;
    EL.imagePreview.src = appState.currentImageUri;

    if (nextItem.status === 'complete') {
        setupEditState(nextItem.result);
    } else if (nextItem.status === 'error') {
        showToast("この画像の解析に失敗していました。スキップするか、撮り直してください。", 'warning');
        setupEditState({ date: "", store: "", items: [] });
    } else {
        showLoading("解析結果を待機中...");
    }
}

export async function setupEditState(data) {
    if (!data.receipt_id) {
        const now = Math.floor(Date.now() / 1000);
        data.receipt_id = Math.max(now, appState.lastReceiptId + 1);
        appState.lastReceiptId = data.receipt_id;
    }
    appState.parsedData = data;
    EL.editReceiptId.textContent = `ID: ${data.receipt_id}`;

    await loadZaimAccounts();

    EL.editDate.value = data.date || "";
    EL.editStore.value = data.store || "";

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

        requestAnimationFrame(() => {
            setTimeout(setImage, 50);
        });
    } else {
        EL.receiptThumbnailContainer.classList.add('hidden');
    }

    switchState('state-edit');
}

export async function loadZaimAccounts() {
    try {
        const targetAccountId = EL.editTargetAccount.value || "1";
        const { accounts, masterData } = await getZaimMasterData(targetAccountId);

        let optionsHtml = '<option value="">未指定（出金元なし）</option>';
        accounts.forEach(a => {
            optionsHtml += `<option value="${a.id}">${a.name}</option>`;
        });
        EL.editFromAccount.innerHTML = optionsHtml;

        if (appState.parsedData) {
            appState.parsedData.master_categories = masterData.master_categories;
            appState.parsedData.master_genres = masterData.master_genres;

            appState.parsedData.items.forEach(item => {
                if (item.deleted) return;

                const catExists = masterData.master_categories.some(c => c.id == item.category_id);
                if (!catExists) {
                    item.category_id = 199;
                }

                const isGenreValid = masterData.master_genres.some(g => g.id == item.genre_id && g.category_id == item.category_id);
                if (!isGenreValid) {
                    const genre99 = item.category_id * 100 + 99;
                    const hasGenre99 = masterData.master_genres.some(g => g.id == genre99 && g.category_id == item.category_id);
                    const has19905 = masterData.master_genres.some(g => g.id == 19905 && g.category_id == 199);

                    if (item.category_id == 199 && has19905) {
                        item.genre_id = 19905;
                    } else if (hasGenre99) {
                        item.genre_id = genre99;
                    } else {
                        const firstGenre = masterData.master_genres.find(g => g.category_id == item.category_id);
                        if (firstGenre) {
                            item.genre_id = firstGenre.id;
                        }
                    }
                }
            });

            renderItemsList();
            renderBulkMenuCategories(masterData.master_categories);
        }

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
        throw err;
    }
}


export function renderItemsList() {
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

// --- Initialize Event Listeners ---

export const initReceiptFeatures = () => {
    // Attach globals for inline HTML event handlers
    window.removeItem = (index) => {
        if (appState.deletionTimer) clearTimeout(appState.deletionTimer);
        appState.lastDeleted = {
            item: appState.parsedData.items[index],
            index: index
        };
        appState.parsedData.items[index].deleted = true;
        renderItemsList();
        EL.snackbar.classList.remove('hidden');
        EL.snackbar.classList.add('show');
        EL.snackbar.classList.remove('snackbar-fade-out');
        appState.deletionTimer = setTimeout(finalizeDeletion, 5000);
    };

    window.updateItemName = (index, name) => {
        appState.parsedData.items[index].name = name;
    };

    window.updateItemPrice = (index, price) => {
        appState.parsedData.items[index].price = parseInt(price) || 0;
        renderItemsList();
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

    window.showBulkMenuGenres = (catId) => {
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
        EL.bulkMenuDropdown.classList.remove('show');
        const confirmed = await showConfirm("一括変更の確認", confirmMsg);
        if (!confirmed) return;

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

    // DOM Level 2 Event Listeners
    EL.imageUpload.addEventListener('change', async (e) => {
        await handleImageFiles(Array.from(e.target.files));
    });

    EL.btnCamera.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        EL.cameraCapture.click();
    });

    EL.cameraCapture.addEventListener('change', async (e) => {
        await handleImageFiles(Array.from(e.target.files));
    });

    EL.btnParse.addEventListener('click', async () => {
        if (appState.currentQueueIndex === -1) return;
        startBackgroundParsing();
        sendGAEvent('execute_receipt_analysis');
        const currentItem = appState.queue[appState.currentQueueIndex];
        if (currentItem.status === 'complete') {
            setupEditState(currentItem.result);
        } else {
            showLoading('AIでレシートを解析中...');
        }
    });

    EL.btnManualEntry.addEventListener('click', () => {
        appState.currentImageUri = null;
        EL.receiptThumbnail.src = "";
        EL.receiptThumbnailContainer.classList.add('hidden');
        const today = new Date().toISOString().split('T')[0];
        const initialData = {
            date: today,
            store: "",
            items: [{ name: "", price: 0, category_id: 199, genre_id: 19905, deleted: false }],
            master_categories: [],
            master_genres: []
        };
        setupEditState(initialData);
    });

    EL.btnUndo.addEventListener('click', undoDeletion);

    EL.btnBulkMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSettingsDropdown();
        if (EL.avatarDropdown && !EL.avatarDropdown.classList.contains('hidden')) {
            EL.avatarDropdown.classList.remove('opacity-100', 'scale-100');
            EL.avatarDropdown.classList.add('opacity-0', 'scale-95');
            setTimeout(() => EL.avatarDropdown.classList.add('hidden'), 200);
        }
        EL.bulkMenuDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!EL.bulkMenuDropdown.contains(e.target) && e.target !== EL.btnBulkMenu) {
            EL.bulkMenuDropdown.classList.remove('show');
        }
    });

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

    EL.btnRegister.addEventListener('click', async () => {
        appState.parsedData.date = EL.editDate.value;
        appState.parsedData.store = EL.editStore.value;
        appState.parsedData.point_usage = 0;

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

        itemsToRegister.forEach(item => {
            if (item.name.trim() === '') item.name = '支出';
        });

        const performRegistration = async (force = false) => {
            showLoading(force ? '強制的に登録中...' : 'Zaimに登録中...');
            try {
                const targetAccountId = EL.editTargetAccount.value;
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
                sendGAEvent('save_receipt_result');

                if (appState.currentQueueIndex !== -1 && appState.queue.length > 1) {
                    hideLoading();
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

    EL.btnReset.addEventListener('click', resetApp);
    EL.btnSkip.addEventListener('click', () => {
        if (appState.currentQueueIndex !== -1 && appState.queue.length > 1) {
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

    // Handle target account changes sync
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
};
