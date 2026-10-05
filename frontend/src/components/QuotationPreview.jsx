import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildQuotationTotals,
  computeItemSubtotal,
  normalizeSpecifications,
  formatDocNumber,
  formatLongDateID,
} from '../utils/quotation';
import { LETTER_HEADER_IMAGE, LETTER_FOOTER_IMAGE } from '../utils/letterAssets';

// Live A4 preview of the quotation letter.
//
// The document is rendered as DISCRETE A4 pages (210mm x 297mm). A hidden
// measuring container is used to paginate the content: text blocks are kept
// intact and the item table is split row by row (its header repeats on each
// page). This makes the on-screen preview match the printed/PDF output, where
// each .a4-page maps to exactly one A4 sheet.
//
// Nothing here is persisted - it is driven purely by the form state.

const PX_PER_MM = 96 / 25.4;

// Single global A4 layout configuration, used by BOTH the CSS padding of every
// page and the page-break calculation, so the two can never drift apart.
// Every page (1, 2, 3, ...) uses exactly these values - change one here and all
// pages follow automatically.
const PAGE_LAYOUT = {
  pageHeightMm: 297, // A4 height
  contentTopOffsetMm: 5, // visible gap: header bottom -> first content line
  contentBottomOffsetMm: 5, // safe gap: content -> footer top
  safetyMm: 2, // small anti-rounding reserve
  // Natural aspect ratios of the header/footer artwork, used to reserve their
  // space even before the images load (so a late-loading image can't shift the
  // content into the header).
  headerAspect: 465 / 2277,
  footerAspect: 165 / 2275,
};
const MEASURED_BLOCKS = ['meta', 'recipient', 'paragraph', 'totals', 'notes', 'closing', 'signature'];

const frag = (key, node) => <Fragment key={key}>{node}</Fragment>;

