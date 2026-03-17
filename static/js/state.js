/**
 * Store application state
 */
export const appState = {
    compressedImageBase64: null, // Holds the resized image to prevent double upload
    parsedData: null,
    accounts: [], // Store available Zaim accounts
    fetchedHistory: [], // Store fetched history items
    selectedHistoryIds: new Set(), // Track selected item IDs based on index
    currentImageUri: null, // Holds the Blob URI for the original image
    lastDeleted: null, // Holds { item, index } for Undo
    deletionTimer: null, // Timer for actual removal

    // --- Batch Queue ---
    queue: [], // Array of { file, status: 'idle'|'parsing'|'complete'|'error', result: null, blobUri: null, compressedBase64: null }
    currentQueueIndex: -1, // -1 means no batch processing active
    isParsingLoopRunning: false, // Concurrency guard

    // --- Auth & Multi-User ---
    user: null,
    idToken: null,
    editingAccountId: null, // null means creating a new record
    lastReceiptId: 0,
};
