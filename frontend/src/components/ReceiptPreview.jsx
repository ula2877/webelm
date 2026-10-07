import {
  formatTerbilang,
  formatRupiah,
  formatTanggalKwitansi,
  KW_WIDTH_CM,
  KW_HEIGHT_CM,
} from '../utils/receipt';

// Live Preview Kwitansi.
//
// Berbeda dengan surat A4, kwitansi TIDAK memakai header/footer perusahaan
// dan TIDAK punya tabel. Dokumen ini = background cetakan fisik 23 x 9 cm
// (/kwitansi.jpeg) + teks yang di-overlay di koordinat CM.
//
// SEMUA posisi didefinisikan dalam CM (bukan pixel) memakai helper `at()`,
// sehingga:
//   - preview benar di layar beresolusi berapa pun (CSS mm otomatis scaling)
//   - PDF 1:1 karena Chrome headless memakai unit CSS mm yang sama
//   - zoom browser tidak menggeser posisi teks

const BG_IMAGE = '/kwitansi.jpeg';

/** Style posisional absolut dalam CM. */
const at = (xCm, yCm, extra = {}) => ({
  left: `${xCm}cm`,
  top: `${yCm}cm`,
  ...extra,
});

/**
 * Posisi tiap field di atas background kwitansi.
 * Angka dipilih dari inspeksi visual kwitansi.jpeg (794x346 px) lalu
 * dikonversi ke CM lewat fraksi, sehingga aman terhadap peregangan.
 *
 * x_cm = (px / 794) * 23,  y_cm = (px / 346) * 9
 */
export const KW_POSISI = {
  // Angka di bawah dibaca dari kwitansi.jpeg + grid CM (kw-grid.png):
  //   - x_cm = px / 794 * 23,  y_cm = px / 346 * 9
  // Semua nilai ditulis SETELAH teks label tercetak dan TEPAT di garis putus.
  nomor: at(7.4, 1.42),
  diterimaDari: at(9.05, 2.16),
  nominalTerbilang: at(9.6, 2.82),
  // "Untuk pembayaran" punya 4 baris putus (y ~4.05 / 4.9 / 5.6 / 6.3 cm).
  // Lebar dibatasi s/d x=14.7cm supaya teks panjang TIDAK masuk zona
  // penandatangan (x 15.15-21.85cm); kelebihan dipotong terkontrol.
  untukPembayaran: at(9.05, 3.95, { width: '5.65cm' }),
  // Kotak "Jumlah Rp." bergaris miring mulai x~8.5 cm; angka ditulis di dalamnya.
  jumlahRp: at(8.75, 6.95),
  // Blok penandatangan: wadah absolut; ISINYA mengalir statis (company ->
  // no. invoice -> sig-box -> nama -> jabatan) supaya tidak tumpang tindih.
  penandatangan: at(15.15, 4.3, { width: '6.7cm' }),
  // Kota/tanggal di kanan bawah, sejajar kotak Jumlah Rp.
  kotaTanggal: at(15.35, 6.95, { width: '6.3cm' }),
};

export default function ReceiptPreview({ form }) {
  const nominal = Number(form.nominal) || 0;

  return (
    <div id="letter-print-root" className="letter-doc kw-root">
      <div className="kw-sheet" style={{ width: `${KW_WIDTH_CM}cm`, height: `${KW_HEIGHT_CM}cm` }}>
        {/* Background cetakan fisik - full page, di-stretch ke 23x9 cm. */}
        <img src={BG_IMAGE} alt="Kwitansi" className="kw-bg" />

        {/* No. */}
        <p className="kw-value kw-nomor" style={KW_POSISI.nomor}>
          {form.nomor || '-'}
        </p>

        {/* Sudah terima dari */}
        <p className="kw-value kw-bold" style={KW_POSISI.diterimaDari}>
          {form.customerName || '-'}
        </p>

        {/* Banyaknya uang - TERBILANG */}
        <p className="kw-value kw-bold" style={KW_POSISI.nominalTerbilang}>
          {nominal > 0 ? formatTerbilang(nominal) : '-'}
        </p>

        {/* Untuk pembayaran - boleh panjang, turun ke baris berikutnya */}
        <p className="kw-value kw-desc" style={KW_POSISI.untukPembayaran}>
          {form.untukPembayaran || '-'}
        </p>

        {/* Jumlah Rp. - ANGKA */}
        <p className="kw-value kw-bold kw-angka" style={KW_POSISI.jumlahRp}>
          {nominal > 0 ? formatRupiah(nominal) : '-'}
        </p>

        {/* Tempat, Tanggal */}
        <p className="kw-value kw-right" style={KW_POSISI.kotaTanggal}>
          {form.city || 'Surabaya'}, {formatTanggalKwitansi(form.tanggal)}
        </p>

        {/* Blok penandatangan: anak-anaknya blok statis (bukan absolut)
            supaya nama & jabatan tidak menumpuk di satu titik. */}
        <div className="kw-signer" style={KW_POSISI.penandatangan}>
          {form.nomorInvoice ? (
            <p className="kw-signer-line kw-signer-invoice">
              No. Invoice: {form.nomorInvoice}
            </p>
          ) : null}
          <p className="kw-signer-line kw-signer-company">{form.companyName || '-'}</p>
          <div className="kw-sig-box">
            {form.useStamp && form.stampImage ? (
              <img
                src={form.stampImage}
                alt="Stempel"
                className="kw-sig-img"
                style={{
                  transform: `translateX(-50%) translate(${Number(form.stampX) || 0}px, ${
                    Number(form.stampY) || 0
                  }px) scale(${(Number(form.stampZoom) || 100) / 100})`,
                }}
              />
            ) : null}
            {form.useSignature && form.signatureImage ? (
              <img
                src={form.signatureImage}
                alt="Tanda tangan"
                className="kw-sig-img"
                style={{
                  transform: `translateX(-50%) translate(${Number(form.signatureX) || 0}px, ${
                    Number(form.signatureY) || 0
                  }px) scale(${(Number(form.signatureZoom) || 100) / 100})`,
                }}
              />
            ) : null}
          </div>
          <p className="kw-signer-line kw-signer-name">{form.signerName || '-'}</p>
          <p className="kw-signer-line kw-signer-title">{form.signerTitle || '-'}</p>
        </div>
      </div>
    </div>
  );
}
