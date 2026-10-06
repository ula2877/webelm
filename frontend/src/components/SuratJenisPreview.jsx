import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildSuratJenisTotals,
  computeItemSubtotal,
  normalizeSpecifications,
  formatDocNumber,
  formatLongDateID,
} from '../utils/suratJenis';
import { LETTER_HEADER_IMAGE, LETTER_FOOTER_IMAGE } from '../utils/letterAssets';

// Live A4 preview untuk surat generik (Surat Jalan, BAST,
// Surat Permohonan Pemeriksaan/Pembayaran, Kuitansi).
// Pola sama dengan QuotationPreview: setiap page = satu
// A4 sheet. Komponen ini SATU-SATUNYA renderer - Live
// Preview dan PDF-from-HTML memakai DOM yang sama.

const PX_PER_MM = 96 / 25.4;

const PAGE_LAYOUT = {
  pageHeightMm: 297,
  contentTopOffsetMm: 5,
  contentBottomOffsetMm: 5,
  safetyMm: 2,
  headerAspect: 465 / 2277,
  footerAspect: 165 / 2275,
};
const MEASURED_BLOCKS = ['meta', 'recipient', 'totals', 'notes', 'closing', 'signature'];

const frag = (key, node) => <Fragment key={key}>{node}</Fragment>;

export default function SuratJenisPreview({ form, title }) {
  const notes = (form.notes || []).filter((n) => String(n).trim() !== '');
  const longDate = formatLongDateID(form.tanggal);
  const headerImg = LETTER_HEADER_IMAGE;
  const footerImg = LETTER_FOOTER_IMAGE;
  const docTitle = title || 'SURAT';

  const { total } = buildSuratJenisTotals(form.items);

  const itemsWithIndex = useMemo(
    () => (form.items || []).map((item, index) => ({ item, index })),
    [form.items]
  );

  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const [measurements, setMeasurements] = useState(null);

  const renderMeta = () => (
    <div className="letter-meta">
      <h1 className="invoice-title">{docTitle}</h1>
      <table className="letter-meta-table">
        <tbody>
          <tr>
            <td className="w-[32mm]">Nomor Surat</td>
            <td className="w-[3mm]">:</td>
            <td>{form.nomor || '-'}</td>
          </tr>
          <tr>
            <td>Tanggal</td>
            <td>:</td>
            <td>{longDate}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderRecipient = () => (
    <div className="letter-recipient">
      <p>Kepada Yth:</p>
      <p className="font-bold">{form.customerName || '-'}</p>
      <p className="whitespace-pre-line">{form.customerAddress || '-'}</p>
    </div>
  );

  const renderTable = (rows) => (
    <table className="letter-table">
      <thead>
        <tr>
          <th className="col-no">No</th>
          <th className="col-komponen">Komponen</th>
          <th className="col-harga">Harga</th>
          <th className="col-vol">Vol</th>
          <th className="col-satuan">Satuan</th>
          <th className="col-subtotal">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="text-center italic text-gray-400">
              Belum ada komponen
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
                    <ol className="letter-spec-list">
                      {specs.map((spec, i) => (
                        <li key={i}>{spec}</li>
                      ))}
                    </ol>
                  )}
                </td>
                <td className="col-harga text-right align-top whitespace-nowrap">
                  {formatDocNumber(item.harga_satuan)}
                </td>
                <td className="col-vol text-center align-top">{Number(item.volume) || 0}</td>
                <td className="col-satuan align-top">{item.satuan || '-'}</td>
                <td className="col-subtotal text-right align-top whitespace-nowrap">
                  {formatDocNumber(computeItemSubtotal(item))}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  const renderTotals = () => (
    <div className="letter-totals">
      <table className="letter-totals-table">
        <tbody>
          <tr className="grand">
            <td>Total</td>
            <td className="text-right">{formatDocNumber(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderNotes = () => (
    <div className="letter-notes">
      <p className="font-semibold">Keterangan:</p>
      <ol className="letter-spec-list">
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ol>
    </div>
  );

  const renderClosing = () => <p className="letter-closing">Hormat Kami,</p>;

  const renderSignature = () => (
    <div className="letter-signature">
      <p className="font-bold">{form.companyName || '-'}</p>
      <div className="letter-signature-box">
        {form.useSignature && form.signatureImage ? (
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
      <p className="signer-name">{form.signerName || '-'}</p>
      <p>{form.signerTitle || '-'}</p>
    </div>
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
    if (!measurements) {
      return [
        [
          frag('meta', renderMeta()),
          frag('recipient', renderRecipient()),
          frag('table', renderTable(itemsWithIndex)),
          frag('totals', renderTotals()),
          ...(notes.length ? [frag('notes', renderNotes())] : []),
          frag('closing', renderClosing()),
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

    place(frag('meta', renderMeta()), blocks.meta || 0);
    place(frag('recipient', renderRecipient()), blocks.recipient || 0);

    if (itemsWithIndex.length === 0) {
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

      itemsWithIndex.forEach((row) => {
        const rowH = rows[row.index] || 0;
        if (page.used + tableHeaderH + bufferH + rowH > contentMaxPx && (bufferH > 0 || page.nodes.length)) {
          flush();
          newPage();
        }
        buffer.push(row);
        bufferH += rowH;
      });
      flush();
    }

    place(frag('totals', renderTotals()), blocks.totals || 0);
    if (notes.length) place(frag('notes', renderNotes()), blocks.notes || 0);
    place(frag('closing', renderClosing()), blocks.closing || 0);
    place(frag('signature', renderSignature()), blocks.signature || 0);

    return out.map((p) => p.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, contentMaxPx, form, itemsWithIndex, notes.length]);

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
              <div data-mblock="meta">{renderMeta()}</div>
              <div data-mblock="recipient">{renderRecipient()}</div>
              <div data-mtable="true">{renderTable(itemsWithIndex)}</div>
              <div data-mblock="totals">{renderTotals()}</div>
              <div data-mblock="notes">{renderNotes()}</div>
              <div data-mblock="closing">{renderClosing()}</div>
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
