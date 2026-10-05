// ============================================
// LETTER ASSETS - header / footer / signature
// ============================================
//
// The real artwork lives in frontend/public/ and is served from the web root.
// To replace an image, simply overwrite the PNG in public/ (keep the filename):
//   public/letterhead.png    -> company header (top of every page)
//   public/footer-strip.png  -> company footer (bottom of every page)
//   public/stamp-default.png -> signature / stamp placeholder
//
// No component needs to change when the artwork is swapped.

export const LETTER_HEADER_IMAGE = '/letterhead.png';
export const LETTER_FOOTER_IMAGE = '/footer-strip.png';
export const LETTER_SIGNATURE_PLACEHOLDER = '/stamp-default.png';
