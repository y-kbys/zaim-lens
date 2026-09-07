import { appState } from '../../state.js';
import { EL, showToast, showLoading, hideLoading, switchState } from '../../utils/dom.js';
import { compressImage } from './image.js';
import { parseReceiptImage } from './api.js';
import { ensureZaimDataAvailable } from '../../api/zaim.js';
import { updateBatchProgressUI, setupEditState, resetApp, updateUnlinkedBannerState } from './ui.js';
import { openGeminiSettings, openZaimSettings } from '../settings.js';

// Each queue item's parsing Promise is tracked here (kept for compatibility)
export const parsePromises = new Map();

/**
 * Parses a single queue item
 * @param {any} item
 */
export async function parseSingleItem(item) {
    item.status = 'parsing';
    updateBatchProgressUI();

    const promise = (async () => {
        try {
            if (!item.compressedBase64 && item.file) {
                item.compressedBase64 = await compressImage(item.file);
                item.file = null;
            }

            const targetAccountId = EL.uploadTargetAccount ? EL.uploadTargetAccount.value : "1";
            try {
                await ensureZaimDataAvailable(targetAccountId);
            } catch (e) {
                console.error("Zaim data prep failed", e);
            }

            const result = await parseReceiptImage(item.compressedBase64, targetAccountId);

            // Add point usage logic as a negative item if present
            if (result && result.point_usage > 0) {
                if (!result.items || !Array.isArray(result.items)) result.items = [];
                result.items.push({
                    name: "ポイント利用",
                    price: -result.point_usage,
                    category_id: result.items.length > 0 ? result.items[0].category_id : 101,
                    genre_id: result.items.length > 0 ? result.items[0].genre_id : 10101
                });
                result.point_usage = 0;
            }

            item.result = result;
            item.status = 'complete';
            item.error = null;
            return result;
        } catch (err) {
            console.error("Failed to parse item:", err);
            item.status = 'error';
            item.error = err.message || '解析に失敗しました';
            item.result = { error: item.error, items: [] };
            throw err;
        } finally {
            updateBatchProgressUI();
        }
    })();

    item._parsePromise = promise;
    return promise;
}

/**
 * Handle new files added to the queue
 */
export const handleImageFiles = async (files) => {
    if (!files || files.length === 0) return;

    appState.queue = files.map(file => ({
        file,
        status: 'idle',
        result: null,
        compressedBase64: null,
        error: null,
        _parsePromise: null
    }));
    appState.currentQueueIndex = 0;
    appState.registeredReceiptCount = 0;
    appState.isParsingLoopRunning = false;
    parsePromises.clear();

    try {
        showLoading('画像を最適化中...');
        const firstItem = appState.queue[0];
        firstItem.compressedBase64 = await compressImage(firstItem.file);
        firstItem.file = null; 

        appState.currentImageUri = firstItem.compressedBase64;
        EL.imagePreview.src = appState.currentImageUri;
        EL.imagePreviewContainer.classList.remove('hidden');
        EL.btnParse.classList.remove('hidden');
        updateUnlinkedBannerState();
        
        hideLoading();

        // Background compress remaining images sequentially
        (async () => {
            for (let i = 1; i < appState.queue.length; i++) {
                const item = appState.queue[i];
                if (!item.compressedBase64 && item.file) {
                    try {
                        item.compressedBase64 = await compressImage(item.file);
                        item.file = null;
                        updateBatchProgressUI();
                    } catch (e) {
                        console.error(`Failed to compress image ${i}:`, e);
                    }
                }
            }
        })();
    } catch (err) {
        hideLoading();
        showToast("画像の処理に失敗しました。", 'error');
        console.error(err);
    }

    updateBatchProgressUI();
};

/**
 * Select an item in the queue to become active
 * @param {number} index
 */
export async function selectQueueItem(index) {
    if (index < 0 || index >= appState.queue.length) return;
    appState.currentQueueIndex = index;
    const item = appState.queue[index];

    if (!item.compressedBase64 && item.file) {
        showLoading("画像を最適化中...");
        try {
            item.compressedBase64 = await compressImage(item.file);
            item.file = null;
        } catch (e) {
            console.error("Manual compression failed", e);
        } finally {
            if (appState.currentQueueIndex === index) {
                hideLoading();
            }
        }
    }

    appState.currentImageUri = item.compressedBase64;
    EL.imagePreview.src = appState.currentImageUri || "";
    updateBatchProgressUI();

    // If still in upload screen and not parsed yet
    if (EL.stateEdit.classList.contains('hidden') && item.status === 'idle') {
        return;
    }

    if (item.status === 'complete') {
        hideLoading();
        setupEditState(item.result);
    } else if (item.status === 'error') {
        hideLoading();
        showToast("この画像の解析に失敗していました。「再試行」するか手入力で編集してください。", 'warning');
        setupEditState(item.result || { date: "", store: "", items: [] });
    } else {
        setupEditState(null);
        showLoading("解析結果を待機中...");

        if (!appState.isParsingLoopRunning) {
            startBackgroundParsing();
        }

        const waitLoop = async () => {
            while (appState.currentQueueIndex === index) {
                if (item.status === 'complete' || item.status === 'error') break;
                if (!appState.isParsingLoopRunning) break;
                await new Promise(r => setTimeout(r, 100));
            }
        };

        await waitLoop();

        if (appState.currentQueueIndex === index) {
            hideLoading();
            const targetItem = appState.queue[index];
            const finalStatus = targetItem ? targetItem.status : /** @type {string} */ (item.status);
            if (finalStatus === 'complete') {
                setupEditState(targetItem ? targetItem.result : item.result);
            } else if (finalStatus === 'error') {
                showToast("解析に失敗しました。", 'warning');
                setupEditState((targetItem ? targetItem.result : item.result) || { date: "", store: "", items: [] });
            } else {
                setupEditState({ date: "", store: "", items: [] });
            }
        }
    }
}

