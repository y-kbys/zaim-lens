/**
 * @typedef {Object} ZaimAccount
 * @property {number|string} id
 * @property {string} name
 */

/**
 * @typedef {Object} ParsedItem
 * @property {string} name
 * @property {number|string} price
 * @property {number} [category_id]
 * @property {number} [genre_id]
 * @property {boolean} [deleted]
 */

/**
 * @typedef {Object} ParsedData
 * @property {string} [date]
 * @property {string} [store]
 * @property {ParsedItem[]} [items]
 * @property {number|string} [receipt_id]
 * @property {number|string} [point_usage]
 * @property {any[]} [master_categories]
 * @property {any[]} [master_genres]
 */

/**
 * @typedef {Object} HistoryItem
 * @property {string} date
 * @property {number} amount
 * @property {string} store_name
 * @property {number} category_id
 * @property {string} [category_name]
 * @property {number} genre_id
 * @property {string} [genre_name]
 * @property {string} comment
 * @property {number} id
 * @property {string} [place]
 * @property {number|string} [receipt_id]
 * @property {any[]} [items]
 */

/**
 * @typedef {Object} QueueItem
 * @property {File} file
 * @property {'idle'|'parsing'|'complete'|'error'} status
 * @property {any} result
 * @property {string} [blobUri]
 * @property {string} [compressedBase64]
 */

/**
 * Store application state
 */
export const appState = {
    compressedImageBase64: null, 
    /** @type {ParsedData|null} */
    parsedData: null,
    /** @type {ZaimAccount[]} */
    accounts: [],
    /** @type {HistoryItem[]} */
    fetchedHistory: [],
    /** @type {Set<string>} */
    selectedHistoryIds: new Set(),
    /** @type {string|null} */
    currentImageUri: null,
    /** @type {any} */
    lastDeleted: null,
    /** @type {any} */
    deletionTimer: null,

    // --- Batch Queue ---
    /** @type {QueueItem[]} */
    queue: [],
    currentQueueIndex: -1,
    isParsingLoopRunning: false,

    // --- Auth & Multi-User ---
    /** @type {any} */
    user: null,
    /** @type {string|null} */
    idToken: null,
    /** @type {number|string|null} */
    editingAccountId: null,
    lastReceiptId: 0,
    /** @type {any} */
    copyMasterData: null,
};
