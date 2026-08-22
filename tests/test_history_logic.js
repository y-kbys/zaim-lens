import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDateRange, groupPaymentsByReceipt, buildSelectedByReceipt, countSelectedItems } from '../static/js/features/history/logic.js';

test('calculateDateRange - this_month', () => {
    const fixedDate = new Date('2026-08-15T12:00:00Z');
    const result = calculateDateRange('this_month', { now: fixedDate });
    assert.equal(result.startDate, '2026-08-01');
    assert.equal(result.endDate, '2026-08-15');
    assert.equal(result.periodInDays, 0);
    assert.equal(result.error, undefined);
});

test('calculateDateRange - last_month', () => {
    const fixedDate = new Date('2026-08-15T12:00:00Z');
    const result = calculateDateRange('last_month', { now: fixedDate });
    assert.equal(result.startDate, '2026-07-01');
    assert.equal(result.endDate, '2026-07-31');
    assert.equal(result.periodInDays, 0);
});

test('calculateDateRange - month with value', () => {
    const result = calculateDateRange('month', { monthVal: '2026-02' });
    assert.equal(result.startDate, '2026-02-01');
    assert.equal(result.endDate, '2026-02-28');
});

test('calculateDateRange - month without value returns error', () => {
    const result = calculateDateRange('month', { monthVal: '' });
    assert.equal(result.error, '月を指定してください。');
});

test('calculateDateRange - custom valid range', () => {
    const result = calculateDateRange('custom', { customStart: '2026-08-01', customEnd: '2026-08-10' });
    assert.equal(result.startDate, '2026-08-01');
    assert.equal(result.endDate, '2026-08-10');
    assert.equal(result.error, undefined);
});

test('calculateDateRange - custom invalid range (start > end)', () => {
    const result = calculateDateRange('custom', { customStart: '2026-08-15', customEnd: '2026-08-10' });
    assert.equal(result.error, '開始日が終了日より後になっています。');
});

test('calculateDateRange - days mode (90 days)', () => {
    const result = calculateDateRange('90');
    assert.equal(result.periodInDays, 90);
});

test('groupPaymentsByReceipt - aggregates same receipt_id', () => {
    const rawPayments = [
        { id: 1, receipt_id: 100, amount: 200, name: 'Item 1', date: '2026-08-10', category_name: '食費', place: 'Store A' },
        { id: 2, receipt_id: 100, amount: 300, name: 'Item 2', date: '2026-08-10', category_name: '食費', place: 'Store A' },
        { id: 3, receipt_id: null, amount: 500, name: 'Single Item', date: '2026-08-11', category_name: '日用品', place: 'Store B' }
    ];

    const grouped = groupPaymentsByReceipt(rawPayments);
    assert.equal(grouped.length, 2);

    // Grouped receipt
    assert.equal(grouped[0].isGroup, true);
    assert.equal(grouped[0].receipt_id, 100);
    assert.equal(grouped[0].amount, 500);
    assert.equal(grouped[0].items.length, 2);

    // Single item
    assert.equal(grouped[1].isGroup, false);
    assert.equal(grouped[1].amount, 500);
    assert.equal(grouped[1].items.length, 1);
});

test('countSelectedItems and buildSelectedByReceipt', () => {
    const fetchedHistory = [
        {
            isGroup: true,
            receipt_id: 100,
            amount: 500,
            items: [
                { id: 1, name: 'Item 1', amount: 200 },
                { id: 2, name: 'Item 2', amount: 300 }
            ]
        },
        {
            isGroup: false,
            amount: 400,
            items: [
                { id: 3, name: 'Single Item', amount: 400 }
            ]
        }
    ];

    const selectedIds = new Set(['0-0', '0-1', '1-0']);
    const counts = countSelectedItems(selectedIds);
    assert.equal(counts.receiptCount, 2);
    assert.equal(counts.itemCount, 3);

    const { sortedReceiptIndices, selectedByReceipt } = buildSelectedByReceipt(selectedIds, fetchedHistory);
    assert.deepEqual(sortedReceiptIndices, [0, 1]);
    assert.equal(selectedByReceipt[0].items.length, 2);
    assert.equal(selectedByReceipt[1].items.length, 1);
});
