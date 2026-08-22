import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure helper function representing the decision logic of advanceQueue completion.
 * @param {number} registeredCount
 * @returns {'state-success' | 'reset-app'}
 */
export function determineQueueCompletionAction(registeredCount) {
    if (registeredCount > 0) {
        return 'state-success';
    }
    return 'reset-app';
}

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
