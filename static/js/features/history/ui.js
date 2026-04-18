import { appState } from '../../state.js';
import { EL, generateCategoryOptions, generateGenreOptions } from '../../utils/dom.js';

/**
 * 現在の選択状態（件数・品目数）を返す
 * @returns {{ receiptCount: number, itemCount: number }}
 */
export function getSelectedCounts() {
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
 * 取得した履歴をアコーディオン形式でレンダリングする
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

        const subText = [...receipt.items].reverse().map(i => i.name).filter(n => n && n.trim() !== '').join(' / ');
        const comments = [...receipt.items].reverse().map(i => i.comment).filter(c => c && c.trim() !== '');
        const commentText = comments.length > 0 ? comments.join(' / ') : '';

        const totalItemsInReceipt = receipt.items.length;
        const selectedCountInReceipt = receipt.items.filter((_, iIdx) => appState.selectedHistoryIds.has(`${rIdx}-${iIdx}`)).length;
        const isAllSelected = selectedCountInReceipt === totalItemsInReceipt;
        const isIndeterminate = selectedCountInReceipt > 0 && selectedCountInReceipt < totalItemsInReceipt;

        const parentCheckId = `parent-check-${rIdx}`;

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

/**
 * 選択件数の表示とボタン状態を更新する
 */
export function updateCopyCountUI() {
    const { receiptCount, itemCount } = getSelectedCounts();
    EL.selectedCopyCount.innerHTML = `（${receiptCount}件 / ${itemCount}品目）`;
    EL.btnPrepareCopy.disabled = itemCount === 0;
}

/**
 * コピー確認モーダルを閉じる
 */
export const closeCopyModal = () => {
    EL.copyConfirmModal.classList.replace('opacity-100', 'opacity-0');
    EL.copyConfirmModalContent.classList.add('-translate-y-full');
    setTimeout(() => {
        EL.copyConfirmModal.classList.add('hidden');
    }, 300);
};

/**
 * コピー機能の状態をリセットする
 */
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
 * コピー確認リスト（モーダル内）をレンダリングする
 * @param {number[]} sortedReceiptIndices
 * @param {{ [rIdx: number]: { items: { idx: number, data: any }[], group: any } }} selectedByReceipt
 */
export function renderConfirmList(sortedReceiptIndices, selectedByReceipt) {
    EL.confirmListContainer.innerHTML = '';

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
}
