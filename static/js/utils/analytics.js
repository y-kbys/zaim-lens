/**
 * Helper to send GA4 custom events safely
 */
export const sendGAEvent = (eventName, params = {}) => {
    if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params);
    }
};
