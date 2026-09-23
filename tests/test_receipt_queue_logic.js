import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowRegistrationToast, determineQueueCompletionAction } from '../static/js/features/receipt/logic.js';

/**
 * Simulate queue workflow state transitions
 */
export class MockQueueSession {
    constructor(totalItems = 2) {
        this.queue = Array.from({ length: totalItems }, (_, i) => ({ id: i + 1 }));
        this.currentQueueIndex = 0;
        this.registeredReceiptCount = 0;
        this.currentState = 'state-edit';
    }

    registerCurrent() {
        this.registeredReceiptCount++;
        this.advance();
    }

    skipCurrent() {
        this.advance();
    }

    advance() {
        this.currentQueueIndex++;
        if (this.currentQueueIndex >= this.queue.length) {
            const count = this.registeredReceiptCount;
            this.currentQueueIndex = -1;
            this.queue = [];
            this.registeredReceiptCount = 0;

            const action = determineQueueCompletionAction(count);
            if (action === 'state-success') {
                this.currentState = 'state-success';
            } else {
                this.currentState = 'state-upload'; // resetApp sets state-upload
            }
        }
    }
    selectItem(index) {
        if (index < 0 || index >= this.queue.length) return false;
        this.currentQueueIndex = index;
        return true;
    }

    removeItem(index) {
        if (index < 0 || index >= this.queue.length) return false;
        this.queue.splice(index, 1);
        if (this.queue.length === 0) {
            this.currentQueueIndex = -1;
            this.currentState = 'state-upload';
        } else if (this.currentQueueIndex >= this.queue.length) {
            this.currentQueueIndex = this.queue.length - 1;
        } else if (index < this.currentQueueIndex) {
            this.currentQueueIndex--;
        }
        return true;
    }
}

test('Scenario: All 2 receipts skipped -> returns quietly to state-upload', () => {
    const session = new MockQueueSession(2);
    assert.equal(session.currentQueueIndex, 0);

    // Skip first receipt
    session.skipCurrent();
    assert.equal(session.currentQueueIndex, 1);
    assert.equal(session.currentState, 'state-edit');

    // Skip second receipt (queue ends)
    session.skipCurrent();
    assert.equal(session.currentQueueIndex, -1);
    assert.equal(session.queue.length, 0);
    assert.equal(session.currentState, 'state-upload');
});

test('Scenario: 1 receipt registered, 1 skipped -> transitions to state-success', () => {
    const session = new MockQueueSession(2);

    // Register first receipt
    session.registerCurrent();
    assert.equal(session.currentQueueIndex, 1);

    // Skip second receipt (queue ends)
    session.skipCurrent();
    assert.equal(session.currentQueueIndex, -1);
    assert.equal(session.queue.length, 0);
    assert.equal(session.currentState, 'state-success');
});

test('Scenario: Single receipt skipped -> returns to state-upload', () => {
    const session = new MockQueueSession(1);
    session.skipCurrent();
    assert.equal(session.currentState, 'state-upload');
});

test('Scenario: Single receipt registered -> transitions to state-success', () => {
    const session = new MockQueueSession(1);
    session.registerCurrent();
    assert.equal(session.currentState, 'state-success');
});

test('Scenario: selectItem switches currentQueueIndex correctly', () => {
    const session = new MockQueueSession(3);
    assert.equal(session.currentQueueIndex, 0);

    const success = session.selectItem(2);
    assert.equal(success, true);
    assert.equal(session.currentQueueIndex, 2);

    const invalid = session.selectItem(5);
    assert.equal(invalid, false);
    assert.equal(session.currentQueueIndex, 2);
});

test('Scenario: removeItem removes target item and adjusts currentQueueIndex', () => {
    const session = new MockQueueSession(3);
    // Queue items: id=1, id=2, id=3
    session.selectItem(1); // current = 1 (id=2)

    // Remove item before current (index 0, id=1)
    session.removeItem(0);
    assert.equal(session.queue.length, 2);
    assert.equal(session.queue[0].id, 2);
    assert.equal(session.currentQueueIndex, 0); // shifted from 1 to 0

    // Remove current item (index 0, id=2)
    session.removeItem(0);
    assert.equal(session.queue.length, 1);
    assert.equal(session.queue[0].id, 3);
    assert.equal(session.currentQueueIndex, 0);

    // Remove last remaining item
    session.removeItem(0);
    assert.equal(session.queue.length, 0);
    assert.equal(session.currentQueueIndex, -1);
    assert.equal(session.currentState, 'state-upload');
});

test('shouldShowRegistrationToast: returns false for single receipt or empty/null queue', () => {
    assert.equal(shouldShowRegistrationToast([]), false);
    assert.equal(shouldShowRegistrationToast([{ id: 1 }]), false);
    assert.equal(shouldShowRegistrationToast(null), false);
    assert.equal(shouldShowRegistrationToast(undefined), false);
});

test('shouldShowRegistrationToast: returns true when queue has multiple receipts', () => {
    assert.equal(shouldShowRegistrationToast([{ id: 1 }, { id: 2 }]), true);
    assert.equal(shouldShowRegistrationToast([{ id: 1 }, { id: 2 }, { id: 3 }]), true);
});