/**
 * Remove an item from the queue
 * @param {number} index 
 */
export async function removeQueueItem(index) {
    if (index < 0 || index >= appState.queue.length) return;
    const oldIndex = appState.currentQueueIndex;
    appState.queue.splice(index, 1);

    if (appState.queue.length === 0) {
        resetApp();
        return;
    }

    if (index === oldIndex) {
        const nextIndex = Math.min(index, appState.queue.length - 1);
        await selectQueueItem(nextIndex);
    } else if (index < oldIndex) {
        appState.currentQueueIndex = oldIndex - 1;
        updateBatchProgressUI();
    } else {
        updateBatchProgressUI();
    }
}

/**
 * Retry parsing an item that failed
 * @param {number} index
 */
export async function retryQueueItem(index) {
    if (index < 0 || index >= appState.queue.length) return;
    const item = appState.queue[index];
    item.status = 'idle';
    item.error = null;
    item._parsePromise = null;
    updateBatchProgressUI();

    if (index === appState.currentQueueIndex) {
        showLoading("AIでレシートを再解析中...");
    }

    try {
        await parseSingleItem(item);
        if (index === appState.currentQueueIndex) {
            hideLoading();
            setupEditState(item.result);
            showToast("再解析が完了しました。", "success");
        }
    } catch (err) {
        if (index === appState.currentQueueIndex) {
            hideLoading();
            setupEditState(item.result || { date: "", store: "", items: [] });
            if (/** @type {any} */ (err).status === 429) {
                showToast("Geminiのレートリミットに達しました。時間を置いてから再度お試しください。", 'warning');
            } else {
                showToast("再解析に失敗しました。", "warning");
            }
        }
    } finally {
        updateBatchProgressUI();
    }
}

/**
 * Advance queue to the next item
 */
export async function advanceQueue() {
    appState.currentQueueIndex++;

    if (appState.currentQueueIndex >= appState.queue.length) {
        const registeredCount = appState.registeredReceiptCount || 0;
        appState.currentQueueIndex = -1;
        appState.queue = [];
        appState.registeredReceiptCount = 0;
        parsePromises.clear();
        updateBatchProgressUI();
        hideLoading();

        if (registeredCount > 0) {
            switchState('state-success');
        } else {
            resetApp();
        }
        return;
    }

    await selectQueueItem(appState.currentQueueIndex);
}

/**
 * Start the background loop to parse all items sequentially
 */
export async function startBackgroundParsing() {
    if (appState.isParsingLoopRunning) return;
    appState.isParsingLoopRunning = true;
    const currentQueue = appState.queue;

    try {
        for (let i = 0; i < appState.queue.length; i++) {
            if (appState.queue !== currentQueue) break;
            const item = appState.queue[i];
            if (item.status !== 'idle') continue;

            const promise = parseSingleItem(item);
            parsePromises.set(i, promise);

            try {
                await promise;
            } catch (err) {
                if (/** @type {any} */ (err).status === 429) {
                    showToast("Geminiのレートリミットに達しました。時間を置いてから再度お試しください。", 'warning');
                    break;
                } else if (/** @type {any} */ (err).status === 400) {
                    const msg = err.message || "";
                    if (msg.includes("API Key is not configured") || msg.includes("Gemini API Key")) {
                        showToast("Gemini APIキーが設定されていません。設定画面を開きます。", 'warning');
                        openGeminiSettings();
                        break;
                    } else if (msg.includes("Zaim連携が設定されていません") || msg.includes("Zaim")) {
                        showToast("Zaim連携が設定されていません。連携画面を開きます。", 'warning');
                        openZaimSettings();
                        break;
                    }
                }
            } finally {
                updateBatchProgressUI();
            }

            if (appState.queue !== currentQueue) break;

            // Sync UI if still active on this item and we reached here naturally
            if (i === appState.currentQueueIndex) {
                 hideLoading();
                 if (/** @type {any} */ (item).status === 'complete') setupEditState(item.result);
                 else if (/** @type {any} */ (item).status === 'error') {
                     showToast("解析に失敗しました。", 'warning');
                     setupEditState(item.result || { date: "", store: "", items: [] });
                 }
            }

            if (i < appState.queue.length - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } finally {
        appState.isParsingLoopRunning = false;
        if (appState.queue === currentQueue && appState.currentQueueIndex !== -1) {
            const currentItem = appState.queue[appState.currentQueueIndex];
            if (currentItem && currentItem.status !== 'complete') {
                hideLoading();
            }
        }
    }
}
