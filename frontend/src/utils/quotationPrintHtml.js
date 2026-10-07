// Builds a self-contained HTML document from the CURRENT Live Preview DOM
// (#letter-print-root) + the live application CSS. The backend renders this
// HTML with Chrome headless (--print-to-pdf), so the resulting PDF uses the
// exact same layout engine, sizes, fonts, and CSS as the on-screen preview.

function collectAppliedCss() {
  let css = '';
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          css += `${rule.cssText}\n`;
        }
      } catch {
        // cross-origin sheet; skip
      }
    }
  } catch {
    // ignore
  }
  return css;
}

async function toDataUri(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * @param {string} [printCss]
 *   CSS tambahan yang di-append SETELAH seluruh CSS aplikasi. Dipakai modul
 *   yang ukuran fisiknya bukan A4 (mis. Kwitansi 230mm x 90mm) untuk
 *   meng-override `@page { size }` tanpa mengubah modul lain.
 *   Kosong = perilaku lama persis (A4).
 */
export async function buildPreviewHtml(printCss = '') {
  const root = document.getElementById('letter-print-root');
  if (!root) {
    throw new Error('Live preview belum siap.');
  }

  let html = root.outerHTML;

  // Inline the letter artwork so Chrome headless can render it without a
  // web server for the frontend. Signature/stamp images are already
  // absolute URLs and are fetched by Chrome directly.
  const [headerUri, footerUri] = await Promise.all([
    toDataUri('/letterhead.png'),
    toDataUri('/footer-strip.png'),
  ]);
  if (headerUri) html = html.split('"/letterhead.png"').join(`"${headerUri}"`);
  if (footerUri) html = html.split('"/footer-strip.png"').join(`"${footerUri}"`);

  // Inline SEMUA gambar eksternal (tanda tangan / stempel / asset) sebagai
  // data URI. Supaya Chrome headless tidak perlu menarik gambar dari server
  // backend yang sedang sibuk melayani request ini (PHP dev server
  // single-threaded) -> proses print-to-pdf pasti selesai.
  const srcPattern = /<img[^>]+src="([^"]+)"/g;
  const urls = new Set();
  let match;
  while ((match = srcPattern.exec(html)) !== null) {
    const src = match[1];
    if (/^https?:\/\//i.test(src) || src.startsWith('/')) urls.add(src);
  }
  await Promise.all(
    [...urls].map(async (url) => {
      // Ambil via proxy same-origin Vite ('/storage' & '/api' sudah diproxy),
      // supaya tidak kena masalah CORS saat fetch lintas origin.
      let sameOriginPath = url;
      if (/^https?:\/\//i.test(url)) {
        try {
          sameOriginPath = new URL(url).pathname;
        } catch {
          sameOriginPath = url;
        }
      }
      const dataUri = await toDataUri(sameOriginPath);
      if (dataUri) html = html.split(`"${url}"`).join(`"${dataUri}"`);
    })
  );

  const css = collectAppliedCss();
  const extra = printCss ? `\n/* --- printCss (modul ini) --- */\n${printCss}\n` : '';

  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<style>${css}${extra}</style>` +
    '</head><body>' +
    html +
    '</body></html>'
  );
}
