import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure logic to determine if unlinked banner should be shown
 * @param {{ user?: any, accountsLoaded?: boolean, accounts?: any[] }} state
 * @returns {boolean}
 */
export function isUnlinkedBannerVisible(state) {
    if (!state || !state.user || !state.accountsLoaded) {
        return false;
    }
    return !state.accounts || state.accounts.length === 0;
}

test('isUnlinkedBannerVisible: returns false when state is undefined or null', () => {
    assert.equal(isUnlinkedBannerVisible(null), false);
    assert.equal(isUnlinkedBannerVisible(undefined), false);
});

test('isUnlinkedBannerVisible: returns false when user is not logged in', () => {
    const state = {
        user: null,
        accountsLoaded: true,
        accounts: []
    };
    assert.equal(isUnlinkedBannerVisible(state), false);
});

test('isUnlinkedBannerVisible: returns false while accounts are still loading', () => {
    const state = {
        user: { email: 'user@example.com' },
        accountsLoaded: false,
        accounts: []
    };
    assert.equal(isUnlinkedBannerVisible(state), false);
});

test('isUnlinkedBannerVisible: returns true when logged in, loaded, and accounts is empty', () => {
    const state = {
        user: { email: 'user@example.com' },
        accountsLoaded: true,
        accounts: []
    };
    assert.equal(isUnlinkedBannerVisible(state), true);
});

test('isUnlinkedBannerVisible: returns true when logged in, loaded, and accounts is null or undefined', () => {
    const state1 = {
        user: { email: 'user@example.com' },
        accountsLoaded: true,
        accounts: null
    };
    assert.equal(isUnlinkedBannerVisible(state1), true);

    const state2 = {
        user: { email: 'user@example.com' },
        accountsLoaded: true,
    };
    assert.equal(isUnlinkedBannerVisible(state2), true);
});

test('isUnlinkedBannerVisible: returns false when logged in, loaded, and accounts exist', () => {
    const state = {
        user: { email: 'user@example.com' },
        accountsLoaded: true,
        accounts: [{ id: 1, name: '現金' }]
    };
    assert.equal(isUnlinkedBannerVisible(state), false);
});

test('Lifecycle Scenario: state transitions from initial to logged in to linked', () => {
    const state = {
        user: null,
        accountsLoaded: false,
        accounts: []
    };

    // 1. Initial app boot before login
    assert.equal(isUnlinkedBannerVisible(state), false, 'Banner hidden during initial boot');

    // 2. User logs in, but accounts not loaded yet
    state.user = { email: 'user@example.com' };
    assert.equal(isUnlinkedBannerVisible(state), false, 'Banner hidden while loading accounts');

    // 3. Accounts fetch completes: user has 0 Zaim accounts linked
    state.accountsLoaded = true;
    state.accounts = [];
    assert.equal(isUnlinkedBannerVisible(state), true, 'Banner visible when accounts loaded but 0 linked');

    // 4. User links Zaim account in settings modal
    state.accounts = [{ id: 101, name: 'Zaim Wallet' }];
    assert.equal(isUnlinkedBannerVisible(state), false, 'Banner hidden once accounts are linked');

    // 5. User logs out
    state.user = null;
    state.accountsLoaded = false;
    state.accounts = [];
    assert.equal(isUnlinkedBannerVisible(state), false, 'Banner hidden upon signout');
});
