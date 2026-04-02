import { appState } from '../state.js';
import { EL, showToast, showLoading, hideLoading, showConfirm, generateCategoryOptions, generateGenreOptions } from '../utils/dom.js';
import { apiFetch } from '../api/backend.js';
import { getPrefixedKey } from '../utils/common.js';
import { sendGAEvent } from '../utils/analytics.js';
import { updateDestAccountOptions, loadDestInternalAccounts } from '../api/zaim.js';

/**
 * Render list of fetched history items
 */
export function renderHistoryList() {
    EL.historyListContainer.innerHTML = '';

    if (appState.fetchedHistory.length === 0) {
        EL.historyListContainer.innerHTML = '<li class="text-gray-500 text-center py-4">履歴がありません</li>';
        return;
    }

    appState.fetchedHistory.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = "group relative p-3 bg-gray-50 dark:bg-gray-800/40 hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-all duration-200 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:scale-[1.01]";

        const dateStr = item.date.replace(/-/g, '/');
        const subText = [...item.items].reverse().map(i => i.name || "未設定").join(' / ');
        const catText = item.category_name || "未分類";

        li.innerHTML = `
            <label for="hist-${index}" class="flex items-start space-x-4 w-full cursor-pointer select-none">
                <div class="pt-1.5 shrink-0">
                    <input type="checkbox" id="hist-${index}" class="w-5 h-5 text-blue-600 rounded-lg border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 cursor-pointer transition-transform group-hover:scale-110" onchange="toggleHistorySelection(${index}, this.checked)">
                </div>
                <div class="flex-grow flex justify-between items-center min-w-0">
                    <div class="flex-grow min-w-0 mr-3">
                        <div class="font-bold text-gray-800 dark:text-gray-100 flex items-center space-x-2">
                            <span class="truncate text-sm sm:text-base">${catText}</span>
                            ${item.place ? `<span class="text-[10px] sm:text-xs font-normal px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded truncate max-w-[120px] sm:max-w-none">${item.place}</span>` : ''}
                        </div>
                        <div class="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                            <span class="font-semibold text-gray-400 dark:text-gray-500 mr-2">${dateStr}</span>
                            <span>${subText}</span>
                        </div>
                    </div>
                    <div class="font-mono font-black text-gray-800 dark:text-gray-100 text-lg sm:text-xl shrink-0">
                        ¥${item.amount.toLocaleString()}
                    </div>
                </div>
            </label>
        `;
        EL.historyListContainer.appendChild(li);
    });
}

export function updateCopyCountUI() {
    const count = appState.selectedHistoryIds.size;
    EL.selectedCopyCount.textContent = String(count);
    EL.btnPrepareCopy.disabled = count === 0;
}

export const closeCopyModal = () => {
    EL.copyConfirmModal.classList.replace('opacity-100', 'opacity-0');
    EL.copyConfirmModalContent.classList.add('-translate-y-full');
    setTimeout(() => {
        EL.copyConfirmModal.classList.add('hidden');
    }, 300);
};

