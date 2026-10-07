import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeSpecifications } from '../utils/suratJenis';
import {
  BAST_PENUTUP,
  buildBastPembuka,
  buildBastPihak,
  buildBastSerahTerima,
  buildBastSumber,
} from '../utils/bast';
import { LETTER_HEADER_IMAGE, LETTER_FOOTER_IMAGE } from '../utils/letterAssets';

// Live A4 preview untuk Berita Acara Serah Terima.
// Struktur, urutan, dan label mengikuti referensi
// "format berita acara serah terima.docx":
//   judul -> nomor -> paragraf pembuka -> SPK/PO ->
//   PIHAK PERTAMA -> PIHAK KEDUA -> paragraf serah terima ->
//   tabel pekerjaan -> paragraf penutup -> tanda tangan 2 pihak.
//
// Pola paginasi sama dengan SuratJalanPreview/InvoicePreview:
// satu page = satu sheet A4, tabel dipecah per baris,
// header tabel diulang di tiap halaman.

const PX_PER_MM = 96 / 25.4;

const PAGE_LAYOUT = {
  pageHeightMm: 297,
  contentTopOffsetMm: 5,
  contentBottomOffsetMm: 5,
  safetyMm: 2,
  headerAspect: 465 / 2277,
  footerAspect: 165 / 2275,
};

const MEASURED_BLOCKS = [
  'title',
  'pembuka',
  'pihakPertama',
  'pihakKedua',
  'serah',
  'penutup',
  'signature',
];

const frag = (key, node) => <Fragment key={key}>{node}</Fragment>;

const withIndex = (items) => (items || []).map((item, index) => ({ item, index }));

