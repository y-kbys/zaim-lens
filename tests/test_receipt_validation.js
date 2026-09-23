import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReceiptData } from '../static/js/features/receipt/logic.js';

test('validateReceiptData: valid receipt returns isValid true', () => {
    const data = {
        date: '2026-09-06',
        items: [
            { name: 'リンゴ', price: 150 },
            { name: 'バナナ', price: 200 }
        ]
    };
    const res = validateReceiptData(data);
    assert.equal(res.isValid, true);
    assert.equal(res.hasDate, true);
    assert.equal(res.validItemCount, 2);
    assert.equal(res.invalidItemIndices.length, 0);
});

test('validateReceiptData: missing date returns isValid false', () => {
    const data = {
        date: '',
        items: [{ name: 'リンゴ', price: 150 }]
    };
    const res = validateReceiptData(data);
    assert.equal(res.isValid, false);
    assert.equal(res.hasDate, false);
});

test('validateReceiptData: invalid date format returns isValid false', () => {
    const data = {
        date: '2026/09/06',
        items: [{ name: 'リンゴ', price: 150 }]
    };
    const res = validateReceiptData(data);
    assert.equal(res.isValid, false);
    assert.equal(res.hasDate, false);
});

test('validateReceiptData: item with empty name but non-zero price flags invalid index', () => {
    const data = {
        date: '2026-09-06',
        items: [
            { name: '', price: 150 },
            { name: 'バナナ', price: 200 }
        ]
    };
    const res = validateReceiptData(data);
    assert.equal(res.isValid, false);
    assert.deepEqual(res.invalidItemIndices, [0]);
});

test('validateReceiptData: item with non-integer price flags invalid index', () => {
    const data = {
        date: '2026-09-06',
        items: [
            { name: 'リンゴ', price: 'abc' }
        ]
    };
    const res = validateReceiptData(data);
    assert.equal(res.isValid, false);
    assert.deepEqual(res.invalidItemIndices, [0]);
});

test('validateReceiptData: deleted items are ignored', () => {
    const data = {
        date: '2026-09-06',
        items: [
            { name: '', price: 150, deleted: true },
            { name: 'バナナ', price: 200 }
        ]
    };
    const res = validateReceiptData(data);
    assert.equal(res.isValid, true);
    assert.equal(res.validItemCount, 1);
    assert.equal(res.invalidItemIndices.length, 0);
});

test('validateReceiptData: 0 items with price returns isValid false', () => {
    const data = {
        date: '2026-09-06',
        items: []
    };
    const res = validateReceiptData(data);
    assert.equal(res.isValid, false);
    assert.equal(res.validItemCount, 0);
});
