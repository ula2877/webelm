/**
 * Sesi resize vertikal generik (dipakai editor deskripsi projek).
 *
 * Listener dipasang pada `doc` (biasanya `document`) alih-alih pada handle,
 * supaya drag tetap berjalan walau pointer bergerak keluar dari handle.
 *
 * Fungsi ini sengaja TIDAK membaca state React apa pun: tinggi awal
 * (`startHeight`) dan callback (`onResize`) diberikan sebagai argumen, jadi
 * tidak mungkin terjadi closure basi seperti pada implementasi sebelumnya
 * (yang membaca `isResizing` dari state sehingga nilai selalu `false`).
 *
 * @returns {() => void} fungsi cleanup (melepas listener sesi ini).
 */
export function startVerticalResize({
  doc,
  startClientY,
  startHeight,
  minHeight,
  maxHeight,
  onResize,
  onEnd,
}) {
  const handleMove = (event) => {
    const deltaY = event.clientY - startClientY;
    const next = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
    onResize(next);
  };

  const cleanup = () => {
    doc.removeEventListener('mousemove', handleMove);
    doc.removeEventListener('mouseup', cleanup);
    if (typeof onEnd === 'function') onEnd();
  };

  doc.addEventListener('mousemove', handleMove);
  doc.addEventListener('mouseup', cleanup);

  return cleanup;
}
