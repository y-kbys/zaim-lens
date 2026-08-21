/**
 * Compress and resize receipt image using HTML5 Canvas for optimal OCR processing.
 * @param {File|Blob} file - The image file or blob to compress.
 * @param {number} [maxWidth=1600] - Maximum width for resizing.
 * @param {number} [maxHeight=1600] - Maximum height for resizing.
 * @param {number} [quality=0.85] - JPEG quality between 0 and 1.
 * @returns {Promise<string>} Base64 Data URL (image/jpeg)
 */
export async function compressImage(file, maxWidth = 1600, maxHeight = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error("No file provided for compression."));
        }

        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round(width * (maxHeight / height));
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
            if (!ctx) {
                return reject(new Error("Failed to get 2D canvas context."));
            }

            // Draw image on white background to prevent black PNG transparency issues
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
        };

        img.onerror = error => {
            URL.revokeObjectURL(objectUrl);
            reject(error);
        };
    });
}