export default function QuotationPreview({ form }) {
  const notes = (form.notes || []).filter((n) => String(n).trim() !== '');
  const longDate = formatLongDateID(form.tanggal);
  const headerImg = LETTER_HEADER_IMAGE;
  const footerImg = LETTER_FOOTER_IMAGE;

  const { total, ppn, grandTotal, dp, remaining } = buildQuotationTotals(
    form.items,
    form.usePPN,
    form.ppnRate,
    form.useDP,
    form.dpRate
  );

  const itemsWithIndex = useMemo(
    () => (form.items || []).map((item, index) => ({ item, index })),
    [form.items]
  );

  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const [measurements, setMeasurements] = useState(null);

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
      // Margins live on the inner element; the wrapper may collapse them.
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
      rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.getBoundingClientRect().height);
    }

    setMeasurements({ headerH, footerH, blocks, tableHeaderH, rows });
  }, []);

  // Re-measure whenever the content changes.
  useLayoutEffect(() => {
    measure();
  }, [measure, form]);

  // Re-measure once web fonts are ready (font metrics can shift block heights).
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

  // Re-measure on resize.
  useLayoutEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Usable content height per page (identical for every page):
  //   A4 height - header - contentTopOffset - footer - contentBottomOffset
  const contentMaxPx = measurements
    ? PAGE_LAYOUT.pageHeightMm * PX_PER_MM -
      measurements.headerH -
      measurements.footerH -
      (PAGE_LAYOUT.contentTopOffsetMm + PAGE_LAYOUT.contentBottomOffsetMm) * PX_PER_MM -
      PAGE_LAYOUT.safetyMm * PX_PER_MM
    : Infinity;

  // --------------------------------------------------------------- blocks
  const renderMeta = () => (
    <div className="letter-meta">
      <p className="text-right">{form.city || '-'}, {longDate}</p>
      <table className="letter-meta-table">
        <tbody>
          <tr>
            <td className="w-[22mm]">No Surat</td>
            <td className="w-[3mm]">:</td>
            <td>{form.nomor || '-'}</td>
          </tr>
          <tr>
            <td>Lampiran</td>
            <td>:</td>
            <td>{form.attachment || '-'}</td>
          </tr>
          <tr>
            <td>Hal</td>
            <td>:</td>
            <td>{form.subject || '-'}</td>
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

  const renderParagraph = () => (
    <p className="letter-paragraph">
      {`Berikut kami berikan penawaran harga untuk ${form.systemName || '-'} sesuai dengan permintaan anda kepada kami:`}
    </p>
  );

  const renderTable = (rows, measureAttr) => (
    <table className="letter-table" {...(measureAttr ? { 'data-mtable': 'true' } : {})}>
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
          <tr>
            <td>Total</td>
            <td className="text-right">{formatDocNumber(total)}</td>
          </tr>
          <tr>
            <td>PPN{form.usePPN ? ` (${Number(form.ppnRate) || 0}%)` : ''}</td>
            <td className="text-right">{formatDocNumber(ppn)}</td>
          </tr>
          <tr className="grand">
            <td>Grand Total</td>
            <td className="text-right">{formatDocNumber(grandTotal)}</td>
          </tr>
          {form.useDP && (
            <>
              <tr>
                <td>DP ({Number(form.dpRate) || 0}%)</td>
                <td className="text-right">{formatDocNumber(dp)}</td>
              </tr>
              <tr>
                <td>Sisa Pembayaran</td>
                <td className="text-right">{formatDocNumber(remaining)}</td>
              </tr>
            </>
          )}
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

  const renderClosing = () => (
    <p className="letter-closing">
      Demikian surat penawaran ini kami buat, atas perhatiannya dan kerjasamanya kami ucapkan
      banyak terima kasih.
    </p>
  );

  const renderSignature = () => (
    <div className="letter-signature">
      <p>Hormat Kami,</p>
      <p className="font-bold">{form.companyName || '-'}</p>
      <div className="letter-signature-box">
        {form.useStamp && form.stampImage ? (
          <img
            src={form.stampImage}
            alt="Stempel"
            style={{
              transform: `translate(${Number(form.stampX) || 0}px, ${Number(form.stampY) || 0}px) scale(${(Number(form.stampZoom) || 100) / 100})`,
            }}
          />
        ) : null}
        {form.useSignature && form.signatureImage ? (
          <img
            src={form.signatureImage}
            alt="Tanda tangan"
            style={{
              transform: `translate(${Number(form.signatureX) || 0}px, ${Number(form.signatureY) || 0}px) scale(${(Number(form.signatureZoom) || 100) / 100})`,
            }}
          />
        ) : null}
      </div>
      <p className="signer-name">{form.signerName || '-'}</p>
      <p>{form.signerTitle || '-'}</p>
    </div>
  );

  // --------------------------------------------------------------- pagination
  const pages = useMemo(() => {
    // Before measurement is available, show everything on one page. The layout
    // effect measures synchronously before paint, so this is never visible.
    if (!measurements) {
      return [[
        frag('meta', renderMeta()),
        frag('recipient', renderRecipient()),
        frag('paragraph', renderParagraph()),
        frag('table', renderTable(itemsWithIndex, false)),
        frag('totals', renderTotals()),
        ...(notes.length ? [frag('notes', renderNotes())] : []),
        frag('closing', renderClosing()),
        frag('signature', renderSignature()),
      ]];
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
    place(frag('paragraph', renderParagraph()), blocks.paragraph || 0);

    if (itemsWithIndex.length === 0) {
      place(frag('table-empty', renderTable([], false)), tableHeaderH + (rows[0] || 0));
    } else {
      let buffer = [];
      let bufferH = 0;
      const flush = () => {
        if (!buffer.length) return;
        page.nodes.push(frag(`table-${buffer[0].index}`, renderTable(buffer, false)));
        page.used += tableHeaderH + bufferH;
        buffer = [];
        bufferH = 0;
      };

      itemsWithIndex.forEach((row) => {
        const rowH = rows[row.index] || 0;
        // A table segment needs its header plus the row to fit on the page.
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
      {/* Hidden measuring container used to paginate the content.
          Rendered via a portal to document.body so it lives OUTSIDE the
          preview zoom wrapper (.letter-zoom). CSS `zoom` scales
          getBoundingClientRect() values, which would corrupt the measured
          header/footer/block heights and break both the page paddings
          (--letter-header-h / --letter-footer-h are mixed with mm offsets)
          and the page-break math (contentMaxPx is computed from unzoomed
          mm constants). Measuring at 100% keeps every value consistent. */}
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
              <div data-mblock="paragraph">{renderParagraph()}</div>
              {renderTable(itemsWithIndex, true)}
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

      {/* Visible discrete A4 pages. */}
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
