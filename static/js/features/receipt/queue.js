import { appState } from '../../state.js';
import { EL, showToast, showLoading, hideLoading, switchState } from '../../utils/dom.js';
import { compressImage } from './image.js';
import { parseReceiptImage } from './api.js';
import { ensureZaimDataAvailable } from '../../api/zaim.js';
import { updateBatchProgressUI, setupEditState } from './ui.js';
import { openGeminiSettings } from '../settings.js';

// Each queue item's parsing Promise is tracked here
export const parsePromises = new Map();

/**
 * Handle new files added to the queue
 */
export const handleImageFiles = async (files) => {
    if (files.length === 0) return;

    appState.queue = files.map(file => ({
        file,
        status: 'idle',
        result: null,
        compressedBase64: null
    }));
    appState.currentQueueIndex = 0;
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
        EL.btnParse.disabled = false;
        
        hideLoading();

        // Background compress remaining images sequentially
        (async () => {
            for (let i = 1; i < appState.queue.length; i++) {
                const item = appState.queue[i];
                if (!item.compressedBase64 && item.file) {
                    item.compressedBase64 = await compressImage(item.file);
                    item.file = null;
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
 * Advance queue to the next item
 */
export async function advanceQueue() {
    appState.currentQueueIndex++;

    if (appState.currentQueueIndex >= appState.queue.length) {
        appState.currentQueueIndex = -1;
        appState.queue = [];
        parsePromises.clear();
        updateBatchProgressUI();
        hideLoading();
        switchState('state-success');
        return;
    }

    const nextItem = appState.queue[appState.currentQueueIndex];
    updateBatchProgressUI();

    if (!nextItem.compressedBase64 && nextItem.file) {
        showLoading("画像を最適化中...");
        try {
            nextItem.compressedBase64 = await compressImage(nextItem.file);
            nextItem.file = null;
        } catch (e) {
            console.error("Manual compression failed", e);
        } finally {
            if (appState.currentQueueIndex === appState.queue.indexOf(nextItem)) {
                hideLoading();
            }
        }
    }

    appState.currentImageUri = nextItem.compressedBase64;
    EL.imagePreview.src = appState.currentImageUri || "";

    if (nextItem.status === 'complete') {
        hideLoading();
        setupEditState(nextItem.result);
    } else if (nextItem.status === 'error') {
        hideLoading();
        showToast("この画像の解析に失敗していました。スキップするか、撮り直してください。", 'warning');
        setupEditState({ date: "", store: "", items: [] });
    } else {
        setupEditState(null); // Show waiting UI
        
        // Wait for specific item if it's currently parsing
        if (parsePromises.has(appState.currentQueueIndex)) {
            showLoading("解析結果を待機中...");
            await parsePromises.get(appState.currentQueueIndex);
            
            // Re-check index in case user skipped again while waiting
            if (appState.currentQueueIndex === appState.queue.indexOf(nextItem)) {
                hideLoading();
                if (/** @type {any} */ (nextItem).status === 'complete') {
                    setupEditState(nextItem.result);
                } else if (/** @type {any} */ (nextItem).status === 'error') {
                    showToast("解析に失敗しました。", 'warning');
                    setupEditState({ date: "", store: "", items: [] });
                }
            }
        }
    }
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

            // Create promise for the job
            const promise = (async () => {
                item.status = 'parsing';
                updateBatchProgressUI();
                
                try {
                    if (!item.compressedBase64 && item.file) {
                        item.compressedBase64 = await compressImage(item.file);
                        item.file = null;
                    }

                    const targetAccountId = EL.uploadTargetAccount.value;
                    try {
                        await ensureZaimDataAvailable(targetAccountId);
                    } catch (e) {
                        console.error("Zaim data prep failed", e);
                    }

                    const result = await parseReceiptImage(item.compressedBase64, targetAccountId);

                    // Add point usage logic
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
                } catch (err) {
                    console.error(`Failed to parse item ${i}:`, err);
                    item.status = 'error';
                    item.result = { error: err.message, items: [] };
                    throw err; // Re-throw to catch it globally below
                }
            })();

            parsePromises.set(i, promise);

            try {
                await promise;
            } catch (err) {
                if (/** @type {any} */ (err).status === 429) {
                    showToast("Geminiのレートリミットに達しました。時間を置いてから再度お試しください。", 'warning');
                    break;
                } else if (/** @type {any} */ (err).status === 400 && err.message.includes("API Key is not configured")) {
                    showToast("Gemini APIキーが設定されていません。設定画面を開きます。", 'warning');
                    openGeminiSettings();
                    break;
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
                     setupEditState({ date: "", store: "", items: [] });
                 }
            }

            if (i < appState.queue.length - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } finally {
        appState.isParsingLoopRunning = false;
    }
}
