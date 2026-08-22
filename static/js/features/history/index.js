import { appState } from '../../state.js';
import { EL, showToast, showLoading, hideLoading, showConfirm, generateGenreOptions } from '../../utils/dom.js';
import { getPrefixedKey } from '../../utils/common.js';
import { sendGAEvent } from '../../utils/analytics.js';
import { updateDestAccountOptions, loadDestInternalAccounts } from '../../api/zaim.js';

import { fetchHistory, executeCopy } from './api.js';
import { renderHistoryList, updateCopyCountUI, closeCopyModal, resetCopyApp, renderConfirmList, updateReceiptUIState, updateSelectAllButtonUI } from './ui.js';
import { calculateDateRange, groupPaymentsByReceipt, buildSelectedByReceipt } from './logic.js';

// Re-export for external use (e.g. main.js imports resetCopyApp via this module)
export { resetCopyApp };

/**
 * 期間選択セレクトに応じた日付範囲を計算する
 * @param {string} mode
 * @returns {{ startDate: string, endDate: string, periodInDays: number } | null}
 */
function resolveDateRange(mode) {
    const result = calculateDateRange(mode, {
        monthVal: EL.periodMonthInput.value,
        customStart: EL.periodStartInput.value,
        customEnd: EL.periodEndInput.value
    });

    if (result.error) {
        showToast(result.error, "warning");
        return null;
    }

    return {
        startDate: result.startDate,
        endDate: result.endDate,
        periodInDays: result.periodInDays
    };
}

/**
 * 確認モーダルのアイテムリストからコピー用ペイロードを組み立てる
 * @param {string} sourceAccountId
 * @param {string} destAccountId
 * @returns {{ itemsToCopy: any[], uniqueReceiptsSelected: Set<number> }}
 */
function buildCopyPayloadFromModal(sourceAccountId, destAccountId) {
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

    return { itemsToCopy, uniqueReceiptsSelected };
}

/**
 * History Copy 機能のイベントリスナーを初期化する
 */
