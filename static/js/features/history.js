import { appState } from '../state.js';
import { EL, showToast, showLoading, hideLoading, showConfirm, generateCategoryOptions, generateGenreOptions } from '../utils/dom.js';
import { apiFetch } from '../api/backend.js';
import { getPrefixedKey } from '../utils/common.js';
import { sendGAEvent } from '../utils/analytics.js';
import { updateDestAccountOptions, loadDestInternalAccounts } from '../api/zaim.js';

/**
 * Utility to calculate current selection counts
 */
function getSelectedCounts() {
    const itemKeys = Array.from(appState.selectedHistoryIds);
    const receiptIndices = new Set();
    itemKeys.forEach(key => {
        const [rIdx] = key.split('-');
        receiptIndices.add(rIdx);
    });
    return {
        receiptCount: receiptIndices.size,
        itemCount: itemKeys.length
    };
}

/**
 * Render list of fetched history items (Accordion style)
 */
export function renderHistoryList() {
    EL.historyListContainer.innerHTML = '';

    if (appState.fetchedHistory.length === 0) {
        EL.historyListContainer.innerHTML = '<li class="text-gray-500 text-center py-4">履歴がありません</li>';
        return;
    }

    appState.fetchedHistory.forEach((receipt, rIdx) => {
        const li = document.createElement('li');
        li.id = `receipt-item-${rIdx}`;
        li.className = "accordion-item group relative bg-gray-50 dark:bg-gray-800/40 rounded-xl transition-all duration-200 border border-gray-100 dark:border-gray-700 shadow-sm mb-2";

        const dateStr = receipt.date.replace(/-/g, '/');
        const catText = receipt.category_name || "未分類";

        // Summary text for items and comments (to show in header when collapsed)
        // Filter out empty names to avoid empty slots in the " / " list
        const subText = [...receipt.items].reverse().map(i => i.name).filter(n => n && n.trim() !== '').join(' / ');
        const comments = [...receipt.items].reverse().map(i => i.comment).filter(c => c && c.trim() !== '');
        const commentText = comments.length > 0 ? comments.join(' / ') : '';

        // Selection logic for parent checkbox
        const totalItemsInReceipt = receipt.items.length;
        const selectedCountInReceipt = receipt.items.filter((_, iIdx) => appState.selectedHistoryIds.has(`${rIdx}-${iIdx}`)).length;
        const isAllSelected = selectedCountInReceipt === totalItemsInReceipt;
        const isIndeterminate = selectedCountInReceipt > 0 && selectedCountInReceipt < totalItemsInReceipt;

        // Parent Checkbox ID
        const parentCheckId = `parent-check-${rIdx}`;

        // Items HTML
        let itemsHtml = '';
        receipt.items.forEach((item, iIdx) => {
            const itemKey = `${rIdx}-${iIdx}`;
            const isChecked = appState.selectedHistoryIds.has(itemKey);
            itemsHtml += `
                <div class="item-row flex items-start space-x-3 p-3 border-b border-gray-100 dark:border-gray-700/50 last:border-0 hover:bg-white/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                     onclick="toggleItemSelection(${rIdx}, ${iIdx}, !${isChecked}); event.stopPropagation();">
                    <div class="pt-0.5 pointer-events-none">
                        <input type="checkbox" id="item-check-${itemKey}" 
                            class="w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                            ${isChecked ? 'checked' : ''}
                            readonly>
                    </div>
                    <div class="flex-grow min-w-0">
                        <div class="flex justify-between items-baseline mb-0.5">
                            <span class="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate mr-2">${item.name || ""}</span>
                            <span class="text-xs font-mono text-gray-500 shrink-0">¥${item.amount.toLocaleString()}</span>
                        </div>
                        ${item.comment ? `
                        <div class="text-[9px] sm:text-[10px] text-blue-600/80 dark:text-blue-400/80 italic flex items-center">
                            <i class="fa-solid fa-note-sticky mr-1.5 opacity-60"></i>
                            <span class="truncate">${item.comment}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        li.innerHTML = `
            <!-- Header -->
            <div class="flex items-stretch min-h-[64px]">
                <div class="flex items-center px-3 border-r border-gray-100 dark:border-gray-700/50">
                    <input type="checkbox" id="${parentCheckId}" 
                        class="w-5 h-5 text-blue-600 rounded-lg border-gray-300 dark:border-gray-600 focus:ring-blue-500 cursor-pointer transition-transform active:scale-95"
                        ${isAllSelected ? 'checked' : ''}
                        onchange="toggleHistorySelection(${rIdx}, this.checked)">
                </div>
                <div class="flex-grow flex items-center justify-between p-3 cursor-pointer min-w-0" onclick="toggleAccordion(${rIdx})">
                    <div class="min-w-0 flex-grow mr-2">
                        <div class="font-bold text-gray-800 dark:text-gray-100 flex items-center space-x-2">
                            <span class="truncate text-sm sm:text-base">${catText}</span>
                            ${receipt.place ? `<span class="text-[9px] sm:text-[10px] font-normal px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded truncate">${receipt.place}</span>` : ''}
                        </div>
                        <div class="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-0.5 space-x-2 line-clamp-2 leading-relaxed">
                            <span class="font-semibold">${dateStr}</span>
                            <span>${subText}</span>
                        </div>
                        ${commentText ? `
                        <div class="mt-1 text-[9px] sm:text-[10px] text-blue-600 dark:text-blue-400 opacity-80 flex items-center space-x-1.5">
                            <i class="fa-solid fa-note-sticky shrink-0 opacity-70"></i>
                            <span class="truncate italic">${commentText}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="flex items-center space-x-3 shrink-0">
                        <div class="font-mono font-black text-gray-800 dark:text-gray-100 text-lg">
                            ¥${receipt.amount.toLocaleString()}
                        </div>
                        <i class="fa-solid fa-chevron-down text-gray-400 text-xs chevron-icon"></i>
                    </div>
                </div>
            </div>
            <!-- Body (Accordion Content) -->
            <div class="accordion-content bg-white/30 dark:bg-black/10 border-t border-gray-100 dark:border-gray-700/50" onclick="event.stopPropagation()">
                ${itemsHtml}
            </div>
        `;

        const checkEl = /** @type {HTMLInputElement} */ (li.querySelector(`#${parentCheckId}`));
        if (checkEl) checkEl.indeterminate = isIndeterminate;

        EL.historyListContainer.appendChild(li);
    });
}

export function updateCopyCountUI() {
    const { receiptCount, itemCount } = getSelectedCounts();
    EL.selectedCopyCount.innerHTML = `（${receiptCount}件 / ${itemCount}品目）`;
    EL.btnPrepareCopy.disabled = itemCount === 0;
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
    window['toggleAccordion'] = (index) => {
        const li = document.getElementById(`receipt-item-${index}`);
        if (li) {
            li.classList.toggle('expanded');
        }
    };

    window['toggleHistorySelection'] = (receiptIdx, isChecked) => {
        const receipt = appState.fetchedHistory[receiptIdx];
        receipt.items.forEach((_, iIdx) => {
            const key = `${receiptIdx}-${iIdx}`;
            if (isChecked) {
                appState.selectedHistoryIds.add(key);
            } else {
                appState.selectedHistoryIds.delete(key);
            }
        });
        
        // Re-render only this receipt item to update state + children
        renderHistoryList();
        updateCopyCountUI();
    };

    window['toggleItemSelection'] = (receiptIdx, itemIdx, isChecked) => {
        const key = `${receiptIdx}-${itemIdx}`;
        if (isChecked) {
            appState.selectedHistoryIds.add(key);
        } else {
            appState.selectedHistoryIds.delete(key);
        }
        
        // Re-render to update parent status
        renderHistoryList();
        updateCopyCountUI();
    };

    window['updateCopyItemCategory'] = (groupIdx, itemIdx, catIdStr) => {
        const catId = parseInt(catIdStr);
        const genSel = /** @type {HTMLSelectElement} */ (document.getElementById('copy-gen-' + groupIdx + '-' + itemIdx));
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
        const totalItemsInApp = appState.fetchedHistory.reduce((acc, r) => acc + r.items.length, 0);
        const isAllSelected = appState.selectedHistoryIds.size === totalItemsInApp;
        
        if (isAllSelected) {
            appState.selectedHistoryIds.clear();
        } else {
            appState.fetchedHistory.forEach((receipt, rIdx) => {
                receipt.items.forEach((_, iIdx) => {
                    appState.selectedHistoryIds.add(`${rIdx}-${iIdx}`);
                });
            });
        }
        
        renderHistoryList();
        updateCopyCountUI();
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

        // Group selected items by their original receipt container in the confirmation modal
        const selectedByReceipt = {}; // key: rIdx, value: { items: [], group: fetchedHistoryItem }
        Array.from(appState.selectedHistoryIds).forEach(itemKey => {
            const [rIdx, iIdx] = itemKey.split('-').map(Number);
            if (!selectedByReceipt[rIdx]) {
                selectedByReceipt[rIdx] = { 
                    items: [], 
                    group: appState.fetchedHistory[rIdx] 
                };
            }
            selectedByReceipt[rIdx].items.push({
                idx: iIdx,
                data: appState.fetchedHistory[rIdx].items[iIdx]
            });
        });

        const sortedReceiptIndices = Object.keys(selectedByReceipt).map(Number).sort((a, b) => a - b);

        sortedReceiptIndices.forEach(rIdx => {
            const { items, group } = selectedByReceipt[rIdx];
            const li = document.createElement('li');
            li.className = "flex flex-col bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-gray-100 dark:border-gray-700 space-y-3";

            const batchVal = EL.destInternalAccountSelect.value;
            let defaultAccId = "";
            if (batchVal === 'keep') {
                defaultAccId = items[0].data.from_account_id || "";
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
            items.sort((a, b) => b.idx - a.idx).forEach(({ idx: iIdx, data: item }) => {
                const catOptions = generateCategoryOptions(appState.copyMasterData.master_categories, item.category_id);
                const genOptions = generateGenreOptions(appState.copyMasterData.master_genres, item.category_id, item.genre_id);

                itemsHtml += `
                    <div class="item-copy-config bg-gray-50 dark:bg-gray-900/50 p-2 rounded border border-gray-100 dark:border-gray-800 space-y-2" 
                         data-group-idx="${rIdx}" data-item-idx="${iIdx}">
                        <div class="flex justify-between items-center text-xs">
                            <span class="font-medium dark:text-gray-300 truncate mr-2">${item.name || ""}</span>
                            <span class="font-mono font-bold dark:text-white shrink-0">¥${parseInt(item.amount).toLocaleString()}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <select class="item-category-select text-[10px] p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 rounded focus:outline-none transition-colors" 
                                    onchange="updateCopyItemCategory(${rIdx}, ${iIdx}, this.value)">
                                ${catOptions}
                            </select>
                            <select class="item-genre-select text-[10px] p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 rounded focus:outline-none transition-colors" 
                                    id="copy-gen-${rIdx}-${iIdx}">
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
                    <select class="group-account-select w-full p-1.5 pl-7 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors text-[11px] appearance-none" data-group-idx="${rIdx}">
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
        const uniqueReceiptsSelected = new Set();
        const groupContainers = EL.confirmListContainer.querySelectorAll('li');
        
        groupContainers.forEach(container => {
            const accSelect = /** @type {HTMLSelectElement} */ (container.querySelector('.group-account-select'));
            if (!accSelect) return;
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
                uniqueReceiptsSelected.add(gIdx);
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

                sendGAEvent('copy_zaim_history');

                EL.copyStepConfig.classList.add('hidden');
                EL.copyStepList.classList.add('hidden');
                EL.copyStepList.classList.remove('flex');
                EL.copyStepDest.classList.add('hidden');
                EL.copyStepSuccess.classList.remove('hidden');
                EL.copyStepSuccess.classList.add('flex');

                const successReceiptCount = uniqueReceiptsSelected.size;
                const successItemCount = result.success_count;

                if (result.status === "partial_success") {
                    document.getElementById('copy-success-message').textContent = `${successReceiptCount}件のレシート（計${successItemCount}品目）のコピーに成功しました。（失敗あり）`;
                } else {
                    document.getElementById('copy-success-message').textContent = `${successReceiptCount}件のレシート（計${successItemCount}品目）をコピーしました。`;
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

    EL.sourceAccountSelect.addEventListener('change', () => {
        if (EL.sourceAccountSelect.value) {
            localStorage.setItem(getPrefixedKey('last_used_zaim_profile_copy_source'), EL.sourceAccountSelect.value);
        }
        updateDestAccountOptions();

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
