/**
 * 履歴コピー機能の純粋ロジック（日付計算・グルーピング・選択集計）
 */

/**
 * 期間指定モードに応じた開始日・終了日・日数を計算する
 * @param {string} mode
 * @param {{ monthVal?: string, customStart?: string, customEnd?: string, now?: Date }} [options]
 * @returns {{ startDate: string, endDate: string, periodInDays: number, error?: string }}
 */
export function calculateDateRange(mode, { monthVal = '', customStart = '', customEnd = '', now = new Date() } = {}) {
    const pad = n => String(n).padStart(2, '0');
    const formatDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    let startDate = '';
    let endDate = '';
    let periodInDays = 0;

    if (mode === 'this_month') {
        startDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        endDate = formatDate(now);
    } else if (mode === 'last_month') {
        startDate = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        endDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (mode === 'month') {
        if (!monthVal) {
            return { startDate: '', endDate: '', periodInDays: 0, error: '月を指定してください。' };
        }
        const [y, m] = monthVal.split('-').map(Number);
        startDate = formatDate(new Date(y, m - 1, 1));
        endDate = formatDate(new Date(y, m, 0));
    } else if (mode === 'custom') {
        if (!customStart || !customEnd) {
            return { startDate: '', endDate: '', periodInDays: 0, error: '開始日と終了日を指定してください。' };
        }
        if (customStart > customEnd) {
            return { startDate: '', endDate: '', periodInDays: 0, error: '開始日が終了日より後になっています。' };
        }
        startDate = customStart;
        endDate = customEnd;
    } else if (mode === 'past_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate() + 1);
        startDate = formatDate(start);
        endDate = formatDate(now);
    } else {
        periodInDays = parseInt(mode, 10) || 0;
    }

    return { startDate, endDate, periodInDays };
}

/**
 * 取得した支出明細データをレシート単位にグループ化する
 * @param {any[]} rawPayments
 * @returns {any[]}
 */
export function groupPaymentsByReceipt(rawPayments) {
    if (!Array.isArray(rawPayments)) return [];
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

    return groupedHistory;
}

/**
 * 選択中アイテムIDのセットから、レシートごとの選択マップとソート済みインデックス配列を生成する
 * @param {Set<string>} selectedHistoryIds
 * @param {any[]} fetchedHistory
 * @returns {{ sortedReceiptIndices: number[], selectedByReceipt: Record<number, { items: { idx: number, data: any }[], group: any }> }}
 */
export function buildSelectedByReceipt(selectedHistoryIds, fetchedHistory) {
    const selectedByReceipt = {};
    if (!selectedHistoryIds || !fetchedHistory) {
        return { sortedReceiptIndices: [], selectedByReceipt: {} };
    }

    Array.from(selectedHistoryIds).forEach(itemKey => {
        const [rIdx, iIdx] = itemKey.split('-').map(Number);
        if (fetchedHistory[rIdx] && fetchedHistory[rIdx].items && fetchedHistory[rIdx].items[iIdx]) {
            if (!selectedByReceipt[rIdx]) {
                selectedByReceipt[rIdx] = {
                    items: [],
                    group: fetchedHistory[rIdx]
                };
            }
            selectedByReceipt[rIdx].items.push({
                idx: iIdx,
                data: fetchedHistory[rIdx].items[iIdx]
            });
        }
    });
    const sortedReceiptIndices = Object.keys(selectedByReceipt).map(Number).sort((a, b) => a - b);
    return { sortedReceiptIndices, selectedByReceipt };
}

/**
 * 選択状態のアイテムキー一覧から、一意なレシート数および品目数を集計する
 * @param {Set<string>|string[]} selectedHistoryIds
 * @returns {{ receiptCount: number, itemCount: number }}
 */
export function countSelectedItems(selectedHistoryIds) {
    const itemKeys = Array.from(selectedHistoryIds || []);
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