export const initHistoryFeatures = () => {
    // === Window globals for inline HTML event handlers ===
    window['toggleAccordion'] = (index) => {
        const li = document.getElementById(`receipt-item-${index}`);
        if (li) li.classList.toggle('expanded');
    };

    window['toggleHistorySelection'] = (receiptIdx, isChecked) => {
        const receipt = appState.fetchedHistory[receiptIdx];
        if (!receipt) return;
        receipt.items.forEach((_, iIdx) => {
            const key = `${receiptIdx}-${iIdx}`;
            if (isChecked) {
                appState.selectedHistoryIds.add(key);
            } else {
                appState.selectedHistoryIds.delete(key);
            }
        });
        updateReceiptUIState(receiptIdx);
        updateCopyCountUI();
        updateSelectAllButtonUI();
    };

    window['toggleItemSelection'] = (receiptIdx, itemIdx) => {
        const key = `${receiptIdx}-${itemIdx}`;
        if (appState.selectedHistoryIds.has(key)) {
            appState.selectedHistoryIds.delete(key);
        } else {
            appState.selectedHistoryIds.add(key);
        }
        updateReceiptUIState(receiptIdx);
        updateCopyCountUI();
        updateSelectAllButtonUI();
    };

    window['updateCopyItemCategory'] = (groupIdx, itemIdx, catIdStr) => {
        const catId = parseInt(catIdStr);
        const genSel = /** @type {HTMLSelectElement} */ (document.getElementById('copy-gen-' + groupIdx + '-' + itemIdx));
        if (genSel && appState.copyMasterData) {
            genSel.innerHTML = generateGenreOptions(appState.copyMasterData.master_genres, catId, 0);
        }
    };

    // === 期間選択 ===
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

    // === 履歴取得 ===
    EL.btnFetchHistory.addEventListener('click', async () => {
        const accountId = EL.sourceAccountSelect.value;
        if (!accountId) {
            showToast("コピー元アカウントを選択してください。", 'warning');
            return;
        }

        const mode = EL.historyPeriodSelect.value;
        const dateRange = resolveDateRange(mode);
        if (!dateRange) return; // バリデーションエラー時

        showLoading('履歴を取得中...');
        try {
            const data = await fetchHistory(accountId, {
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
                period: dateRange.periodInDays
            });

            if (EL.btnFetchHistorySkeleton) EL.btnFetchHistorySkeleton.classList.add('hidden');
            if (EL.btnFetchHistory) EL.btnFetchHistory.classList.remove('hidden');

            const rawPayments = data.history.filter(h => h.mode === "payment");
            appState.fetchedHistory = groupPaymentsByReceipt(rawPayments);
            appState.selectedHistoryIds.clear();
            renderHistoryList();
            sendGAEvent('fetch_zaim_history');

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

    // === 全選択 / 全解除 ===
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

        appState.fetchedHistory.forEach((_, rIdx) => updateReceiptUIState(rIdx));
        updateCopyCountUI();
        updateSelectAllButtonUI();
    });

    // === コピー準備（確認モーダルを開く） ===
    EL.btnPrepareCopy.addEventListener('click', () => {
        const destId = EL.destAccountSelect.value;
        if (!destId) {
            showToast("コピー先アカウントを選択してください。", 'warning');
            return;
        }

        const destSelect = EL.destAccountSelect;
        const destName = destSelect.options[destSelect.selectedIndex].text;
        EL.confirmDestName.textContent = destName;

        const { sortedReceiptIndices, selectedByReceipt } = buildSelectedByReceipt(appState.selectedHistoryIds, appState.fetchedHistory);
        renderConfirmList(sortedReceiptIndices, selectedByReceipt);

        EL.copyConfirmModal.classList.remove('hidden');
        setTimeout(() => {
            EL.copyConfirmModal.classList.replace('opacity-0', 'opacity-100');
            EL.copyConfirmModalContent.classList.remove('-translate-y-full');
        }, 10);
    });

    // === モーダルを閉じる ===
    EL.btnCloseModal.addEventListener('click', closeCopyModal);
    EL.copyConfirmModal.addEventListener('click', (e) => {
        if (e.target === EL.copyConfirmModal) closeCopyModal();
    });

    // === コピー実行 ===
    EL.btnExecuteCopy.addEventListener('click', async () => {
        const sourceAccountId = EL.sourceAccountSelect.value;
        const destAccountId = EL.destAccountSelect.value;

        const { itemsToCopy, uniqueReceiptsSelected } = buildCopyPayloadFromModal(sourceAccountId, destAccountId);

        const performCopy = async (force = false) => {
            closeCopyModal();
            showLoading('履歴をコピー中...');
            try {
                const result = await executeCopy({
                    source_account_id: sourceAccountId,
                    destination_account_id: destAccountId,
                    from_account_id: EL.destInternalAccountSelect.value ? parseInt(EL.destInternalAccountSelect.value) : null,
                    items_to_copy: itemsToCopy,
                    force: force
                });

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

    // === リセット ===
    EL.btnResetCopy.addEventListener('click', resetCopyApp);

    // === コピー元アカウント変更 ===
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

    // === コピー先アカウント変更 ===
    EL.destAccountSelect.addEventListener('change', async () => {
        const destAccountId = EL.destAccountSelect.value;
        if (!destAccountId) {
            EL.destInternalAccountSelect.innerHTML = '<option value="">出金元を選択...</option>';
            return;
        }
        localStorage.setItem(getPrefixedKey('last_used_zaim_profile_copy_dest'), destAccountId);
        await loadDestInternalAccounts();
    });

    // === 出金元アカウント変更 ===
    EL.destInternalAccountSelect.addEventListener('change', () => {
        const destId = (/** @type {HTMLSelectElement} */ (EL.destAccountSelect)).value;
        if (destId) {
            localStorage.setItem(getPrefixedKey(`last_used_payment_source_id_${destId}`), (/** @type {HTMLSelectElement} */ (EL.destInternalAccountSelect)).value);
        }
    });
};