export const resetCopyApp = () => {
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

/**
 * Initialize History Copy feature event listeners
 */
export const initHistoryFeatures = () => {
    // Window globals for inline events
    window.toggleHistorySelection = (index, isChecked) => {
        if (isChecked) {
            appState.selectedHistoryIds.add(index);
        } else {
            appState.selectedHistoryIds.delete(index);
        }
        updateCopyCountUI();
    };

    window.updateCopyItemCategory = (groupIdx, itemIdx, catIdStr) => {
        const catId = parseInt(catIdStr);
        const genSel = /** @type {HTMLSelectElement} */ (document.getElementById(`copy-gen-${groupIdx}-${itemIdx}`));
        if (genSel && appState.copyMasterData) {
            genSel.innerHTML = generateGenreOptions(appState.copyMasterData.master_genres, catId, 0);
        }
    };

    EL.historyPeriodSelect.addEventListener('change', (e) => {
        const mode = /** @type {HTMLSelectElement} */ (e.target).value;
        EL.periodMonthInputContainer.classList.add('hidden');
        EL.periodCustomInputContainer.classList.add('hidden');

        if (mode === 'month') {
            EL.periodMonthInputContainer.classList.remove('hidden');
            if (!EL.periodMonthInput.value) {
                const now = new Date();
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                EL.periodMonthInput.value = `${yyyy}-${mm}`;
            }
        } else if (mode === 'custom') {
            EL.periodCustomInputContainer.classList.remove('hidden');
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

    EL.btnSelectAll.addEventListener('click', () => {
        const isAllSelected = appState.selectedHistoryIds.size === appState.fetchedHistory.length;
        const checkboxes = EL.historyListContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach((cb, index) => {
            const input = /** @type {HTMLInputElement} */ (cb);
            input.checked = !isAllSelected;
            window.toggleHistorySelection(index, !isAllSelected);
        });
        EL.btnSelectAll.textContent = isAllSelected ? "全選択" : "全解除";
    });

    EL.btnPrepareCopy.addEventListener('click', () => {
        const destId = EL.destAccountSelect.value;
        if (!destId) {
            showToast("コピー先アカウントを選択してください。", 'warning');
            return;
        }

        const destSelect = EL.destAccountSelect;
        const destName = destSelect.options[destSelect.selectedIndex].text;
        EL.confirmDestName.textContent = destName;
        EL.confirmListContainer.innerHTML = '';
        const selectedIndices = Array.from(appState.selectedHistoryIds).sort((a, b) => a - b);

        selectedIndices.forEach(idx => {
            const group = appState.fetchedHistory[idx];
            const li = document.createElement('li');
            li.className = "flex flex-col bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-gray-100 dark:border-gray-700 space-y-3";

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

            let itemsHtml = '';
            [...group.items].reverse().forEach((item, rIdx) => {
                const itemIdx = group.items.length - 1 - rIdx;
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
                    <div class="flex items-center space-x-2 min-w-0">
                        <span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider truncate">${group.place || group.category_name || "未分類"}</span>
                        ${group.receipt_id ? `<span class="text-[9px] font-mono text-blue-400 dark:text-blue-600 bg-white dark:bg-gray-800 px-1 rounded border border-blue-100 dark:border-blue-900/30">ID:${group.receipt_id}</span>` : ''}
                    </div>
                    <span class="text-[10px] text-gray-400 shrink-0 ml-2">${group.date}</span>
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

        EL.copyConfirmModal.classList.remove('hidden');
        setTimeout(() => {
            EL.copyConfirmModal.classList.replace('opacity-0', 'opacity-100');
            EL.copyConfirmModalContent.classList.remove('-translate-y-full');
        }, 10);
    });

    EL.btnCloseModal.addEventListener('click', closeCopyModal);
    EL.copyConfirmModal.addEventListener('click', (e) => {
        if (e.target === EL.copyConfirmModal) closeCopyModal();
    });

    EL.btnExecuteCopy.addEventListener('click', async () => {
        const sourceAccountId = EL.sourceAccountSelect.value;
        const destAccountId = EL.destAccountSelect.value;
        
        const itemsToCopy = [];
        const groupContainers = EL.confirmListContainer.querySelectorAll('li');
        groupContainers.forEach(container => {
            const accSelect = /** @type {HTMLSelectElement} */ (container.querySelector('.group-account-select'));
            const gIdx = parseInt(String(accSelect.dataset.groupIdx));
            const accountId = accSelect.value;
            const group = appState.fetchedHistory[gIdx];

            const itemConfigs = container.querySelectorAll('.item-copy-config');
            itemConfigs.forEach(itemConfig => {
                const iIdx = parseInt(String(/** @type {HTMLElement} */ (itemConfig).dataset.itemIdx));
                const original = group.items[iIdx];
                const catSelect = /** @type {HTMLSelectElement} */ (itemConfig.querySelector('.item-category-select'));
                const genSelect = /** @type {HTMLSelectElement} */ (itemConfig.querySelector('.item-genre-select'));

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
                        await performCopy(true);
                        return;
                    } else {
                        return;
                    }
                }

                const selectedCount = appState.selectedHistoryIds.size;
                // Note: Payment source is already saved on selection change
                sendGAEvent('copy_zaim_history');

                EL.copyStepConfig.classList.add('hidden');
                EL.copyStepList.classList.add('hidden');
                EL.copyStepList.classList.remove('flex');
                EL.copyStepDest.classList.add('hidden');
                EL.copyStepSuccess.classList.remove('hidden');
                EL.copyStepSuccess.classList.add('flex');

                if (result.status === "partial_success") {
                    document.getElementById('copy-success-message').textContent = `${result.success_count}品目のコピーに成功しました。（失敗: ${result.failed_count}品目）`;
                } else {
                    document.getElementById('copy-success-message').textContent = `${selectedCount}件の履歴（レシート）をコピーしました。`;
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

    EL.btnResetCopy.addEventListener('click', resetCopyApp);

    // Missing event listeners from app.js refactor
    EL.sourceAccountSelect.addEventListener('change', () => {
        // Save profile preference
        if (EL.sourceAccountSelect.value) {
            localStorage.setItem(getPrefixedKey('last_used_zaim_profile_copy_source'), EL.sourceAccountSelect.value);
        }
        updateDestAccountOptions();

        // Clear history list and hide selection steps to prevent confusion
        appState.fetchedHistory = [];
        appState.selectedHistoryIds.clear();
        EL.historyListContainer.innerHTML = '';
        EL.copyStepList.classList.add('hidden');
        EL.copyStepList.classList.remove('flex');
        EL.copyStepDest.classList.add('hidden');
        updateCopyCountUI();
    });

    EL.destAccountSelect.addEventListener('change', async () => {
        const destAccountId = EL.destAccountSelect.value;
        if (!destAccountId) {
            EL.destInternalAccountSelect.innerHTML = '<option value="">出金元を選択...</option>';
            return;
        }
        // Save profile preference
        localStorage.setItem(getPrefixedKey('last_used_zaim_profile_copy_dest'), destAccountId);
        await loadDestInternalAccounts();
    });

    EL.destInternalAccountSelect.addEventListener('change', () => {
        const destId = (/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).value;
        if (destId) {
            localStorage.setItem(getPrefixedKey(`last_used_payment_source_id_${destId}`), (/** @type {HTMLSelectElement} */ (EL.destInternalAccountSelect)).value);
        }
    });
};
