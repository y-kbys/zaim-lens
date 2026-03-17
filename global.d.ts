/**
 * Global type definitions for Zaim Lens
 */
interface Window {
    // Analytics
    gtag?: (command: string, eventName: string, params?: object) => void;
    GA_MEASUREMENT_ID?: string;
    DEVELOPER_EMAILS?: string;

    // Feature: Tab switching
    switchTab?: (tabId: string) => void;

    // Feature: Receipt Parsing
    removeItem?: (index: number) => void;
    updateItemName?: (index: number, name: string) => void;
    updateItemPrice?: (index: number, price: string | number) => void;
    updateItemCategory?: (index: number, catIdStr: string) => void;
    updateItemGenre?: (index: number, genreId: string | number) => void;
    showBulkMenuGenres?: (catId: number) => void;
    applyBulkCategoryGenre?: (catId: number, genId: number, genName: string) => Promise<void>;

    // Feature: History Copy
    toggleHistorySelection?: (index: number, isChecked: boolean) => void;
    updateCopyItemCategory?: (groupIdx: number, itemIdx: number, catIdStr: string) => void;
}
