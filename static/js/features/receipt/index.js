import { appState } from '../../state.js';
import { EL, showToast, showLoading, hideLoading, showConfirm, switchState } from '../../utils/dom.js';
import { getPrefixedKey } from '../../utils/common.js';
import { sendGAEvent } from '../../utils/analytics.js';
import { openGeminiSettings, closeSettingsDropdown } from '../settings.js';

import { handleImageFiles, advanceQueue, startBackgroundParsing } from './queue.js';
import { setupEditState, resetApp, renderItemsList, undoDeletion, loadZaimAccounts } from './ui.js';
import { registerReceiptData } from './api.js';

// Re-export for potential external use
export { resetApp };

let receiptFeaturesInitialized = false;

export const initReceiptFeatures = () => {
    if (receiptFeaturesInitialized) return;
    receiptFeaturesInitialized = true;

    // --- Inline Handlers Helper ---
    window['showBulkMenuGenres'] = (catId) => {
        if (!appState.parsedData) return;
        const categoryButtons = EL.bulkMenuCategories.querySelectorAll('.bulk-menu-item');
        const cat = appState.parsedData.master_categories.find(c => c.id == catId);
        if (!cat) return;

        categoryButtons.forEach(btn => {
            if (btn.textContent.trim().includes(cat.name)) {
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

    window['applyBulkCategoryGenre'] = async (catId, genId, genName) => {
        if (!appState.parsedData) return;
        const data = appState.parsedData;
        const cat = data.master_categories.find(c => c.id == catId);
        if (!cat) return;

        const confirmMsg = `全品目のカテゴリを「${cat.name} / ${genName}」に変更しますか？`;
        EL.bulkMenuDropdown.classList.remove('show');
        const confirmed = await showConfirm("一括変更の確認", confirmMsg);
        if (!confirmed || data !== appState.parsedData) return;

        data.items.forEach(item => {
            if (!item.deleted) {
                item.category_id = catId;
                item.genre_id = genId;
            }
        });
        if (data === appState.parsedData) {
            renderItemsList();
            showToast("すべてのカテゴリ・ジャンルを更新しました。", "success");
        }
        EL.bulkMenuDropdown.classList.remove('show');
    };

    // DOM Level 2 Event Listeners
    EL.receiptThumbnailContainer.addEventListener('click', () => {
        if (!appState.currentImageUri) return;
        EL.lightboxImage.src = appState.currentImageUri;
        EL.lightboxModal.classList.remove('hidden');
        void EL.lightboxModal.offsetWidth; // Force reflow
        EL.lightboxModal.classList.remove('opacity-0');
    });

    EL.lightboxClose.addEventListener('click', () => {
        EL.lightboxModal.classList.add('opacity-0');
        setTimeout(() => {
            EL.lightboxModal.classList.add('hidden');
            EL.lightboxImage.src = "";
        }, 300);
    });

    EL.lightboxModal.addEventListener('click', (e) => {
        if (e.target !== EL.lightboxImage) {
            EL.lightboxClose.click();
        }
    });

    EL.imageUpload.addEventListener('change', async (e) => {
        await handleImageFiles(Array.from(/** @type {HTMLInputElement} */(e.target).files));
    });

    EL.btnCamera.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        EL.cameraCapture.click();
    });

    EL.cameraCapture.addEventListener('change', async (e) => {
        await handleImageFiles(Array.from(/** @type {HTMLInputElement} */(e.target).files));
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
        if (!EL.bulkMenuDropdown.contains(/** @type {Node} */(e.target)) && e.target !== EL.btnBulkMenu) {
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
        if (!appState.parsedData) return;
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
        const inputDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(today.getMonth() - 1);
        oneMonthAgo.setHours(0, 0, 0, 0);

        if (inputDate > today || inputDate < oneMonthAgo) {
            const dateStr = appState.parsedData.date.replace(/-/g, '/');
            const alertMsg = inputDate > today
                ? `未来の日付（${dateStr}）が指定されています。`
                : `1か月以上前の日付（${dateStr}）が指定されています。`;
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
            let shouldHideLoading = true;
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

                const result = await registerReceiptData(payload);

                if (result.status === 'warning' && result.duplicate_found) {
                    hideLoading();
                    const confirmMessage = "⚠️ 既に同じ日付・金額の支出がZaimに登録されている可能性があります。\n本当に登録しますか？";
                    if (await showConfirm("二重登録の確認", confirmMessage)) {
                        await performRegistration(true);
                    }
                    shouldHideLoading = false;
                    return;
                }

                localStorage.setItem(getPrefixedKey('last_used_zaim_profile_parser'), targetAccountId);
                localStorage.setItem(getPrefixedKey(`last_used_payment_source_id_${targetAccountId}`), EL.editFromAccount.value);
                sendGAEvent('save_receipt_result');

                if (appState.currentQueueIndex !== -1 && appState.queue.length > 1) {
                    advanceQueue();
                    shouldHideLoading = false; 
                } else {
                    EL.successReceiptIdContainer.classList.remove('hidden');
                    EL.successReceiptId.textContent = String(appState.parsedData.receipt_id);
                    switchState('state-success');
                }
            } catch (err) {
                console.error(err);
                showToast(err.message || '登録中にエラーが発生しました', 'error');
            } finally {
                if (shouldHideLoading) hideLoading();
            }
        };
        await performRegistration(false);
    });

    EL.btnReset.addEventListener('click', resetApp);
    EL.btnSkip.addEventListener('click', () => {
        if (appState.currentQueueIndex !== -1 && appState.queue.length > 1) {
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