export default function BastPreview({ form }) {
  const headerImg = LETTER_HEADER_IMAGE;
  const footerImg = LETTER_FOOTER_IMAGE;

  const indexedItems = useMemo(() => withIndex(form.items), [form.items]);

  const pihakPertama = useMemo(
    () => buildBastPihak('PIHAK PERTAMA', form.pihakPertamaNama, form.pihakPertamaAlamat),
    [form.pihakPertamaNama, form.pihakPertamaAlamat]
  );
  const pihakKedua = useMemo(
    () => buildBastPihak('PIHAK KEDUA', form.pihakKeduaNama, form.pihakKeduaAlamat),
    [form.pihakKeduaNama, form.pihakKeduaAlamat]
  );

  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const [measurements, setMeasurements] = useState(null);

  const renderTitle = () => (
    <div className="bast-title-block">
      <h1 className="bast-title">BERITA ACARA SERAH TERIMA</h1>
      <p className="bast-nomor">Nomor: {form.nomor || '-'}</p>
    </div>
  );

  const renderPembuka = () => (
    <div>
      <p className="bast-para">{buildBastPembuka(form.tanggal)}</p>
      <p className="bast-para">
        {buildBastSumber(form.nomorSPK, form.tanggalSPK, form.tanggalPelaksanaan)}
      </p>
    </div>
  );

  // Satu blok identitas dipakai ulang untuk PIHAK PERTAMA & PIHAK KEDUA.
  const renderPihak = (party) => (
    <div className="bast-pihak">
      <p className="bast-pihak-heading">{party.heading}</p>
      <p className="bast-pihak-line">
        <span className="bast-pihak-label">Nama Perusahaan</span>
        <span>: {party.namaPerusahaan}</span>
      </p>
      <p className="bast-pihak-line">
        <span className="bast-pihak-label">Alamat</span>
        <span>: {party.alamat}</span>
      </p>
      <p className="bast-pihak-line">{party.penutup}</p>
    </div>
  );

  const renderSerah = () => (
    <p className="bast-para bast-para-justify">
      {buildBastSerahTerima(form.nomorSPK, form.tanggalSPK)}
    </p>
  );

  const renderTable = (rows) => (
    <table className="letter-table bast-table">
      <thead>
        <tr>
          <th className="col-no">No</th>
          <th className="col-komponen">Komponen</th>
          <th className="col-vol">Vol</th>
          <th className="col-satuan">Satuan</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="text-center italic text-gray-400">
              Belum ada pekerjaan
            </td>
          </tr>
        ) : (
          rows.map(({ item, index }) => {
            const specs = normalizeSpecifications(item.spesifikasi);
            return (
              <tr key={item.id || index}>
                <td className="col-no text-center align-top">{index + 1}</td>
                <td className="col-komponen align-top">
                  <p className="font-semibold">{item.nama_komponen || '-'}</p>
                  {specs.length > 0 && (
                    <>
                      <p className="bast-spec-label">Spesifikasi:</p>
                      <ol className="bast-spec-list">
                        {specs.map((spec, i) => (
                          <li key={i}>{spec}</li>
                        ))}
                      </ol>
                    </>
                  )}
                </td>
                <td className="col-vol text-center align-top">{Number(item.volume) || 0}</td>
                <td className="col-satuan align-top">{item.satuan || '-'}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  const renderPenutup = () => <p className="bast-para bast-para-justify">{BAST_PENUTUP}</p>;

  const renderSignature = () => (
    <table className="bast-signature-table">
      <tbody>
        <tr>
          <td>
            <p className="bast-sig-party">PIHAK PERTAMA</p>
            <p className="bast-sig-company">{pihakPertama.namaPerusahaan}</p>
            <div className="bast-sig-box">
              {form.useSignature && form.signatureImage && form.signatureSide === 'first' ? (
                <img
                  src={form.signatureImage}
                  alt="Tanda tangan"
                  style={{
                    transform: `translate(${Number(form.signatureX) || 0}px, ${
                      Number(form.signatureY) || 0
                    }px) scale(${(Number(form.signatureZoom) || 100) / 100})`,
                  }}
                />
              ) : null}
            </div>
            <p className="bast-sig-name">
              {form.pihakPertamaPenandatangan || '(-------------------------------------)'}
            </p>
          </td>
          <td>
            <p className="bast-sig-party">PIHAK KEDUA</p>
            <p className="bast-sig-company">{pihakKedua.namaPerusahaan}</p>
            <div className="bast-sig-box">
              {form.useStamp && form.stampImage ? (
                <img
                  src={form.stampImage}
                  alt="Stempel"
                  style={{
                    transform: `translate(${Number(form.stampX) || 0}px, ${
                      Number(form.stampY) || 0
                    }px) scale(${(Number(form.stampZoom) || 100) / 100})`,
                  }}
                />
              ) : null}
              {form.useSignature && form.signatureImage && form.signatureSide !== 'first' ? (
                <img
                  src={form.signatureImage}
                  alt="Tanda tangan"
                  style={{
                    transform: `translate(${Number(form.signatureX) || 0}px, ${
                      Number(form.signatureY) || 0
                    }px) scale(${(Number(form.signatureZoom) || 100) / 100})`,
                  }}
                />
              ) : null}
            </div>
            <p className="bast-sig-name">{form.signerName || '-'}</p>
            <p className="bast-sig-title">{form.signerTitle || '-'}</p>
          </td>
        </tr>
      </tbody>
    </table>
  );

  const measure = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;

    const headerH = headerRef.current ? headerRef.current.getBoundingClientRect().height : 0;
    const footerH = footerRef.current ? footerRef.current.getBoundingClientRect().height : 0;

    const blocks = {};
    MEASURED_BLOCKS.forEach((key) => {
      const el = root.querySelector(`[data-mblock="${key}"]`);
      if (!el) {
        blocks[key] = 0;
        return;
      }
      const inner = el.firstElementChild || el;
      const cs = window.getComputedStyle(inner);
      const margins = (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      blocks[key] = inner.getBoundingClientRect().height + margins;
    });

    const table = root.querySelector('[data-mtable]');
    let tableHeaderH = 0;
    let rows = [];
    if (table) {
      const thead = table.querySelector('thead');
      tableHeaderH = thead ? thead.getBoundingClientRect().height : 0;
      rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
        tr.getBoundingClientRect().height
      );
    }

    setMeasurements({ headerH, footerH, blocks, tableHeaderH, rows });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, form]);

  useLayoutEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return undefined;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  }, [measure]);

  useLayoutEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const contentMaxPx = measurements
    ? PAGE_LAYOUT.pageHeightMm * PX_PER_MM -
      measurements.headerH -
      measurements.footerH -
      (PAGE_LAYOUT.contentTopOffsetMm + PAGE_LAYOUT.contentBottomOffsetMm) * PX_PER_MM -
      PAGE_LAYOUT.safetyMm * PX_PER_MM
    : Infinity;

  const pages = useMemo(() => {
    // Sebelum selesai mengukur, tampilkan satu halaman agar tidak blank.
    // Setiap node dibungkus frag() supaya punya key unik (dicek React).
    if (!measurements) {
      return [
        [
          frag('title', renderTitle()),
          frag('pembuka', renderPembuka()),
          frag('pihakPertama', renderPihak(pihakPertama)),
          frag('pihakKedua', renderPihak(pihakKedua)),
          frag('serah', renderSerah()),
          frag('table', renderTable(indexedItems)),
          frag('penutup', renderPenutup()),
          frag('signature', renderSignature()),
        ],
      ];
    }

    const { blocks, tableHeaderH, rows } = measurements;
    const out = [];
    let page = { nodes: [], used: 0 };
    out.push(page);

    const newPage = () => {
      page = { nodes: [], used: 0 };
      out.push(page);
    };
    const place = (node, height) => {
      if (page.used + height > contentMaxPx && page.nodes.length) newPage();
      page.nodes.push(node);
      page.used += height;
    };

    place(frag('title', renderTitle()), blocks.title || 0);
    place(frag('pembuka', renderPembuka()), blocks.pembuka || 0);
    place(frag('pihakPertama', renderPihak(pihakPertama)), blocks.pihakPertama || 0);
    place(frag('pihakKedua', renderPihak(pihakKedua)), blocks.pihakKedua || 0);
    place(frag('serah', renderSerah()), blocks.serah || 0);

    if (indexedItems.length === 0) {
      place(frag('table-empty', renderTable([])), tableHeaderH + (rows[0] || 0));
    } else {
      let buffer = [];
      let bufferH = 0;
      const flush = () => {
        if (!buffer.length) return;
        page.nodes.push(frag(`table-${buffer[0].index}`, renderTable(buffer)));
        page.used += tableHeaderH + bufferH;
        buffer = [];
        bufferH = 0;
      };

      indexedItems.forEach((row) => {
        const rowH = rows[row.index] || 0;
        if (
          page.used + tableHeaderH + bufferH + rowH > contentMaxPx &&
          (bufferH > 0 || page.nodes.length)
        ) {
          flush();
          newPage();
        }
        buffer.push(row);
        bufferH += rowH;
      });
      flush();
    }

    place(frag('penutup', renderPenutup()), blocks.penutup || 0);
    place(frag('signature', renderSignature()), blocks.signature || 0);

    return out.map((p) => p.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, contentMaxPx, form, indexedItems, pihakPertama, pihakKedua]);

  return (
    <div
      id="letter-print-root"
      className="letter-doc"
      style={{
        '--letter-header-h': measurements ? `${measurements.headerH}px` : undefined,
        '--letter-footer-h': measurements ? `${measurements.footerH}px` : undefined,
        '--letter-content-pad-top': `calc(${PAGE_LAYOUT.contentTopOffsetMm}mm + var(--letter-header-h, 43mm))`,
        '--letter-content-pad-bottom': `calc(${PAGE_LAYOUT.contentBottomOffsetMm}mm + var(--letter-footer-h, 15.2mm))`,
      }}
    >
      {typeof document !== 'undefined' &&
        createPortal(
          <div ref={measureRef} className="letter-measure letter-doc" aria-hidden="true">
            <img
              ref={headerRef}
              src={headerImg}
              alt=""
              className="letter-measure-header"
              style={{ aspectRatio: `1 / ${PAGE_LAYOUT.headerAspect}` }}
              onLoad={measure}
            />
            <div className="letter-measure-content">
              <div data-mblock="title">{renderTitle()}</div>
              <div data-mblock="pembuka">{renderPembuka()}</div>
              <div data-mblock="pihakPertama">{renderPihak(pihakPertama)}</div>
              <div data-mblock="pihakKedua">{renderPihak(pihakKedua)}</div>
              <div data-mblock="serah">{renderSerah()}</div>
              <div data-mtable="true">{renderTable(indexedItems)}</div>
              <div data-mblock="penutup">{renderPenutup()}</div>
              <div data-mblock="signature">{renderSignature()}</div>
            </div>
            <img
              ref={footerRef}
              src={footerImg}
              alt=""
              className="letter-measure-footer"
              style={{ aspectRatio: `1 / ${PAGE_LAYOUT.footerAspect}` }}
              onLoad={measure}
            />
          </div>,
          document.body
        )}

      <div className="a4-document">
        {pages.map((nodes, i) => (
          <div className="a4-page" key={i}>
            <img
              src={headerImg}
              alt="Header surat"
              className="a4-page-header"
              style={{ aspectRatio: `1 / ${PAGE_LAYOUT.headerAspect}` }}
            />
            <div className="a4-page-content letter-doc">{nodes}</div>
            <img
              src={footerImg}
              alt="Footer surat"
              className="a4-page-footer"
              style={{ aspectRatio: `1 / ${PAGE_LAYOUT.footerAspect}` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
